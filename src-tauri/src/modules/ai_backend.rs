//! AI Assistant backend — NVIDIA NIM (Nemotron) chat + local session persistence.
//!
//! The chat request is made from Rust, not the WebView, so the NVIDIA API key
//! never enters the JS bundle and there are no CORS/CSP constraints. The reply
//! streams back to the frontend incrementally: each token delta is emitted as an
//! `ai_chunk` event and a single `ai_done` closes the turn. This is a
//! read/generate path only — it changes nothing on the PC.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Emitter;

/// One turn of the conversation as persisted to disk / sent to the model.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AiMessage {
    pub role: String, // "user" | "assistant" | "system"
    pub content: String,
    pub timestamp: Option<u64>,
}

fn session_path() -> Option<PathBuf> {
    let base = std::env::var("APPDATA").ok()?;
    let dir = PathBuf::from(base).join("MujifyTweaks");
    fs::create_dir_all(&dir).ok()?;
    Some(dir.join("ai_session.json"))
}

/// Persist the whole chat history so it survives an app restart (not just a tab
/// switch). Best-effort — a write failure is non-fatal.
#[tauri::command]
pub fn save_ai_session(messages: Vec<AiMessage>) {
    if let Some(path) = session_path() {
        if let Ok(json) = serde_json::to_string_pretty(&messages) {
            let _ = fs::write(path, json);
        }
    }
}

/// Load the persisted chat history, or `None` on first launch.
#[tauri::command]
pub fn load_ai_session() -> Option<Vec<AiMessage>> {
    let path = session_path()?;
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

#[derive(Serialize)]
struct NimMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct NimRequest {
    model: String,
    messages: Vec<NimMessage>,
    stream: bool,
    max_tokens: u32,
    temperature: f32,
}

/// Streams an AI response from NVIDIA NIM to the frontend via `ai_chunk`
/// (incremental text) events, closed by a single `ai_done`. Called only from
/// AIAssistant.tsx on an explicit user send — never automatically.
#[tauri::command]
pub async fn ai_chat(
    app: tauri::AppHandle,
    messages: Vec<AiMessage>,
    system_prompt: String,
) -> Result<(), String> {
    let key = super::config::get_api_key("nvidia".to_string())
        .ok_or_else(|| "The AI service isn't configured right now.".to_string())?;

    // Nemotron 3 Ultra on build.nvidia.com (OpenAI-compatible chat completions).
    let model = "nvidia/nemotron-3-ultra-550b-a55b";

    let mut nim_messages: Vec<NimMessage> = Vec::with_capacity(messages.len() + 1);
    nim_messages.push(NimMessage {
        role: "system".into(),
        content: system_prompt,
    });
    for m in &messages {
        nim_messages.push(NimMessage {
            role: m.role.clone(),
            content: m.content.clone(),
        });
    }

    let body = NimRequest {
        model: model.into(),
        messages: nim_messages,
        stream: true,
        max_tokens: 1024,
        temperature: 0.7,
    };

    let client = reqwest::Client::new();

    // The free endpoint occasionally returns a transient "ResourceExhausted"
    // (shared worker at capacity). Retry a few times with a short backoff before
    // giving up — but only while nothing has been streamed to the UI yet.
    const MAX_ATTEMPTS: u32 = 4;
    for attempt in 1..=MAX_ATTEMPTS {
        match stream_once(&app, &client, &key, &body).await {
            Ok(()) => return Ok(()),
            Err(e) if e.retriable && attempt < MAX_ATTEMPTS => {
                tokio::time::sleep(std::time::Duration::from_millis(500 * attempt as u64)).await;
                continue;
            }
            Err(e) => {
                // Log the failure (never the API key — it's only ever in the
                // request header, never in this message) for local bug reports.
                super::logger::warn(format!("ai: request failed: {}", e.message));
                return Err(e.message);
            }
        }
    }
    Err(busy_msg())
}

struct AiErr {
    /// True if retrying the whole request may succeed (nothing streamed yet).
    retriable: bool,
    message: String,
}

fn busy_msg() -> String {
    "Mujify AI is busy right now — please try again in a moment.".to_string()
}

/// One request + SSE stream attempt. Emits `ai_chunk`/`ai_done`. Returns a
/// retriable error only when the failure happened before any text was streamed,
/// so a retry can't duplicate content the user already saw.
async fn stream_once(
    app: &tauri::AppHandle,
    client: &reqwest::Client,
    key: &str,
    body: &NimRequest,
) -> Result<(), AiErr> {
    let mut response = client
        .post("https://integrate.api.nvidia.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {key}"))
        .header("Content-Type", "application/json")
        .json(body)
        .send()
        .await
        .map_err(|e| AiErr { retriable: true, message: format!("Network error: {e}") })?;

    if !response.status().is_success() {
        let status = response.status();
        let err_body = response.text().await.unwrap_or_default();
        let code = status.as_u16();
        let retriable = code == 429 || code == 503 || err_body.contains("ResourceExhausted");
        let message = if retriable {
            busy_msg()
        } else {
            format!("The AI service returned an error ({status}).")
        };
        return Err(AiErr { retriable, message });
    }

    // Parse the SSE stream incrementally so the UI shows a live typing effect.
    // Chunks can split mid-line, so buffer raw bytes and decode complete lines
    // ('\n' never falls inside a UTF-8 multibyte sequence).
    let mut buf: Vec<u8> = Vec::new();
    let mut emitted = false;
    loop {
        let chunk = match response.chunk().await {
            Ok(Some(c)) => c,
            Ok(None) => break, // stream ended without an explicit [DONE]
            Err(e) => {
                return Err(AiErr {
                    retriable: !emitted,
                    message: format!("Stream error: {e}"),
                })
            }
        };
        buf.extend_from_slice(&chunk);

        while let Some(nl) = buf.iter().position(|&b| b == b'\n') {
            let line_bytes: Vec<u8> = buf.drain(..=nl).collect();
            let line = String::from_utf8_lossy(&line_bytes);
            let line = line.trim();
            let data = match line.strip_prefix("data:") {
                Some(d) => d.trim(),
                None => continue, // SSE comments / blank separators
            };
            if data == "[DONE]" {
                let _ = app.emit("ai_done", ());
                return Ok(());
            }
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                // A mid-stream error (e.g. transient "ResourceExhausted") arrives
                // as a data line even on HTTP 200.
                if let Some(err_msg) = parsed["error"]["message"].as_str() {
                    let rate_limited =
                        err_msg.contains("ResourceExhausted") || err_msg.contains("limit");
                    let retriable = !emitted && rate_limited;
                    let message = if rate_limited {
                        busy_msg()
                    } else {
                        format!("Mujify AI hit an error: {err_msg}")
                    };
                    return Err(AiErr { retriable, message });
                }
                if let Some(delta) = parsed["choices"][0]["delta"]["content"].as_str() {
                    if !delta.is_empty() {
                        let _ = app.emit("ai_chunk", delta);
                        emitted = true;
                    }
                }
            }
        }
    }

    let _ = app.emit("ai_done", ());
    Ok(())
}
