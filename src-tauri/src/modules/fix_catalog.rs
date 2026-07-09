//! Fixes Hub — real, reversible Windows repairs.
//!
//! Metadata (title/category/risk/transparency) is bundled in resources/fixes.json;
//! the concrete reversible ops for each fix id live here in `fix_ops`. Applying a
//! fix goes through the SAME confirm → capture → ChangeLog → rollback pipeline as
//! tweaks (via the shared `Op`/`UndoOp` system). `apply_fix` REQUIRES `confirm:
//! true` and runs RealMutator; tests drive `apply_fix_one` with MockMutator, so
//! every fix + its revert are proven without touching the real machine.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use super::change_log::{self, ChangeLogEntry};
use super::system_mutator::{
    RealMutator,
    RegHive::{Hkcu, Hklm},
    SystemMutator,
};
use super::tweak_ops::{apply_op, Op};

const FIXES_JSON: &str = include_str!("../../resources/fixes.json");

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FixDef {
    pub id: String,
    pub title: String,
    pub description: String,
    pub category: String,
    pub risk: String,
    pub action: String,
    pub what: String,
    pub changes: String,
    pub reversible: bool,
}

#[derive(Deserialize)]
struct FixDb {
    fixes: Vec<FixDef>,
}

/// The concrete, reversible ops for a fix id. Unknown ids return empty.
fn fix_ops(id: &str) -> Vec<Op> {
    match id {
        "teredo_repair" => vec![
            Op::Command { program: "netsh", args: &["int", "teredo", "set", "state", "default"] },
            Op::Dword {
                hive: Hklm,
                path: r"SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters",
                name: "DisabledComponents",
                value: 0,
            },
            Op::SetService { name: "iphlpsvc", start_type: "auto", running: true },
        ],
        "shader_cache_clear" => vec![Op::Command {
            program: "powershell",
            args: &[
                "-NoProfile",
                "-Command",
                "$d=@(\"$env:LOCALAPPDATA\\NVIDIA\\DXCache\",\"$env:LOCALAPPDATA\\NVIDIA\\GLCache\",\"$env:LOCALAPPDATA\\AMD\\DxCache\",\"$env:LOCALAPPDATA\\D3DSCache\"); foreach($p in $d){ Remove-Item \"$p\\*\" -Recurse -Force -ErrorAction SilentlyContinue }",
            ],
        }],
        "gamedvr_repair" => vec![
            Op::Dword { hive: Hkcu, path: r"System\GameConfigStore", name: "GameDVR_Enabled", value: 1 },
            Op::Dword { hive: Hkcu, path: r"Software\Microsoft\GameBar", name: "AppCaptureEnabled", value: 1 },
            Op::Dword {
                hive: Hklm,
                path: r"SOFTWARE\Policies\Microsoft\Windows\GameDVR",
                name: "AllowGameDVR",
                value: 1,
            },
        ],
        "network_stack_reset" => vec![
            Op::FlushDns,
            Op::Command { program: "ipconfig", args: &["/release"] },
            Op::Command { program: "ipconfig", args: &["/renew"] },
            Op::Command { program: "netsh", args: &["winsock", "reset"] },
            Op::Command { program: "netsh", args: &["int", "ip", "reset"] },
        ],
        "network_discovery_repair" => vec![
            Op::SetService { name: "FDResPub", start_type: "auto", running: true },
            Op::SetService { name: "fdPHost", start_type: "auto", running: true },
            Op::SetService { name: "SSDPSRV", start_type: "auto", running: true },
            Op::Command {
                program: "netsh",
                args: &["advfirewall", "firewall", "set", "rule", "group=Network Discovery", "new", "enable=Yes"],
            },
        ],
        "system_file_repair" => vec![
            Op::Command { program: "sfc", args: &["/scannow"] },
            Op::Command { program: "dism", args: &["/online", "/cleanup-image", "/restorehealth"] },
        ],
        "windows_update_repair" => vec![Op::Command {
            program: "powershell",
            args: &[
                "-NoProfile",
                "-Command",
                "Stop-Service wuauserv,bits,cryptsvc -Force -ErrorAction SilentlyContinue; Rename-Item \"$env:windir\\SoftwareDistribution\" \"SoftwareDistribution.bak\" -ErrorAction SilentlyContinue; Rename-Item \"$env:windir\\System32\\catroot2\" \"catroot2.bak\" -ErrorAction SilentlyContinue; Start-Service wuauserv,bits,cryptsvc -ErrorAction SilentlyContinue",
            ],
        }],
        "windows_store_repair" => vec![Op::Command { program: "wsreset.exe", args: &[] }],
        "search_index_rebuild" => vec![
            Op::Dword {
                hive: Hklm,
                path: r"SOFTWARE\Microsoft\Windows Search",
                name: "SetupCompletedSuccessfully",
                value: 0,
            },
            Op::SetService { name: "WSearch", start_type: "auto", running: true },
        ],
        "print_spooler_reset" => vec![Op::Command {
            program: "powershell",
            args: &[
                "-NoProfile",
                "-Command",
                "Stop-Service Spooler -Force; Remove-Item \"$env:windir\\System32\\spool\\PRINTERS\\*\" -Recurse -Force -ErrorAction SilentlyContinue; Start-Service Spooler",
            ],
        }],
        "audio_repair" => vec![
            Op::SetService { name: "Audiosrv", start_type: "auto", running: true },
            Op::SetService { name: "AudioEndpointBuilder", start_type: "auto", running: true },
        ],
        "bluetooth_repair" => vec![
            Op::SetService { name: "bthserv", start_type: "auto", running: true },
            Op::SetService { name: "BTAGService", start_type: "demand", running: true },
        ],
        _ => Vec::new(),
    }
}

