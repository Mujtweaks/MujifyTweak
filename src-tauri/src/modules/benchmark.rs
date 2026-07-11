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

use super::frame_time_monitor;
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
    /// Std-dev of the per-second FPS readings across the window — our measure of
    /// run-to-run noise, so the verdict can tell a real change from jitter.
    pub fps_stddev: Option<f32>,
    pub ping_ms: Option<f32>,
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
    /// Plain-English descriptions of the tweaks applied during this session.
    pub applied_tweaks: Vec<String>,
}

static LATEST_REPORT: Mutex<Option<BenchmarkReport>> = Mutex::new(None);

/// Sample the live monitor `count` times at `interval`, averaging what's real.
async fn collect(count: u32, interval: Duration) -> Averages {
    let mut cpu = 0.0f32;
    let mut gpu_sum = 0.0f32;
    let mut gpu_n = 0u32;
    let mut ram = 0.0f32;
    let mut score = 0.0f32;
    let mut fps_samples: Vec<f32> = Vec::new();
    let mut ping_sum = 0.0f32;
    let mut ping_n = 0u32;
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
        // Real FPS if a game is being captured by PresentMon; absent otherwise.
        if let Some(f) = frame_time_monitor::latest_frame() {
            fps_samples.push(f.avg_fps);
        }
        if let Some(pg) = super::network_monitor::latest_ping() {
            ping_sum += pg;
            ping_n += 1;
        }
        tokio::time::sleep(interval).await;
    }

    let n = got.max(1) as f32;
    let (avg_fps, fps_stddev) = mean_and_stddev(&fps_samples);
    Averages {
        samples: got,
        cpu_usage: cpu / n,
        gpu_usage: if gpu_n > 0 { Some(gpu_sum / gpu_n as f32) } else { None },
        ram_usage: ram / n,
        system_score: score / n,
        // Measured only when a game was actually presenting during the window.
        avg_fps,
        fps_stddev,
        ping_ms: if ping_n > 0 { Some(ping_sum / ping_n as f32) } else { None },
    }
}

/// Mean and (sample) standard deviation of a set of readings. Returns
/// (None, None) when empty; stddev is None with a single reading (undefined).
fn mean_and_stddev(xs: &[f32]) -> (Option<f32>, Option<f32>) {
    if xs.is_empty() {
        return (None, None);
    }
    let mean = xs.iter().sum::<f32>() / xs.len() as f32;
    if xs.len() < 2 {
        return (Some(mean), None);
    }
    let var = xs.iter().map(|x| (x - mean).powi(2)).sum::<f32>() / (xs.len() as f32 - 1.0);
    (Some(mean), Some(var.sqrt()))
}

fn pct(before: f32, after: f32) -> Option<f32> {
    if before.abs() < f32::EPSILON {
        None
    } else {
        Some(((after - before) / before) * 100.0)
    }
}

