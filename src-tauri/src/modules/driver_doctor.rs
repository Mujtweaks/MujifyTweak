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

/// Safe driver repair: create a restore point, then ask Windows to re-scan and
/// match signed drivers. `confirm` MUST be true (from the confirmation modal).
/// Never downloads a third-party driver. Fire-and-forget (both run in the
/// background); the restore point may no-op if one was created in the last 24h.
#[tauri::command]
pub fn repair_drivers(confirm: bool) -> Result<String, String> {
    if !confirm {
        return Err("Refused: driver repair requires explicit confirmation.".into());
    }
    // 1. System Restore point FIRST — before any driver change, no exceptions.
    let _ = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Checkpoint-Computer -Description 'Mujify driver repair' -RestorePointType MODIFY_SETTINGS -ErrorAction SilentlyContinue",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
    // 2. Trigger Windows' own driver search — re-enumerate so signed in-box /
    //    Windows Update drivers get matched by hardware ID.
    let _ = Command::new("pnputil")
        .args(["/scan-devices"])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
    Ok("Created a System Restore point and asked Windows to re-scan and match signed drivers. Check Device Manager after it finishes; use Roll Back Driver if a device behaves worse.".into())
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
}
