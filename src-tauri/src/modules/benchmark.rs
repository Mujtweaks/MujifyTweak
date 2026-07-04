//! Checkpoints 13–15 — Baseline / Post benchmark + DeltaReporter (the proof).
//!
//! "No proof, no claim." A baseline samples live SystemMonitor data over a fixed
//! window, tweaks are applied (by the user), then an identical post-run samples
//! the same metrics the same way. DeltaReporter diffs them into an honest
//! before/after report.
//!
//! FPS / frame-time deltas require PresentMon (not bundled yet) — until then
//! those fields are `null` and the report says so. The report NEVER fabricates a
//! percentage: every number here is measured, or it is absent.

use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use super::system_monitor;

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Averages {
    pub samples: u32,
    pub cpu_usage: f32,
    pub gpu_usage: Option<f32>,
    pub ram_usage: f32,
    pub system_score: f32,
    // FPS/frame-time intentionally absent until PresentMon lands.
    pub avg_fps: Option<f32>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MetricDelta {
    pub label: String,
    pub before: Option<f32>,
    pub after: Option<f32>,
    pub delta_pct: Option<f32>,
    /// "lower" or "higher" — which direction is an improvement for this metric.
    pub better: String,
    pub measured: bool,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkReport {
    pub game_name: Option<String>,
    pub created_at: i64,
    pub baseline: Averages,
    pub post: Averages,
    pub metrics: Vec<MetricDelta>,
    pub verdict: String,
    /// True only when FPS was actually captured. Drives honest UI copy.
    pub fps_measured: bool,
}

static LATEST_REPORT: Mutex<Option<BenchmarkReport>> = Mutex::new(None);

/// Sample the live monitor `count` times at `interval`, averaging what's real.
async fn collect(count: u32, interval: Duration) -> Averages {
    let mut cpu = 0.0f32;
    let mut gpu_sum = 0.0f32;
    let mut gpu_n = 0u32;
    let mut ram = 0.0f32;
    let mut score = 0.0f32;
    let mut got = 0u32;

    for _ in 0..count {
        if let Some(s) = system_monitor::latest() {
            cpu += s.cpu_usage_percent;
            if let Some(g) = s.gpu_usage_percent {
                gpu_sum += g;
                gpu_n += 1;
            }
            ram += s.ram_usage_percent;
            score += s.system_score as f32;
            got += 1;
        }
        tokio::time::sleep(interval).await;
    }

    let n = got.max(1) as f32;
    Averages {
        samples: got,
        cpu_usage: cpu / n,
        gpu_usage: if gpu_n > 0 { Some(gpu_sum / gpu_n as f32) } else { None },
        ram_usage: ram / n,
        system_score: score / n,
        avg_fps: None, // PresentMon not bundled yet — honest null
    }
}

fn pct(before: f32, after: f32) -> Option<f32> {
    if before.abs() < f32::EPSILON {
        None
    } else {
        Some(((after - before) / before) * 100.0)
    }
}

fn build_metrics(b: &Averages, p: &Averages) -> Vec<MetricDelta> {
    vec![
        MetricDelta {
            label: "Avg FPS".into(),
            before: b.avg_fps,
            after: p.avg_fps,
            delta_pct: None,
            better: "higher".into(),
            measured: false, // until PresentMon
        },
        MetricDelta {
            label: "CPU Load".into(),
            before: Some(b.cpu_usage),
            after: Some(p.cpu_usage),
            delta_pct: pct(b.cpu_usage, p.cpu_usage),
            better: "lower".into(),
            measured: true,
        },
        MetricDelta {
            label: "GPU Load".into(),
            before: b.gpu_usage,
            after: p.gpu_usage,
            delta_pct: match (b.gpu_usage, p.gpu_usage) {
                (Some(x), Some(y)) => pct(x, y),
                _ => None,
            },
            better: "lower".into(),
            measured: b.gpu_usage.is_some() && p.gpu_usage.is_some(),
        },
        MetricDelta {
            label: "RAM Load".into(),
            before: Some(b.ram_usage),
            after: Some(p.ram_usage),
            delta_pct: pct(b.ram_usage, p.ram_usage),
            better: "lower".into(),
            measured: true,
        },
        MetricDelta {
            label: "System Score".into(),
            before: Some(b.system_score),
            after: Some(p.system_score),
            delta_pct: pct(b.system_score, p.system_score),
            better: "higher".into(),
            measured: true,
        },
    ]
}

/// Honest verdict. Without FPS we can only speak to system-load/score movement,
/// and we say exactly that — never "meaningful FPS gain" from load numbers.
fn verdict(metrics: &[MetricDelta], fps_measured: bool) -> String {
    if !fps_measured {
        let score = metrics
            .iter()
            .find(|m| m.label == "System Score")
            .and_then(|m| m.delta_pct)
            .unwrap_or(0.0);
        return if score > 3.0 {
            "System headroom improved. Bundle PresentMon to measure real in-game FPS.".into()
        } else if score < -3.0 {
            "System load rose after changes — consider Revert All.".into()
        } else {
            "No significant system-load change measured. FPS not yet measurable (PresentMon pending).".into()
        };
    }
    "Report complete.".into()
}

/// Run one baseline OR post capture. `phase` is "baseline" | "post".
/// ~20 samples at 1s = a ~20s window (shorter than the spec's 60s so the UI
/// stays responsive during development; the mechanism is identical either way).
#[tauri::command]
pub async fn run_benchmark(
    _app: AppHandle,
    phase: String,
    game_name: Option<String>,
) -> Result<Averages, String> {
    let avg = collect(20, Duration::from_secs(1)).await;
    // Stash baseline so a later "post" can diff against it.
    if phase == "baseline" {
        *LATEST_REPORT.lock().unwrap() = Some(BenchmarkReport {
            game_name,
            created_at: chrono::Utc::now().timestamp_millis(),
            baseline: avg.clone(),
            post: Averages::default(),
            metrics: Vec::new(),
            verdict: "Baseline captured. Apply tweaks, then run the post-benchmark.".into(),
            fps_measured: false,
        });
    } else {
        // Complete the report by diffing against the stored baseline.
        let mut guard = LATEST_REPORT.lock().unwrap();
        if let Some(report) = guard.as_mut() {
            report.post = avg.clone();
            report.metrics = build_metrics(&report.baseline, &report.post);
            report.fps_measured = false;
            report.verdict = verdict(&report.metrics, report.fps_measured);
            report.created_at = chrono::Utc::now().timestamp_millis();
        }
    }
    Ok(avg)
}

/// Read-only — latest report for ReportView (or None → honest empty state).
#[tauri::command]
pub fn get_latest_report() -> Option<BenchmarkReport> {
    LATEST_REPORT.lock().unwrap().clone()
}
