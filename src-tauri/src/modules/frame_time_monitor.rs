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
    /// Mean GPU-busy time per frame (ms), when PresentMon reports it.
    pub gpu_busy_ms: Option<f32>,
    /// Live bottleneck: "gpu" | "cpu" | "balanced" (from GPU-busy vs frame time).
    pub bottleneck: Option<String>,
}

static CURRENT_CHILD: Mutex<Option<CommandChild>> = Mutex::new(None);
static LATEST_FRAME: Mutex<Option<FrameStats>> = Mutex::new(None);

pub fn latest_frame() -> Option<FrameStats> {
    LATEST_FRAME.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

/// Column index of `msBetweenPresents` within a PresentMon v1 CSV header.
fn frame_time_column(header: &str) -> Option<usize> {
    header
        .split(',')
        .position(|c| c.trim().eq_ignore_ascii_case("msBetweenPresents"))
}

/// Column index of the GPU-busy time, if PresentMon includes it (names vary by
/// version: msGPUActive / msGPUBusy / GPUBusy).
fn gpu_busy_column(header: &str) -> Option<usize> {
    header.split(',').position(|c| {
        let c = c.trim();
        c.eq_ignore_ascii_case("msGPUActive")
            || c.eq_ignore_ascii_case("msGPUBusy")
            || c.eq_ignore_ascii_case("GPUBusy")
    })
}

/// Classify GPU- vs CPU-bound from mean GPU-busy time vs mean frame time. A high
/// ratio means the GPU is busy almost the whole frame (GPU-bound); a low ratio
/// means the frame is waiting on the CPU / main thread. Strong heuristic, not
/// absolute — and Hardware-Accelerated GPU Scheduling can slightly skew it.
pub fn classify_bottleneck(gpu_busy_ms: f32, frame_time_ms: f32, stability_ms: f32) -> &'static str {
    if frame_time_ms <= 0.0 {
        return "balanced";
    }
    let ratio = gpu_busy_ms / frame_time_ms;
    // Extremely consistent frame times with the GPU idle → a frame cap / V-sync /
    // engine limit, NOT a real CPU bottleneck (a CPU bottleneck has far more
    // frame-time variance). Without this, capped games get mislabeled CPU-bound.
    if ratio <= 0.85 && stability_ms < 0.6 {
        return "capped";
    }
    if ratio >= 0.90 {
        "gpu"
    } else if ratio <= 0.80 {
        "cpu"
    } else {
        "balanced"
    }
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
    sorted_desc.sort_by(|a, b| b.total_cmp(a));

    let variance = frame_times.iter().map(|v| (v - mean).powi(2)).sum::<f32>() / n;

    Some(FrameStats {
        avg_fps,
        one_percent_low: low_fps(&sorted_desc, 0.01),
        point_one_percent_low: low_fps(&sorted_desc, 0.001),
        avg_frame_time_ms: mean,
        frame_time_stability: variance.sqrt(),
        gpu_busy_ms: None,
        bottleneck: None,
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
    if let Some(child) = CURRENT_CHILD.lock().unwrap_or_else(|e| e.into_inner()).take() {
        let _ = child.kill();
    }
    *LATEST_FRAME.lock().unwrap_or_else(|e| e.into_inner()) = None;
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
        Err(e) => {
            super::logger::warn(format!("sidecar: PresentMon spawn failed: {e}"));
            return;
        }
    };
    *CURRENT_CHILD.lock().unwrap_or_else(|e| e.into_inner()) = Some(child);

    tauri::async_runtime::spawn(async move {
        let mut col: Option<usize> = None;
        let mut gpu_col: Option<usize> = None;
        let mut header_seen = false;
        let mut window: Vec<f32> = Vec::with_capacity(600);
        let mut gpu_window: Vec<f32> = Vec::with_capacity(600);
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
            if !header_seen {
                header_seen = true;
                col = frame_time_column(line);
                gpu_col = gpu_busy_column(line);
                continue;
            }
            let Some(fcol) = col else { continue };
            if let Some(ft) = parse_frame_time(line, fcol) {
                window.push(ft);
            }
            if let Some(gc) = gpu_col {
                if let Some(gb) = parse_frame_time(line, gc) {
                    gpu_window.push(gb);
                }
            }
            if window.len() > 600 {
                let drop = window.len() - 600;
                window.drain(0..drop);
            }
            if gpu_window.len() > 600 {
                let drop = gpu_window.len() - 600;
                gpu_window.drain(0..drop);
            }

            if last_emit.elapsed() >= Duration::from_secs(1) {
                if let Some(mut stats) = compute_frame_stats(&window) {
                    if !gpu_window.is_empty() {
                        let mean_gpu = gpu_window.iter().sum::<f32>() / gpu_window.len() as f32;
                        stats.gpu_busy_ms = Some(mean_gpu);
                        stats.bottleneck = Some(
                            classify_bottleneck(
                                mean_gpu,
                                stats.avg_frame_time_ms,
                                stats.frame_time_stability,
                            )
                            .to_string(),
                        );
                    }
                    *LATEST_FRAME.lock().unwrap_or_else(|e| e.into_inner()) = Some(stats.clone());
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
    fn bottleneck_classifies_gpu_cpu_and_capped() {
        // Unstable frames (real load) → genuine bottleneck classification.
        assert_eq!(classify_bottleneck(15.5, 16.0, 3.0), "gpu"); // GPU ~ whole frame
        assert_eq!(classify_bottleneck(8.0, 16.0, 3.0), "cpu"); // GPU idle, variable
        assert_eq!(classify_bottleneck(14.0, 16.0, 3.0), "balanced"); // in between
        // GPU idle but rock-steady frame times → a frame cap / V-sync, not CPU-bound.
        assert_eq!(classify_bottleneck(8.0, 16.67, 0.2), "capped");
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
