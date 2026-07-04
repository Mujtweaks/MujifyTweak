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

use serde::Serialize;
use sysinfo::System;
use tauri::{AppHandle, Emitter};
use wmi::WMIConnection;

use super::wmi_util::{connect, query, variant_to_f64, Row};

/// Latest sample, shared process-wide so the benchmark loop and any command can
/// read current stats without re-sampling. Updated every tick by the monitor.
static LATEST: Mutex<Option<SystemStats>> = Mutex::new(None);

/// Most recent live sample, if the monitor has produced one yet.
pub fn latest() -> Option<SystemStats> {
    LATEST.lock().unwrap().clone()
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

/// GPU utilization = max UtilizationPercentage across all engine instances
/// (mirrors Task Manager's headline GPU figure). Works for Intel/AMD/NVIDIA.
fn gpu_utilization(conn: &WMIConnection) -> Option<f32> {
    let rows = query(
        conn,
        "SELECT UtilizationPercentage FROM Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine",
    );
    let max = rows
        .iter()
        .filter_map(|r| r.get("UtilizationPercentage"))
        .filter_map(variant_to_f64)
        .fold(0.0_f64, f64::max);
    if rows.is_empty() {
        None
    } else {
        Some(max.min(100.0) as f32)
    }
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

    thread::spawn(move || {
        // One WMI connection, created on this thread, reused for its life.
        // (wmi 0.18 keeps COM initialized on the owning thread.)
        let conn = connect();
        let mut sys = System::new();
        let mut power_plan: Option<String> = active_power_plan();
        let mut tick: u32 = 0;

        loop {
            // Refresh the (rarely-changing) power plan name every ~10s.
            if tick % 10 == 0 {
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

            // Temps require the LHM sidecar (not built yet) — honest null.
            let cpu_temp: Option<f32> = None;
            let gpu_temp: Option<f32> = None;

            let (health, system_score) =
                compute_health(cpu, gpu, ram_pct, disk_act, cpu_temp, gpu_temp);
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

            *LATEST.lock().unwrap() = Some(stats.clone());
            let _ = app.emit("system_stats", &stats);
            thread::sleep(Duration::from_secs(1));
        }
    });
}
