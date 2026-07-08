//! Bandwidth speed test (read-only measurement).
//!
//! Downloads then uploads a fixed payload against Cloudflare's public speed
//! endpoints and reports Mbps. Runs from Rust via reqwest (no CORS/CSP issues).
//! A short warm-up request opens the keep-alive connection first so the timed
//! transfer excludes TLS/handshake. This measures throughput only — it changes
//! nothing on the PC, and reports an honest error rather than a fake number if a
//! transfer fails.

use std::time::{Duration, Instant};

const UP_BYTES: usize = 5_000_000; // 5 MB upload sample
const DOWN_URL: &str = "https://speed.cloudflare.com/__down?bytes=20000000"; // 20 MB
const UP_URL: &str = "https://speed.cloudflare.com/__up";
const WARMUP_URL: &str = "https://speed.cloudflare.com/__down?bytes=1000";

/// Megabits per second for `bytes` transferred over `secs` seconds.
fn mbps(bytes: usize, secs: f64) -> f32 {
    ((bytes as f64 * 8.0) / secs / 1_000_000.0) as f32
}

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(40))
        .build()
        .map_err(|e| e.to_string())
}

/// Open the connection once so the measured transfer reuses it (excludes setup).
async fn warmup(client: &reqwest::Client) {
    if let Ok(r) = client.get(WARMUP_URL).send().await {
        let _ = r.bytes().await;
    }
}

/// Measure download throughput in Mbps. Read-only.
#[tauri::command]
pub async fn speed_test_download() -> Result<f32, String> {
    let client = build_client()?;
    warmup(&client).await;

    let start = Instant::now();
    let resp = client
        .get(DOWN_URL)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    let secs = start.elapsed().as_secs_f64();
    if secs <= 0.0 || bytes.is_empty() {
        return Err("no data received".into());
    }
    Ok(mbps(bytes.len(), secs))
}

/// Measure upload throughput in Mbps. Read-only.
#[tauri::command]
pub async fn speed_test_upload() -> Result<f32, String> {
    let client = build_client()?;
    warmup(&client).await;

    let payload = vec![0u8; UP_BYTES];
    let start = Instant::now();
    let resp = client
        .post(UP_URL)
        .body(payload)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let _ = resp.bytes().await; // drain the response
    let secs = start.elapsed().as_secs_f64();
    if secs <= 0.0 {
        return Err("timing error".into());
    }
    Ok(mbps(UP_BYTES, secs))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mbps_math_is_correct() {
        // 1,000,000 bytes in 1s = 8 Mbps; 12.5 MB in 1s = 100 Mbps.
        assert!((mbps(1_000_000, 1.0) - 8.0).abs() < 0.01);
        assert!((mbps(12_500_000, 1.0) - 100.0).abs() < 0.1);
    }
}