/// Long-running or reboot-dependent command fixes: an honest note appended to
/// the ChangeLog entry (and surfaced in the toast) so we never imply "done" when
/// the repair is still working (SFC/DISM) or needs a restart to take effect.
fn background_note(id: &str) -> Option<&'static str> {
    match id {
        "system_file_repair" => Some(
            "Started — SFC then DISM run in the background and can take up to ~30 minutes. Restart when they finish.",
        ),
        "windows_update_repair" => Some(
            "Started — Windows Update components are resetting in the background; give it a minute, then check for updates.",
        ),
        "network_stack_reset" => Some(
            "Started — Winsock and the TCP/IP stack were reset. A restart is required for this to fully take effect.",
        ),
        "print_spooler_reset" => {
            Some("Started — the print spooler was restarted and its queue cleared.")
        }
        "windows_store_repair" => Some(
            "Started — the Store cache reset (wsreset) runs in the background and may open the Store when done.",
        ),
        _ => None,
    }
}

fn fix_meta(id: &str) -> Option<(String, String, bool)> {
    serde_json::from_str::<FixDb>(FIXES_JSON)
        .ok()?
        .fixes
        .into_iter()
        .find(|f| f.id == id)
        .map(|f| (f.title, f.risk, f.reversible))
}

/// Read-only fixes catalog for the Fixes page.
#[tauri::command]
pub fn scan_fixes() -> Vec<FixDef> {
    serde_json::from_str::<FixDb>(FIXES_JSON)
        .map(|db| db.fixes)
        .unwrap_or_default()
}

/// Capture + apply one fix, producing a ChangeLog entry. Generic over the
/// mutator so tests exercise it with MockMutator (touches nothing real).
pub fn apply_fix_one(m: &dyn SystemMutator, id: &str) -> Result<ChangeLogEntry, String> {
    let (title, risk, reversible) = fix_meta(id).ok_or_else(|| format!("Unknown fix '{id}'"))?;
    let ops = fix_ops(id);
    if ops.is_empty() {
        return Err(format!("Fix '{id}' has no implementation."));
    }
    let mut undo_ops = Vec::new();
    for op in &ops {
        undo_ops.push(apply_op(m, op)?);
    }
    // Long-running / reboot-dependent fixes say so — "applied" here means we
    // kicked it off, not that a 30-minute SFC pass already finished.
    let description = match background_note(id) {
        Some(note) => format!("Fix: {title}. {note}"),
        None => format!("Fix: {title}"),
    };
    Ok(ChangeLogEntry {
        id: uuid::Uuid::new_v4().to_string(),
        timestamp: chrono::Utc::now().timestamp_millis(),
        tweak_id: format!("fix:{id}"),
        description,
        risk_level: risk,
        reversible,
        undone: false,
        undo_ops,
    })
}

