//! Checkpoint 3 — SystemMonitor (1 Hz, push-not-poll).
//!
//! A dedicated OS thread owns a long-lived `sysinfo::System` and a per-thread
//! WMI/COM connection, samples once a second, and PUSHES a `system_stats` event
//! to the frontend via `app.emit`. Also derives the 0–100 system score, the
//! bottleneck classification, and per-subsystem health scores used by both the
//! Dashboard and the Diagnostics tab.
//!
//! CPU/GPU temperatures require the LibreHardwareMonitor sidecar (a .NET build,
//! not present yet) — until then those fields are honestly `null`, never faked.
//! Everything else (CPU%, per-core, RAM, GPU%, VRAM, disk) is live Windows data.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sysinfo::System;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use wmi::WMIConnection;

use super::wmi_util::{connect, query, variant_to_f64, Row};

/// Latest sample, shared process-wide so the benchmark loop and any command can
/// read current stats without re-sampling. Updated every tick by the monitor.
static LATEST: Mutex<Option<SystemStats>> = Mutex::new(None);

/// Latest CPU/GPU temps from the LibreHardwareMonitor sidecar. (None until it
/// produces a reading; CPU temp needs the elevated shipped app — honest null in
/// unelevated dev.)
static LATEST_TEMPS: Mutex<(Option<f32>, Option<f32>)> = Mutex::new((None, None));

/// Most recent live sample, if the monitor has produced one yet.
pub fn latest() -> Option<SystemStats> {
    LATEST.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TempLine {
    cpu_temp_c: Option<f32>,
    gpu_temp_c: Option<f32>,
}

/// Spawn the bundled LibreHardwareMonitor sidecar and keep LATEST_TEMPS updated.
/// Missing sidecar (some dev setups) simply leaves temps null — never a crash.
fn start_temp_sidecar(app: AppHandle) {
    let sidecar = match app.shell().sidecar("LHMWrapper") {
        Ok(cmd) => cmd,
        Err(_) => return,
    };
    let (mut rx, _child) = match sidecar.spawn() {
        Ok(pair) => pair,
        Err(e) => {
            super::logger::warn(format!("sidecar: LHMWrapper spawn failed: {e}"));
            return;
        }
    };
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let CommandEvent::Stdout(bytes) = event {
                let line = String::from_utf8_lossy(&bytes);
                if let Ok(t) = serde_json::from_str::<TempLine>(line.trim()) {
                    *LATEST_TEMPS.lock().unwrap_or_else(|e| e.into_inner()) = (t.cpu_temp_c, t.gpu_temp_c);
                }
            }
        }
    });
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct HealthScores {
    pub cpu: u8,
    pub gpu: u8,
    pub memory: u8,
    pub storage: u8,
    pub stability: u8,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    pub cpu_usage_percent: f32,
    pub cpu_per_core: Vec<f32>,
    pub cpu_temp_c: Option<f32>,
    pub gpu_usage_percent: Option<f32>,
    pub gpu_temp_c: Option<f32>,
    pub gpu_vram_used_mb: Option<u32>,
    pub ram_used_gb: f32,
    pub ram_total_gb: f32,
    pub ram_usage_percent: f32,
    pub disk_read_mb_s: Option<f32>,
    pub disk_write_mb_s: Option<f32>,
    pub disk_activity_percent: Option<f32>,
    pub system_score: u8,
    pub bottleneck: String,
    pub bottleneck_detail: String,
    pub active_power_plan: Option<String>,
    pub health: HealthScores,
}

/// Active power plan display name via powercfg (works unelevated). Refreshed
/// occasionally, not every tick — it rarely changes.
fn active_power_plan() -> Option<String> {
    super::power_util::active_power_plan_name()
}

static RUNNING: AtomicBool = AtomicBool::new(false);

/// GPU utilization from the 3D/graphics engine — what games actually use and
/// what Task Manager shows as the headline figure. Filtering to `engtype_3D`
/// excludes video-encode engines (e.g. a Parsec/DeskIn remote-desktop stream),
/// which would otherwise dominate the max and misreport GPU load. Falls back to
/// the overall max if no 3D engine is present.
fn gpu_utilization(conn: &WMIConnection) -> Option<f32> {
    let rows = query(
        conn,
        "SELECT Name, UtilizationPercentage FROM Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine",
    );
    if rows.is_empty() {
        return None;
    }
    let util_of = |r: &Row| r.get("UtilizationPercentage").and_then(variant_to_f64);
    let is_3d = |r: &Row| match r.get("Name") {
        Some(wmi::Variant::String(s)) => s.contains("engtype_3D") || s.contains("engtype_Graphics"),
        _ => false,
    };

    let max_3d = rows
        .iter()
        .filter(|r| is_3d(r))
        .filter_map(util_of)
        .fold(0.0_f64, f64::max);
    let max_any = rows.iter().filter_map(util_of).fold(0.0_f64, f64::max);
    // Prefer the 3D engine reading; use overall only if there is no 3D engine.
    let has_3d = rows.iter().any(is_3d);
    let max = if has_3d { max_3d } else { max_any };
    Some(max.min(100.0) as f32)
}

