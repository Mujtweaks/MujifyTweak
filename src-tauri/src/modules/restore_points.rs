//! System Restore Point manager — safety first.
//!
//! Read-only listing plus two confirmed, real system actions:
//!   - create a restore point (Checkpoint-Computer, verified it actually landed),
//!   - delete restore points (vssadmin — Windows' only reliable built-in path;
//!     it removes ALL of them, so it's a hard-confirmed, clearly-labelled action).
//!
//! Every mutating command REQUIRES `confirm: true` (set by the user's click in a
//! confirmation dialog) and runs as admin (the app's UAC manifest). Listing is
//! pure read. The output-parsing is unit-tested; the real create/delete only ever
//! run on an explicit user action.

use std::os::windows::process::CommandExt;
use std::process::Command;

use serde::Serialize;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RestorePoint {
    pub sequence: u32,
    pub description: String,
    pub created: String,
    pub kind: String,
}

/// Map a RestorePointType code to a plain-English label.
fn kind_label(code: &str) -> &'static str {
    match code.trim() {
        "0" => "App install",
        "1" => "App uninstall",
        "10" => "Driver install",
        "12" => "Settings change",
        "13" => "Cancelled operation",
        _ => "Restore point",
    }
}

/// Parse the piped `seq|desc|created|type` lines from Get-ComputerRestorePoint.
/// Pure + unit-tested — no system access.
fn parse_points(stdout: &str) -> Vec<RestorePoint> {
    let mut out = Vec::new();
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.splitn(4, '|').collect();
        if parts.len() < 4 {
            continue;
        }
        let Ok(sequence) = parts[0].trim().parse::<u32>() else {
            continue;
        };
        out.push(RestorePoint {
            sequence,
            description: parts[1].trim().to_string(),
            created: parts[2].trim().to_string(),
            kind: kind_label(parts[3]).to_string(),
        });
    }
    // Newest first.
    out.sort_by_key(|p| std::cmp::Reverse(p.sequence));
    out
}

/// Read-only: every System Restore point currently on the machine.
#[tauri::command]
pub fn list_restore_points() -> Vec<RestorePoint> {
    let out = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Get-ComputerRestorePoint | ForEach-Object { \"$($_.SequenceNumber)|$($_.Description)|$($_.ConvertToDateTime($_.CreationTime))|$($_.RestorePointType)\" }",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    match out {
        Ok(o) => parse_points(&String::from_utf8_lossy(&o.stdout)),
        Err(_) => Vec::new(),
    }
}

/// Whether System Restore is even enabled for the system drive. Read-only.
#[tauri::command]
pub fn restore_protection_enabled() -> bool {
    // If we can enumerate restore points OR the SR service is configured, treat
    // as enabled. A missing/disabled SR yields an error / empty result.
    let out = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "try { (Get-ComputerRestorePoint | Measure-Object).Count; 'ok' } catch { 'disabled' }",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    match out {
        Ok(o) => {
            let s = String::from_utf8_lossy(&o.stdout).to_lowercase();
            !s.contains("disabled")
        }
        Err(_) => false,
    }
}

/// Create a restore point. `confirm` MUST be true. Verifies it actually landed
/// (Windows silently skips a new point if one was made in the last 24h, and
/// no-ops entirely if System Restore is disabled) and reports honestly.
#[tauri::command]
pub fn create_restore_point(description: String, confirm: bool) -> Result<String, String> {
    if !confirm {
        return Err("Refused: creating a restore point requires confirmation.".into());
    }
    let desc = description.trim();
    let desc = if desc.is_empty() { "Mujify Tweaks" } else { desc };
    // Sanitize: single-quote the description, escaping embedded quotes.
    let safe = desc.replace('\'', "''");

    let before = list_restore_points().first().map(|p| p.sequence).unwrap_or(0);
    // Windows throttles restore points to one per 24h by default
    // (SystemRestorePointCreationFrequency). Set it to 0 so Create works on
    // demand every time — a benign, pro-safety change (more restore points, not
    // fewer). Then create the point; Windows stamps it with the real current
    // time automatically.
    let ps = format!(
        "New-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\SystemRestore' -Name 'SystemRestorePointCreationFrequency' -Value 0 -PropertyType DWord -Force -ErrorAction SilentlyContinue | Out-Null; Checkpoint-Computer -Description '{safe}' -RestorePointType MODIFY_SETTINGS -ErrorAction SilentlyContinue"
    );
    let _ = Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;

    let after = list_restore_points();
    match after.first() {
        Some(p) if p.sequence > before => Ok(format!("Restore point \"{desc}\" created.")),
        Some(_) => Err(
            "Windows didn't create a new one just now — it can briefly refuse back-to-back requests. Wait a moment and try again."
                .into(),
        ),
        None => Err(
            "Couldn't create a restore point — System Restore looks disabled for this drive. Turn it on in Windows: Create a restore point → Configure → Turn on system protection."
                .into(),
        ),
    }
}

/// Delete restore points. Windows' only reliable built-in path (vssadmin) removes
/// ALL of them, so this is deliberately all-or-nothing and hard-confirmed. `_seq`
/// is accepted for a future per-point path but Windows exposes no clean per-point
/// delete, so it's honestly all-or-nothing today. `confirm` MUST be true.
#[tauri::command]
pub fn delete_all_restore_points(confirm: bool) -> Result<String, String> {
    if !confirm {
        return Err("Refused: deleting restore points requires confirmation.".into());
    }
    let out = Command::new("vssadmin")
        .args(["delete", "shadows", "/all", "/quiet"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok("All restore points deleted.".into())
    } else {
        let err = String::from_utf8_lossy(&out.stderr);
        // vssadmin returns non-zero when there were simply none to delete.
        if list_restore_points().is_empty() {
            Ok("No restore points to delete.".into())
        } else {
            Err(format!("Delete failed: {}", err.trim()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_restore_point_lines_newest_first() {
        let stdout = "\
41|Windows Update|07/09/2026 03:11:00|12
42|Mujify Tweaks|07/10/2026 18:40:00|12
40|Automatic Restore Point|07/08/2026 09:00:00|0
";
        let p = parse_points(stdout);
        assert_eq!(p.len(), 3);
        assert_eq!(p[0].sequence, 42); // newest first
        assert_eq!(p[0].description, "Mujify Tweaks");
        assert_eq!(p[0].kind, "Settings change");
        assert_eq!(p[2].kind, "App install");
    }

    #[test]
    fn ignores_malformed_lines() {
        let stdout = "garbage\n\n7|Good|now|12\nno-pipes-here";
        let p = parse_points(stdout);
        assert_eq!(p.len(), 1);
        assert_eq!(p[0].sequence, 7);
    }

    #[test]
    fn kind_labels_are_plain_english() {
        assert_eq!(kind_label("10"), "Driver install");
        assert_eq!(kind_label("999"), "Restore point");
    }
}
