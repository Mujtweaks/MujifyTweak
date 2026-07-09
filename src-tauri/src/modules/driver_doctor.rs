//! AI Driver Doctor — diagnose device/driver problems, repair the safe way.
//!
//! Detection (fully real, read-only): enumerate Plug-and-Play devices via WMI
//! `Win32_PnPEntity` and surface any whose `ConfigManagerErrorCode` is non-zero
//! — the programmatic equivalent of the Device Manager yellow warning icon —
//! translated to plain English. The AI reads this to report EVERY problem, not
//! just the one the user mentioned.
//!
//! Repair (safe path only): create a System Restore point first, then trigger
//! Windows' OWN driver search (re-enumerate so signed in-box / Windows Update
//! drivers get matched by hardware ID). It NEVER downloads or installs a
//! third-party driver — a wrong low-level driver can make a PC unbootable. The
//! repair requires explicit confirmation.

use std::os::windows::process::CommandExt;
use std::process::Command;

use serde::Serialize;

use super::wmi_util;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeviceIssue {
    pub name: String,
    pub class: String,
    pub instance_id: String,
    pub error_code: u32,
    pub error_text: String,
}

/// Plain-English translation of a Device Manager (ConfigManager) error code.
fn error_text(code: u32) -> &'static str {
    match code {
        1 => "This device is not configured correctly.",
        3 => "The driver may be corrupted, or the system is low on memory.",
        10 => "This device cannot start.",
        12 => "This device cannot find enough free resources to use.",
        14 => "This device needs a restart to work properly.",
        16 => "Windows cannot identify all the resources this device uses.",
        18 => "The drivers for this device need to be reinstalled.",
        19 => "The registry configuration for this device is incomplete or damaged.",
        21 => "Windows is removing this device.",
        22 => "This device is disabled.",
        24 => "This device is not present, not working, or missing its drivers.",
        28 => "The drivers for this device are not installed.",
        29 => "This device is disabled because its firmware didn't give it resources.",
        31 => "Windows cannot load the drivers required for this device.",
        32 => "A driver (service) for this device has been disabled.",
        33 => "Windows cannot determine which resources this device requires.",
        35 => "Your system firmware lacks the info needed to configure this device.",
        37 => "Windows cannot initialize the device driver for this hardware.",
        38 => "Windows cannot load the driver — a previous instance is still in memory.",
        39 => "The device driver is corrupted or missing.",
        40 => "This device's service key in the registry is missing or incorrect.",
        41 => "The driver loaded but Windows cannot find the hardware device.",
        43 => "Windows stopped this device after it reported a problem.",
        44 => "An application or service shut down this hardware device.",
        45 => "This hardware device is not currently connected.",
        48 => "This device's software is blocked because it has known problems.",
        _ => "This device is reporting a problem in Device Manager.",
    }
}

/// Read-only: every PnP device currently reporting a problem, in plain English.
/// Also exposed as the Diagnostics "Driver Health" scan. Changes nothing.
#[tauri::command]
pub fn scan_device_health() -> Vec<DeviceIssue> {
    let Some(conn) = wmi_util::connect() else {
        return Vec::new();
    };
    let rows = wmi_util::query(
        &conn,
        "SELECT Name, PNPClass, DeviceID, ConfigManagerErrorCode FROM Win32_PnPEntity WHERE ConfigManagerErrorCode <> 0",
    );

    let mut out = Vec::new();
    for r in &rows {
        let code = wmi_util::get_u64(r, "ConfigManagerErrorCode").unwrap_or(0) as u32;
        if code == 0 {
            continue;
        }
        out.push(DeviceIssue {
            name: wmi_util::get_string(r, "Name").unwrap_or_else(|| "Unknown device".into()),
            class: wmi_util::get_string(r, "PNPClass").unwrap_or_else(|| "Other".into()),
            instance_id: wmi_util::get_string(r, "DeviceID").unwrap_or_default(),
            error_code: code,
            error_text: error_text(code).to_string(),
        });
    }
    out
}

/// Honest outcome of the pre-repair System Restore checkpoint. We never claim a
/// restore point we didn't verify.
#[derive(PartialEq, Debug, Clone, Copy)]
pub enum RestorePointOutcome {
    /// A brand-new restore point was verified to exist after the attempt.
    Created,
    /// System Restore is ON, but Windows didn't make a new point — it throttles
    /// to one per 24h, so a recent point is still protecting the user.
    SkippedRecent,
    /// System Restore is turned off entirely — there is NO safety net.
    Disabled,
}

/// Decide the honest restore-point outcome from observed facts. Pure + tested.
/// `newest_before`/`newest_after` are the newest restore point's creation time
/// (any stable string) sampled before and after the checkpoint attempt: a value
/// that newly appears or changes means a new point was actually created.
pub fn classify_restore_point(
    sr_enabled: bool,
    newest_before: Option<&str>,
    newest_after: Option<&str>,
) -> RestorePointOutcome {
    if !sr_enabled {
        RestorePointOutcome::Disabled
    } else if newest_after.is_some() && newest_after != newest_before {
        RestorePointOutcome::Created
    } else {
        RestorePointOutcome::SkippedRecent
    }
}