/// Dedicated VRAM in use = max DedicatedUsage across adapters, in MB.
fn gpu_vram_used_mb(conn: &WMIConnection) -> Option<u32> {
    let rows = query(
        conn,
        "SELECT DedicatedUsage FROM Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory",
    );
    let max = rows
        .iter()
        .filter_map(|r| r.get("DedicatedUsage"))
        .filter_map(variant_to_f64)
        .fold(0.0_f64, f64::max);
    if max > 0.0 {
        Some((max / 1_048_576.0) as u32)
    } else {
        None
    }
}

/// _Total physical-disk activity + throughput.
fn disk_stats(conn: &WMIConnection) -> (Option<f32>, Option<f32>, Option<f32>) {
    let rows = query(
        conn,
        "SELECT Name, PercentDiskTime, DiskReadBytesPersec, DiskWriteBytesPersec \
         FROM Win32_PerfFormattedData_PerfDisk_PhysicalDisk",
    );
    let total: Option<&Row> = rows.iter().find(|r| {
        matches!(r.get("Name"), Some(wmi::Variant::String(s)) if s == "_Total")
    });
    match total {
        Some(row) => {
            let act = row
                .get("PercentDiskTime")
                .and_then(variant_to_f64)
                .map(|v| v.min(100.0) as f32);
            let rd = row
                .get("DiskReadBytesPersec")
                .and_then(variant_to_f64)
                .map(|v| (v / 1_048_576.0) as f32);
            let wr = row
                .get("DiskWriteBytesPersec")
                .and_then(variant_to_f64)
                .map(|v| (v / 1_048_576.0) as f32);
            (rd, wr, act)
        }
        None => (None, None, None),
    }
}

fn clamp_score(v: i32) -> u8 {
    v.clamp(0, 100) as u8
}

/// Per-subsystem health (100 = ideal, drops with load/heat) + overall score.
fn compute_health(
    cpu: f32,
    gpu: Option<f32>,
    ram_pct: f32,
    disk_act: Option<f32>,
    cpu_temp: Option<f32>,
    gpu_temp: Option<f32>,
) -> (HealthScores, u8) {
    // CPU: healthy when it has headroom; penalize sustained high load + heat.
    let mut cpu_s = 100 - (cpu as i32 - 50).max(0);
    if let Some(t) = cpu_temp {
        if t > 85.0 {
            cpu_s -= 20;
        } else if t > 75.0 {
            cpu_s -= 8;
        }
    }
    let cpu_s = clamp_score(cpu_s);

    let gpu_s = match gpu {
        Some(g) => {
            let mut s = 100 - (g as i32 - 60).max(0) / 2;
            if let Some(t) = gpu_temp {
                if t > 85.0 {
                    s -= 20;
                } else if t > 78.0 {
                    s -= 8;
                }
            }
            clamp_score(s)
        }
        None => 100,
    };

    let mem_s = clamp_score(100 - (ram_pct as i32 - 60).max(0));
    let storage_s = match disk_act {
        Some(a) => clamp_score(100 - (a as i32 - 70).max(0)),
        None => 100,
    };

    // Stability proxy: no thermal danger + no subsystem starvation.
    let mut stab = 100;
    if cpu_temp.map(|t| t > 90.0).unwrap_or(false) || gpu_temp.map(|t| t > 90.0).unwrap_or(false) {
        stab -= 25;
    }
    if ram_pct > 92.0 {
        stab -= 15;
    }
    let stability_s = clamp_score(stab);

    let overall = ((cpu_s as u32 + gpu_s as u32 + mem_s as u32 + storage_s as u32 + stability_s as u32)
        / 5) as u8;

    (
        HealthScores {
            cpu: cpu_s,
            gpu: gpu_s,
            memory: mem_s,
            storage: storage_s,
            stability: stability_s,
        },
        overall,
    )
}

/// The headline System Score — a STABLE 0-100 that reflects how well-optimized
/// the machine is, NOT momentary CPU/GPU load. It only moves when the user's
/// tuning actually changes (tweaks applied/reverted, power plan). The live
/// per-subsystem gauges (HealthScores above) stay as the moment-to-moment load
/// meters; this is the number the dashboard gauge shows.
///
/// Formula: 55 baseline (a healthy but un-tuned PC) + up to 35 for active
/// optimizations (4 each) + 10 for a High/Ultimate performance power plan.
fn optimization_score(active_tweaks: usize, high_perf: bool) -> u8 {
    let mut s: i32 = 55;
    s += (active_tweaks as i32 * 4).min(35);
    if high_perf {
        s += 10;
    }
    s.clamp(0, 100) as u8
}