fn build_metrics(b: &Averages, p: &Averages) -> Vec<MetricDelta> {
    let fps_measured = b.avg_fps.is_some() && p.avg_fps.is_some();
    vec![
        MetricDelta {
            label: "Avg FPS".into(),
            before: b.avg_fps,
            after: p.avg_fps,
            delta_pct: match (b.avg_fps, p.avg_fps) {
                (Some(x), Some(y)) => pct(x, y),
                _ => None,
            },
            better: "higher".into(),
            measured: fps_measured,
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
            label: "Ping".into(),
            before: b.ping_ms,
            after: p.ping_ms,
            delta_pct: match (b.ping_ms, p.ping_ms) {
                (Some(x), Some(y)) => pct(x, y),
                _ => None,
            },
            better: "lower".into(),
            measured: b.ping_ms.is_some() && p.ping_ms.is_some(),
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

/// Noise-aware FPS classification: is the change real, or within run-to-run
/// jitter? `sd_*` are the per-window FPS standard deviations (measured noise).
#[derive(PartialEq, Debug)]
enum FpsVerdict {
    Improved { delta_pct: f32, noise_pct: f32 },
    Regressed { delta_pct: f32, noise_pct: f32 },
    Noise { delta_pct: f32, noise_pct: f32 },
    Inconclusive,
}

/// A change counts as real only when it clearly exceeds the pooled measurement
/// noise (~2× the combined std-dev, expressed as a % of baseline, with a 1%
/// floor). This is the engineering form of "never claim a gain we can't prove".
fn classify_fps_change(mean_b: f32, sd_b: f32, mean_p: f32, sd_p: f32) -> FpsVerdict {
    if mean_b <= f32::EPSILON {
        return FpsVerdict::Inconclusive;
    }
    let delta_pct = (mean_p - mean_b) / mean_b * 100.0;
    // Pooled run-to-run noise as a percentage of the baseline mean.
    let pooled_sd = (sd_b * sd_b + sd_p * sd_p).sqrt();
    let noise_pct = pooled_sd / mean_b * 100.0;
    let threshold = (2.0 * noise_pct).max(1.0);
    if delta_pct.abs() <= threshold {
        FpsVerdict::Noise { delta_pct, noise_pct }
    } else if delta_pct > 0.0 {
        FpsVerdict::Improved { delta_pct, noise_pct }
    } else {
        FpsVerdict::Regressed { delta_pct, noise_pct }
    }
}

/// Honest verdict. With FPS we gate the claim on measurement noise; without it we
/// can only speak to system-load/score movement, and we say exactly that.
fn verdict(metrics: &[MetricDelta], baseline: &Averages, post: &Averages) -> String {
    if let (Some(mb), Some(mp)) = (baseline.avg_fps, post.avg_fps) {
        return match classify_fps_change(
            mb,
            baseline.fps_stddev.unwrap_or(0.0),
            mp,
            post.fps_stddev.unwrap_or(0.0),
        ) {
            FpsVerdict::Improved { delta_pct, .. } => format!(
                "Meaningful improvement — average FPS rose {:.0}%, clearly beyond run-to-run noise. Tweaks confirmed effective.",
                delta_pct
            ),
            FpsVerdict::Regressed { delta_pct, .. } => format!(
                "Performance dropped {:.0}% (beyond measurement noise) — recommend Revert All.",
                delta_pct.abs()
            ),
            FpsVerdict::Noise { delta_pct, noise_pct } => format!(
                "Within measurement noise — the {:+.0}% FPS change is smaller than the run-to-run variability (±{:.0}%), so no confirmed change.",
                delta_pct, noise_pct
            ),
            FpsVerdict::Inconclusive => {
                "FPS was captured but the baseline was too low to compare. Re-run.".into()
            }
        };
    }
    // No game was presenting → we only measured system load, and say exactly that.
    let score = metrics
        .iter()
        .find(|m| m.label == "System Score")
        .and_then(|m| m.delta_pct)
        .unwrap_or(0.0);
    if score > 3.0 {
        "System headroom improved. Launch a game and re-run to measure real in-game FPS.".into()
    } else if score < -3.0 {
        "System load rose after changes — consider Revert All.".into()
    } else {
        "No significant system-load change measured. Launch a game to measure FPS.".into()
    }
}

/// Run one baseline OR post capture. `phase` is "baseline" | "post".
/// 60 samples at 1s = a ~60s window — long enough for a real, comparable FPS
/// average when a game is presenting during both the baseline and the post run.
#[tauri::command]
pub async fn run_benchmark(
    _app: AppHandle,
    phase: String,
    game_name: Option<String>,
) -> Result<Averages, String> {
    let avg = collect(60, Duration::from_secs(1)).await;
    // Stash baseline so a later "post" can diff against it.
    if phase == "baseline" {
        *LATEST_REPORT.lock().unwrap_or_else(|e| e.into_inner()) = Some(BenchmarkReport {
            game_name,
            created_at: chrono::Utc::now().timestamp_millis(),
            baseline: avg.clone(),
            post: Averages::default(),
            metrics: Vec::new(),
            verdict: "Baseline captured. Apply tweaks, then run the post-benchmark.".into(),
            fps_measured: false,
            applied_tweaks: Vec::new(),
        });
    } else {
        // Complete the report by diffing against the stored baseline.
        let mut guard = LATEST_REPORT.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(report) = guard.as_mut() {
            let baseline_ts = report.created_at; // captured at baseline time
            report.post = avg.clone();
            report.metrics = build_metrics(&report.baseline, &report.post);
            report.fps_measured =
                report.baseline.avg_fps.is_some() && report.post.avg_fps.is_some();
            report.verdict = verdict(&report.metrics, &report.baseline, &report.post);
            // Tweaks applied between the baseline capture and now, still active.
            report.applied_tweaks = super::change_log::all()
                .into_iter()
                .filter(|e| !e.undone && e.timestamp >= baseline_ts)
                .map(|e| e.description)
                .collect();
            report.created_at = chrono::Utc::now().timestamp_millis();
        }
    }
    Ok(avg)
}

/// Read-only — latest report for ReportView (or None → honest empty state).
#[tauri::command]
pub fn get_latest_report() -> Option<BenchmarkReport> {
    LATEST_REPORT.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn avg(cpu: f32, fps: Option<f32>) -> Averages {
        Averages {
            samples: 20,
            cpu_usage: cpu,
            gpu_usage: Some(50.0),
            ram_usage: 60.0,
            system_score: 90.0,
            avg_fps: fps,
            fps_stddev: None,
            ping_ms: Some(30.0),
        }
    }

    #[test]
    fn ping_row_is_measured_when_both_sides_have_it() {
        let m = build_metrics(&avg(50.0, Some(100.0)), &avg(45.0, Some(120.0)));
        let ping = m.iter().find(|r| r.label == "Ping").unwrap();
        assert!(ping.measured);
        assert_eq!(ping.better, "lower");
    }

    #[test]
    fn fps_delta_is_measured_only_when_both_sides_have_fps() {
        // Both sides have FPS → the Avg FPS row is measured with a real delta.
        let m = build_metrics(&avg(50.0, Some(100.0)), &avg(45.0, Some(120.0)));
        let fps_row = m.iter().find(|r| r.label == "Avg FPS").unwrap();
        assert!(fps_row.measured);
        assert!((fps_row.delta_pct.unwrap() - 20.0).abs() < 0.1); // +20%
    }

    #[test]
    fn fps_row_honestly_unmeasured_without_a_game() {
        // No FPS captured (no game presenting) → row stays unmeasured, no fake %.
        let m = build_metrics(&avg(50.0, None), &avg(45.0, None));
        let fps_row = m.iter().find(|r| r.label == "Avg FPS").unwrap();
        assert!(!fps_row.measured);
        assert!(fps_row.delta_pct.is_none());
    }

    #[test]
    fn verdict_speaks_to_fps_when_measured() {
        let b = avg(50.0, Some(100.0));
        let p = avg(45.0, Some(115.0));
        let m = build_metrics(&b, &p);
        let v = verdict(&m, &b, &p);
        assert!(v.to_lowercase().contains("fps"));
    }

    #[test]
    fn small_delta_with_high_variance_is_noise() {
        // +4% but jittery windows (sd 5 on a ~100 fps mean) → not a real change.
        let v = classify_fps_change(100.0, 5.0, 104.0, 5.0);
        assert!(matches!(v, FpsVerdict::Noise { .. }), "got {v:?}");
    }

    #[test]
    fn large_delta_with_low_variance_is_meaningful() {
        // +15% with steady windows (sd 1) → clearly beyond noise.
        let v = classify_fps_change(100.0, 1.0, 115.0, 1.0);
        assert!(matches!(v, FpsVerdict::Improved { .. }), "got {v:?}");
    }

    #[test]
    fn verdict_calls_out_noise_when_jittery() {
        let b = Averages { avg_fps: Some(100.0), fps_stddev: Some(5.0), ..avg(50.0, Some(100.0)) };
        let p = Averages { avg_fps: Some(104.0), fps_stddev: Some(5.0), ..avg(45.0, Some(104.0)) };
        let m = build_metrics(&b, &p);
        assert!(verdict(&m, &b, &p).to_lowercase().contains("noise"));
    }

    #[test]
    fn stddev_is_none_below_two_samples_but_real_above() {
        assert_eq!(mean_and_stddev(&[]), (None, None));
        assert_eq!(mean_and_stddev(&[100.0]), (Some(100.0), None));
        let (m, sd) = mean_and_stddev(&[90.0, 100.0, 110.0]);
        assert_eq!(m, Some(100.0));
        assert!((sd.unwrap() - 10.0).abs() < 0.001);
    }
}