/// One PowerShell round-trip (via `.output()`, not fire-and-forget): the newest
/// restore point before the attempt, the checkpoint itself, the newest after,
/// and whether SR is enabled. Returns (sr_enabled, newest_before, newest_after).
/// Real I/O — tests never run this; they drive `classify_restore_point` directly.
fn attempt_restore_point() -> (bool, Option<String>, Option<String>) {
    let script = r#"
$ErrorActionPreference='SilentlyContinue'
$before = (Get-ComputerRestorePoint | Sort-Object CreationTime | Select-Object -Last 1).CreationTime
$rp = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore' -Name RPSessionInterval).RPSessionInterval
Checkpoint-Computer -Description 'Mujify driver repair' -RestorePointType MODIFY_SETTINGS
$after = (Get-ComputerRestorePoint | Sort-Object CreationTime | Select-Object -Last 1).CreationTime
Write-Output ("BEFORE=" + $before)
Write-Output ("AFTER=" + $after)
Write-Output ("RP=" + $rp)
"#;
    let text = Command::new("powershell")
        .args(["-NoProfile", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default();
    let field = |k: &str| -> Option<String> {
        text.lines()
            .find_map(|l| l.trim().strip_prefix(k))
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
    };
    let before = field("BEFORE=");
    let after = field("AFTER=");
    // Authoritative when RPSessionInterval reads (>=1 on, 0 off); otherwise infer
    // enablement from whether any restore points exist at all.
    let sr_enabled = match field("RP=").and_then(|v| v.parse::<i64>().ok()) {
        Some(interval) => interval >= 1,
        None => before.is_some() || after.is_some(),
    };
    (sr_enabled, before, after)
}

/// Safe driver repair: create AND VERIFY a restore point, then ask Windows to
/// re-scan and match signed drivers. `confirm` MUST be true (from the modal).
/// Never downloads a third-party driver. If System Restore is off we refuse and
/// say so — a driver change with no rollback safety net is not something we do
/// silently.
#[tauri::command]
pub fn repair_drivers(confirm: bool) -> Result<String, String> {
    if !confirm {
        return Err("Refused: driver repair requires explicit confirmation.".into());
    }
    // 1. System Restore point FIRST — and we VERIFY it happened, never assume.
    let (sr_enabled, before, after) = attempt_restore_point();
    let outcome = classify_restore_point(sr_enabled, before.as_deref(), after.as_deref());

    // No safety net → refuse to touch drivers and tell the user exactly why.
    if outcome == RestorePointOutcome::Disabled {
        return Err("System Restore is turned OFF, so there would be no safety net to undo a driver change. Turn on System Protection (System Properties → System Protection → Configure), then try again. No changes were made.".into());
    }

    // 2. Only now trigger Windows' own signed-driver re-scan.
    if let Err(e) = Command::new("pnputil")
        .args(["/scan-devices"])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
    {
        return Err(format!("Restore point handled, but the driver re-scan failed to start: {e}"));
    }

    let restore_note = match outcome {
        RestorePointOutcome::Created => "Created and verified a fresh System Restore point",
        RestorePointOutcome::SkippedRecent => {
            "Windows kept its existing restore point (it makes at most one per 24h) — you're still protected"
        }
        RestorePointOutcome::Disabled => unreachable!(),
    };
    Ok(format!(
        "{restore_note}, then asked Windows to re-scan and match signed drivers. This runs in the background; check Device Manager after it finishes, and use Roll Back Driver if a device behaves worse."
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_codes_translate_to_plain_english() {
        assert!(error_text(28).to_lowercase().contains("not installed"));
        assert!(error_text(43).to_lowercase().contains("stopped"));
        assert!(error_text(22).to_lowercase().contains("disabled"));
        // Unknown codes still return a sane message, never panic.
        assert!(!error_text(9999).is_empty());
    }

    #[test]
    fn restore_point_disabled_when_sr_off() {
        // SR off → Disabled no matter what points exist.
        assert_eq!(
            classify_restore_point(false, None, Some("20260101120000")),
            RestorePointOutcome::Disabled
        );
    }

    #[test]
    fn restore_point_created_when_newest_changes() {
        // A new point appears where there was none...
        assert_eq!(
            classify_restore_point(true, None, Some("20260708090000")),
            RestorePointOutcome::Created
        );
        // ...or the newest timestamp advances.
        assert_eq!(
            classify_restore_point(true, Some("20260708080000"), Some("20260708090000")),
            RestorePointOutcome::Created
        );
    }

    #[test]
    fn restore_point_skipped_when_newest_unchanged() {
        // SR on but Windows made no new point (24h throttle) → still protected.
        assert_eq!(
            classify_restore_point(true, Some("20260708080000"), Some("20260708080000")),
            RestorePointOutcome::SkippedRecent
        );
    }
}