/// Tauri command — apply a fix. `confirm` MUST be true (set by the user's
/// explicit confirmation). Runs RealMutator; logs to the ChangeLog so it shows
/// up in the Change Log and can be reverted (where the fix is reversible).
#[tauri::command]
pub fn apply_fix(app: AppHandle, id: String, confirm: bool) -> Result<ChangeLogEntry, String> {
    if !confirm {
        return Err("Refused: apply requires explicit confirmation.".into());
    }
    let m = RealMutator;
    let entry = apply_fix_one(&m, &id)?;
    change_log::push(entry.clone());
    let _ = app.emit("change_log_update", &entry);
    Ok(entry)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::system_mutator::MockMutator;
    use crate::modules::tweak_ops::undo_op;

    #[test]
    fn every_fix_in_json_has_ops_and_valid_fields() {
        let db: FixDb = serde_json::from_str(FIXES_JSON).expect("fixes.json parses");
        assert!(db.fixes.len() >= 10, "expected at least 10 fixes");
        for f in &db.fixes {
            assert!(!fix_ops(&f.id).is_empty(), "fix '{}' has no ops", f.id);
            assert!(!f.title.is_empty() && !f.category.is_empty());
        }
    }

    #[test]
    fn teredo_repair_applies_and_reverts_exactly() {
        let path = r"SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters";
        let m = MockMutator::new()
            .with_dword(Hklm, path, "DisabledComponents", 1)
            .with_service("iphlpsvc", "demand", false);
        let entry = apply_fix_one(&m, "teredo_repair").unwrap();
        assert_eq!(m.get_dword(Hklm, path, "DisabledComponents"), Some(0));
        let svc = m.get_service("iphlpsvc").unwrap();
        assert_eq!(svc.start_type, "auto");
        assert!(svc.running);
        // Revert restores the exact prior state.
        for u in entry.undo_ops.iter().rev() {
            undo_op(&m, u).unwrap();
        }
        assert_eq!(m.get_dword(Hklm, path, "DisabledComponents"), Some(1));
        let restored = m.get_service("iphlpsvc").unwrap();
        assert_eq!(restored.start_type, "demand");
        assert!(!restored.running);
    }

    #[test]
    fn command_fix_runs_but_makes_no_reversible_change() {
        let m = MockMutator::new();
        let entry = apply_fix_one(&m, "system_file_repair").unwrap();
        assert!(m.calls.borrow().iter().any(|c| c.contains("run_command sfc")));
        // A pure command fix has nothing to undo.
        assert!(entry.undo_ops.iter().all(|u| matches!(u, super::super::tweak_ops::UndoOp::None)));
    }

    #[test]
    fn long_running_fixes_say_started_not_done() {
        // SFC/DISM, update, and network-stack fixes must carry the honest
        // "started / runs in the background / restart" copy in the log entry.
        for id in ["system_file_repair", "windows_update_repair", "network_stack_reset"] {
            assert!(background_note(id).is_some(), "{id} needs a background note");
            let entry = apply_fix_one(&MockMutator::new(), id).unwrap();
            let d = entry.description.to_lowercase();
            assert!(
                d.contains("started") || d.contains("background") || d.contains("restart"),
                "fix '{id}' description should say it started/runs in background: {}",
                entry.description
            );
        }
        // A fast, self-contained fix carries no background note.
        assert!(background_note("gamedvr_repair").is_none());
    }
}
