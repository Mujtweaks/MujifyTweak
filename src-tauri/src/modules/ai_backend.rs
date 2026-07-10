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

#[derive(Serialize, Clone)]
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

#[derive(Serialize)]
struct TavilyReq {
    query: String,
    max_results: u32,
    include_answer: bool,
    search_depth: String,
}

/// Real web search via Tavily. Returns a compact, source-cited results block, or
/// `None` on ANY failure (no key, network error, bad response) — so the assistant
/// silently continues without search rather than ever inventing "results".
async fn tavily_search(client: &reqwest::Client, query: &str) -> Option<String> {
    let key = super::config::get_api_key("tavily".to_string())?;
    let resp = client
        .post("https://api.tavily.com/search")
        .header("Authorization", format!("Bearer {key}"))
        .header("Content-Type", "application/json")
        .json(&TavilyReq {
            query: query.chars().take(400).collect(),
            max_results: 5,
            include_answer: true,
            search_depth: "basic".into(),
        })
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        super::logger::warn(format!("web search: tavily returned {}", resp.status()));
        return None;
    }
    let v: serde_json::Value = resp.json().await.ok()?;
    let mut out = String::new();
    if let Some(ans) = v["answer"].as_str() {
        if !ans.trim().is_empty() {
            out.push_str(&format!("Summary: {}\n\n", ans.trim()));
        }
    }
    if let Some(results) = v["results"].as_array() {
        for (i, r) in results.iter().take(5).enumerate() {
            let title = r["title"].as_str().unwrap_or("").trim();
            let url = r["url"].as_str().unwrap_or("").trim();
            let content: String = r["content"].as_str().unwrap_or("").chars().take(300).collect();
            out.push_str(&format!("[{}] {}\n{}\n{}\n\n", i + 1, title, url, content.trim()));
        }
    }
    if out.trim().is_empty() {
        None
    } else {
        Some(out)
    }
}

/// Streams an AI response from NVIDIA NIM to the frontend via `ai_chunk`
/// (incremental text) events, closed by a single `ai_done`. Called only from
/// AIAssistant.tsx on an explicit user send — never automatically.
#[tauri::command]
pub async fn ai_chat(
    app: tauri::AppHandle,
    messages: Vec<AiMessage>,
    system_prompt: String,
    web_search: bool,
) -> Result<(), String> {
    let key = super::config::get_api_key("nvidia".to_string())
        .ok_or_else(|| "The AI service isn't configured right now.".to_string())?;

    let client = reqwest::Client::new();

    // Optional live web search — real Tavily results injected into context so the
    // model answers current questions with real sources. Fails silently (no fake
    // results ever). The UI shows a "searching the web" state via `ai_searching`.
    let mut system_prompt = system_prompt;
    if web_search {
        if let Some(last_user) = messages.iter().rev().find(|m| m.role == "user") {
            let _ = app.emit("ai_searching", ());
            if let Some(results) = tavily_search(&client, &last_user.content).await {
                system_prompt = format!(
                    "{system_prompt}\n\nLIVE WEB SEARCH RESULTS — a real internet search was just run for the user's question. Use these for anything current (versions, prices, news, latest drivers, game updates), and cite the source URLs. If they don't actually answer the question, say so honestly and do NOT invent facts:\n{results}"
                );
            }
        }
    }

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

    // The free endpoint occasionally returns a transient "ResourceExhausted"
    // (shared worker at capacity). Retry a few times with a short backoff before
    // giving up — but only while nothing has been streamed to the UI yet. If a
    // model slug is rejected (400/404), fall through to the next known-good model
    // so a catalog change never leaves the assistant dead.
    const MAX_ATTEMPTS: u32 = 4;
    for (mi, model) in NIM_MODELS.iter().enumerate() {
        let body = NimRequest {
            model: (*model).to_string(),
            messages: nim_messages.clone(),
            stream: true,
            max_tokens: 1024,
            temperature: 0.7,
        };
        for attempt in 1..=MAX_ATTEMPTS {
            match stream_once(&app, &client, &key, &body).await {
                Ok(()) => return Ok(()),
                // A rejected model → try the next model in the list (if any).
                Err(e) if e.try_next_model && mi + 1 < NIM_MODELS.len() => {
                    super::logger::warn(format!("ai: model '{model}' rejected, trying next"));
                    break;
                }
                Err(e) if e.retriable && attempt < MAX_ATTEMPTS => {
                    tokio::time::sleep(std::time::Duration::from_millis(500 * attempt as u64))
                        .await;
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
    }
    Err(busy_msg())
}

/// Chat models tried in order. Slugs on build.nvidia.com change over time, so a
/// rejected model falls through to the next. Verify the primary at
/// build.nvidia.com if the AI ever stops responding.
const NIM_MODELS: &[&str] = &[
    "nvidia/llama-3.3-nemotron-super-49b-v1",
    "meta/llama-3.3-70b-instruct",
];

struct AiErr {
    /// True if retrying the whole request may succeed (nothing streamed yet).
    retriable: bool,
    /// True when the failure looks like a bad/unknown model slug (400/404) so
    /// the caller should try the next model rather than give up.
    try_next_model: bool,
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
        .map_err(|e| AiErr {
            retriable: true,
            try_next_model: false,
            message: format!("Network error: {e}"),
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let err_body = response.text().await.unwrap_or_default();
        let code = status.as_u16();
        let retriable = code == 429 || code == 503 || err_body.contains("ResourceExhausted");
        // 400/404 usually means the model slug is wrong/retired — try the next.
        let try_next_model = code == 400 || code == 404;
        let message = if retriable {
            busy_msg()
        } else {
            // Surface the real status + a snippet of the body so a failure is
            // diagnosable instead of an opaque "400". (No key is ever in here.)
            let snippet: String = err_body.chars().take(240).collect();
            format!("Mujify AI error {status}: {}", snippet.trim())
        };
        return Err(AiErr { retriable, try_next_model, message });
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
                    try_next_model: false,
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
                    return Err(AiErr { retriable, try_next_model: false, message });
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