/// Bottleneck classifier (headline + detail).
fn classify_bottleneck(cpu: f32, gpu: Option<f32>, ram_pct: f32) -> (String, String) {
    if ram_pct > 90.0 {
        return (
            "RAM-limited".into(),
            "Memory is nearly full — background apps are competing with your games.".into(),
        );
    }
    if let Some(g) = gpu {
        if cpu > 85.0 && g < 70.0 {
            return (
                "CPU-bound".into(),
                "CPU is maxed while the GPU has headroom — CPU is capping your frame rate.".into(),
            );
        }
        if g > 90.0 && cpu < 70.0 {
            return (
                "GPU-bound".into(),
                "GPU is the limiter — lowering graphics settings would raise FPS.".into(),
            );
        }
    } else if cpu > 90.0 {
        return (
            "CPU-bound".into(),
            "CPU is running very hot on load — it is the current limiter.".into(),
        );
    }
    (
        "None detected".into(),
        "All components are well-balanced.".into(),
    )
}

/// Spawn the monitor once. Idempotent — safe to call on every app start.
pub fn start(app: AppHandle) {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }

    // Real CPU/GPU temps via the LibreHardwareMonitor sidecar.
    start_temp_sidecar(app.clone());

    thread::spawn(move || {
        // One WMI connection, created on this thread, reused for its life.
        // (wmi 0.18 keeps COM initialized on the owning thread.)
        let conn = connect();
        let mut sys = System::new();
        let mut power_plan: Option<String> = active_power_plan();
        let mut tick: u32 = 0;

        loop {
            // Refresh the (rarely-changing) power plan name every ~10s.
            if tick.is_multiple_of(10) {
                power_plan = active_power_plan();
            }
            tick = tick.wrapping_add(1);

            sys.refresh_cpu_usage();
            sys.refresh_memory();

            let cpu = sys.global_cpu_usage();
            let per_core: Vec<f32> = sys.cpus().iter().map(|c| c.cpu_usage()).collect();
            let ram_used = sys.used_memory() as f32 / 1_073_741_824.0;
            let ram_total = sys.total_memory() as f32 / 1_073_741_824.0;
            let ram_pct = if ram_total > 0.0 {
                (ram_used / ram_total) * 100.0
            } else {
                0.0
            };

            let (gpu, vram, disk_rd, disk_wr, disk_act) = match &conn {
                Some(c) => {
                    let (rd, wr, act) = disk_stats(c);
                    (gpu_utilization(c), gpu_vram_used_mb(c), rd, wr, act)
                }
                None => (None, None, None, None, None),
            };

            // Real temps from the LHM sidecar (null until it reports / needs admin).
            let (cpu_temp, gpu_temp) = *LATEST_TEMPS.lock().unwrap_or_else(|e| e.into_inner());

            // Per-subsystem health = live load gauges (kept). The headline score
            // is derived from tuning state, so it doesn't swing with load.
            let (health, _live_health) =
                compute_health(cpu, gpu, ram_pct, disk_act, cpu_temp, gpu_temp);
            let high_perf = power_plan
                .as_deref()
                .map(|n| {
                    let n = n.to_lowercase();
                    n.contains("high performance") || n.contains("ultimate")
                })
                .unwrap_or(false);
            let active_tweaks = super::change_log::active_entries().len();
            let system_score = optimization_score(active_tweaks, high_perf);
            let (bottleneck, bottleneck_detail) = classify_bottleneck(cpu, gpu, ram_pct);

            let stats = SystemStats {
                cpu_usage_percent: cpu,
                cpu_per_core: per_core,
                cpu_temp_c: cpu_temp,
                gpu_usage_percent: gpu,
                gpu_temp_c: gpu_temp,
                gpu_vram_used_mb: vram,
                ram_used_gb: ram_used,
                ram_total_gb: ram_total,
                ram_usage_percent: ram_pct,
                disk_read_mb_s: disk_rd,
                disk_write_mb_s: disk_wr,
                disk_activity_percent: disk_act,
                system_score,
                bottleneck,
                bottleneck_detail,
                active_power_plan: power_plan.clone(),
                health,
            };

            *LATEST.lock().unwrap_or_else(|e| e.into_inner()) = Some(stats.clone());
            let _ = app.emit("system_stats", &stats);
            thread::sleep(Duration::from_secs(1));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn optimization_score_is_stable_and_tuning_based() {
        // An un-tuned PC sits at the 55 baseline regardless of live load.
        assert_eq!(optimization_score(0, false), 55);
        // Applying optimizations raises it (4 each, capped at +35).
        assert_eq!(optimization_score(5, false), 75);
        assert_eq!(optimization_score(20, false), 90); // capped at +35
        // A performance power plan adds 10.
        assert_eq!(optimization_score(0, true), 65);
        // Fully tuned tops out at 100, never above.
        assert_eq!(optimization_score(50, true), 100);
    }

    #[test]
    fn bottleneck_flags_full_ram() {
        let (b, _) = classify_bottleneck(30.0, Some(40.0), 95.0);
        assert!(b.contains("RAM"));
    }
}
