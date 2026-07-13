//! RAM Optimizer — read the real memory status, and (on explicit confirm) trim
//! process working sets to hand cached pages back as available RAM.
//!
//! `optimize_ram` calls the DOCUMENTED `EmptyWorkingSet` on every process we can
//! open (protected ones are skipped) — it's benign: Windows re-pages on demand.
//! It is gated behind `confirm` and never runs in tests/tooling. The freed-MB
//! figure is a real `GlobalMemoryStatusEx` before/after delta — never fabricated.

use std::mem::size_of;

use serde::Serialize;
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::System::ProcessStatus::{EmptyWorkingSet, EnumProcesses};
use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_SET_QUOTA,
};

const MB: u64 = 1_048_576;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RamStatus {
    pub total_mb: u64,
    pub used_mb: u64,
    pub available_mb: u64,
    pub used_percent: f32,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RamOptimizeResult {
    pub freed_mb: u64,
    pub before_available_mb: u64,
    pub after_available_mb: u64,
    pub processes_trimmed: u32,
}

fn mem() -> MEMORYSTATUSEX {
    let mut m = MEMORYSTATUSEX {
        dwLength: size_of::<MEMORYSTATUSEX>() as u32,
        ..Default::default()
    };
    unsafe {
        let _ = GlobalMemoryStatusEx(&mut m);
    }
    m
}

/// Read-only physical-memory status. Changes nothing.
#[tauri::command]
pub fn ram_status() -> RamStatus {
    let m = mem();
    let total = m.ullTotalPhys;
    let avail = m.ullAvailPhys;
    let used = total.saturating_sub(avail);
    RamStatus {
        total_mb: total / MB,
        used_mb: used / MB,
        available_mb: avail / MB,
        used_percent: if total > 0 {
            (used as f64 / total as f64 * 100.0) as f32
        } else {
            0.0
        },
    }
}

fn all_pids() -> Vec<u32> {
    let mut pids = vec![0u32; 4096];
    let mut needed = 0u32;
    unsafe {
        if EnumProcesses(pids.as_mut_ptr(), (pids.len() * 4) as u32, &mut needed).is_ok() {
            pids.truncate(needed as usize / 4);
        } else {
            pids.clear();
        }
    }
    pids
}

/// EmptyWorkingSet every process we're allowed to open. Protected/system
/// processes fail the OpenProcess and are skipped — never fatal.
fn trim_working_sets() -> u32 {
    let mut count = 0u32;
    for pid in all_pids() {
        if pid == 0 {
            continue;
        }
        unsafe {
            if let Ok(handle) = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_SET_QUOTA, false, pid)
            {
                if EmptyWorkingSet(handle).is_ok() {
                    count += 1;
                }
                let _ = CloseHandle(handle);
            }
        }
    }
    count
}

/// The availability gain in MB — never negative (trimming can only free memory,
/// and any measurement wobble is clamped to 0 rather than underflowing).
fn freed_mb(before_avail: u64, after_avail: u64) -> u64 {
    after_avail.saturating_sub(before_avail) / MB
}

/// Trim working sets and report the REAL freed-memory delta. GATED behind
/// `confirm` (set only by the UI); never called by tests or tooling.
#[tauri::command]
pub async fn optimize_ram(confirm: bool) -> Result<RamOptimizeResult, String> {
    // Trimming every process's working set is heavy — off the UI thread so it
    // can't freeze the app.
    tokio::task::spawn_blocking(move || optimize_ram_impl(confirm))
        .await
        .map_err(|e| e.to_string())?
}

fn optimize_ram_impl(confirm: bool) -> Result<RamOptimizeResult, String> {
    if !confirm {
        return Err("Refused: RAM optimization requires explicit confirmation.".into());
    }
    let before = mem().ullAvailPhys;
    let trimmed = trim_working_sets();
    // Let Windows settle the standby/available accounting before we re-measure.
    std::thread::sleep(std::time::Duration::from_millis(400));
    let after = mem().ullAvailPhys;
    let freed = freed_mb(before, after);
    super::logger::info(format!(
        "ram optimize: trimmed {trimmed} process working set(s), freed {freed} MB"
    ));
    Ok(RamOptimizeResult {
        freed_mb: freed,
        before_available_mb: before / MB,
        after_available_mb: after / MB,
        processes_trimmed: trimmed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn optimize_refuses_without_confirmation() {
        // The gate must hold before any process handle is opened.
        assert!(optimize_ram_impl(false).is_err());
    }

    #[test]
    fn freed_is_the_availability_gain_never_negative() {
        assert_eq!(freed_mb(1000 * MB, 1500 * MB), 500);
        // If availability appears to drop (measurement noise), report 0 — no underflow.
        assert_eq!(freed_mb(1500 * MB, 1000 * MB), 0);
    }
}
