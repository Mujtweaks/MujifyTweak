//! Checkpoint 6 — FrameTimeMonitor.
//!
//! Spawns the bundled PresentMon sidecar (≥2.5.1, underscore flags) targeting
//! the active game, parses its CSV stream header-driven (finds the
//! `msBetweenPresents` column by name so column-order changes can't break it),
//! and emits real `frame_stats` every second: avg FPS, 1% / 0.1% lows, frame
//! time, and stability. Latest sample is stashed for the benchmark. Starts on
//! game launch, stops on exit. No admin needed for same-account game processes.
//!
//! Every number here is measured from real present events — never synthesized.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

use super::game_detector::GameInfo;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FrameStats {
    pub avg_fps: f32,
    pub one_percent_low: f32,
    pub point_one_percent_low: f32,
    pub avg_frame_time_ms: f32,
    pub frame_time_stability: f32,
}

static CURRENT_CHILD: Mutex<Option<CommandChild>> = Mutex::new(None);
static LATEST_FRAME: Mutex<Option<FrameStats>> = Mutex::new(None);

pub fn latest_frame() -> Option<FrameStats> {
    LATEST_FRAME.lock().unwrap().clone()
}

/// Column index of `msBetweenPresents` within a PresentMon v1 CSV header.
fn frame_time_column(header: &str) -> Option<usize> {
    header
        .split(',')
        .position(|c| c.trim().eq_ignore_ascii_case("msBetweenPresents"))
}

/// Parse one CSV data row's frame time (ms) at the known column index.
fn parse_frame_time(line: &str, col: usize) -> Option<f32> {
    line.split(',')
        .nth(col)
        .and_then(|v| v.trim().parse::<f32>().ok())
        .filter(|v| *v > 0.0 && *v < 1000.0) // ignore absurd values
}

/// FPS from the average of the worst `fraction` of frames (CapFrameX-style
/// "N% low"): sort slowest-first, take the worst k frames, average them.
fn low_fps(sorted_desc: &[f32], fraction: f32) -> f32 {
    if sorted_desc.is_empty() {
        return 0.0;
    }
    let k = ((sorted_desc.len() as f32 * fraction).round() as usize).max(1);
    let worst = &sorted_desc[0..k.min(sorted_desc.len())];
    let mean = worst.iter().sum::<f32>() / worst.len() as f32;
    if mean > 0.0 {
        1000.0 / mean
    } else {
        0.0
    }
}

/// Compute real frame stats from a window of frame times (ms).
pub fn compute_frame_stats(frame_times: &[f32]) -> Option<FrameStats> {
    if frame_times.len() < 2 {
        return None;
    }
    let n = frame_times.len() as f32;
    let mean = frame_times.iter().sum::<f32>() / n;
    let avg_fps = if mean > 0.0 { 1000.0 / mean } else { 0.0 };

    // Slowest frames first — the worst 1% / 0.1% drive the low-FPS figures.
    let mut sorted_desc = frame_times.to_vec();
    sorted_desc.sort_by(|a, b| b.partial_cmp(a).unwrap());

    let variance = frame_times.iter().map(|v| (v - mean).powi(2)).sum::<f32>() / n;

    Some(FrameStats {
        avg_fps,
        one_percent_low: low_fps(&sorted_desc, 0.01),
        point_one_percent_low: low_fps(&sorted_desc, 0.001),
        avg_frame_time_ms: mean,
        frame_time_stability: variance.sqrt(),
    })
}

/// Called by GameDetector whenever the active game changes. Stops any running
/// capture, and starts a new one if a game is now active.
pub fn on_active_game_change(app: &AppHandle, active: &Option<GameInfo>) {
    stop_capture();
    if let Some(game) = active {
        if !game.exe.is_empty() {
            start_capture(app.clone(), game.exe.clone());
        }
    }
}

fn stop_capture() {
    if let Some(child) = CURRENT_CHILD.lock().unwrap().take() {
        let _ = child.kill();
    }
    *LATEST_FRAME.lock().unwrap() = None;
}

fn start_capture(app: AppHandle, exe: String) {
    let sidecar = match app.shell().sidecar("PresentMon") {
        Ok(cmd) => cmd,
        Err(_) => return, // sidecar missing (e.g. some dev setups) → FPS stays "--"
    };
    // A dedicated session name so --stop_existing_session only ever touches OUR
    // own prior capture — never another tool's (e.g. Intel Arc Control also runs
    // a PresentMon ETW session on this machine).
    let sidecar = sidecar.args([
        "--process_name",
        &exe,
        "--output_stdout",
        "--v1_metrics",
        "--session_name",
        "MujifyTweaksPM",
        "--stop_existing_session",
        "--terminate_on_proc_exit",
        "--no_top",
    ]);

    let (mut rx, child) = match sidecar.spawn() {
        Ok(pair) => pair,
        Err(_) => return,
    };
    *CURRENT_CHILD.lock().unwrap() = Some(child);

    tauri::async_runtime::spawn(async move {
        let mut col: Option<usize> = None;
        let mut window: Vec<f32> = Vec::with_capacity(600);
        let mut last_emit = Instant::now();

        while let Some(event) = rx.recv().await {
            let CommandEvent::Stdout(bytes) = event else {
                continue;
            };
            let line = String::from_utf8_lossy(&bytes);
            let line = line.trim();
            if line.is_empty() || !line.contains(',') {
                continue;
            }

            // First comma-bearing line is the header.
            if col.is_none() {
                col = frame_time_column(line);
                continue;
            }
            if let Some(ft) = parse_frame_time(line, col.unwrap()) {
                window.push(ft);
            }
            if window.len() > 600 {
                let drop = window.len() - 600;
                window.drain(0..drop);
            }

            if last_emit.elapsed() >= Duration::from_secs(1) {
                if let Some(stats) = compute_frame_stats(&window) {
                    *LATEST_FRAME.lock().unwrap() = Some(stats.clone());
                    let _ = app.emit("frame_stats", &stats);
                }
                last_emit = Instant::now();
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    const HEADER: &str = "Application,ProcessID,SwapChainAddress,Runtime,SyncInterval,PresentFlags,Dropped,TimeInSeconds,msInPresentAPI,msBetweenPresents,msUntilDisplayed";

    #[test]
    fn finds_frame_time_column_by_name() {
        assert_eq!(frame_time_column(HEADER), Some(9));
    }

    #[test]
    fn parses_frame_time_at_column() {
        let row = "game.exe,123,0x0,DXGI,1,0,0,1.5,0.3,6.94,7.1";
        assert_eq!(parse_frame_time(row, 9), Some(6.94));
    }

    #[test]
    fn rejects_absurd_frame_times() {
        let row = "game.exe,123,0x0,DXGI,1,0,0,1.5,0.3,999999,7.1";
        assert_eq!(parse_frame_time(row, 9), None);
    }

    #[test]
    fn computes_real_fps_from_frame_times() {
        // 100 frames at ~16.67ms ≈ 60 FPS.
        let ft: Vec<f32> = (0..100).map(|_| 16.67).collect();
        let s = compute_frame_stats(&ft).unwrap();
        assert!((s.avg_fps - 60.0).abs() < 1.0);
        assert!(s.frame_time_stability < 0.01); // perfectly stable
    }

    #[test]
    fn one_percent_low_reflects_worst_frames() {
        // Mostly 60fps (16.67ms) with a few 100ms stutters → 1% low well below avg.
        let mut ft: Vec<f32> = (0..99).map(|_| 16.67).collect();
        ft.push(100.0);
        let s = compute_frame_stats(&ft).unwrap();
        assert!(s.one_percent_low < s.avg_fps);
        assert!(s.one_percent_low <= 10.0); // 1000/100ms = 10 fps
    }
}
