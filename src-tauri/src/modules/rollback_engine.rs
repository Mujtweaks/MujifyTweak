//! Checkpoint 10 — RollbackEngine.
//!
//! Restores the exact captured before-state from ChangeLog entries — per-entry
//! or all at once — using the same mutator boundary the apply path uses. Undo
//! ops replay in reverse application order. Entries are marked `undone`, never
//! deleted, so the log stays a complete history.
//!
//! Real reverts run `RealMutator` and only in response to an explicit user
//! click (the confirm gate lives in the UI). The reverse logic itself is proven
//! by the tweak_ops tests under MockMutator.

use tauri::{AppHandle, Emitter};

use super::change_log;
use super::system_mutator::{RealMutator, SystemMutator};
use super::tweak_ops::undo_op;

fn revert_entry(m: &dyn SystemMutator, entry_id: &str) -> Result<(), String> {
    let entry = change_log::take_active(entry_id)
        .ok_or_else(|| "No active change with that id.".to_string())?;
    // Reverse order — last applied op is undone first.
    for undo in entry.undo_ops.iter().rev() {
        undo_op(m, undo)?;
    }
    change_log::mark_undone(entry_id);
    Ok(())
}

/// Tauri command — undo a single change. Confirm gate is in the UI.
#[tauri::command]
pub fn revert_single(app: AppHandle, entry_id: String, confirm: bool) -> Result<(), String> {
    if !confirm {
        return Err("Refused: revert requires explicit confirmation.".into());
    }
    let mutator = RealMutator;
    revert_entry(&mutator, &entry_id)?;
    let _ = app.emit("change_log_reverted", &entry_id);
    Ok(())
}

/// Tauri command — undo everything still active, newest first.
#[tauri::command]
pub fn revert_all(app: AppHandle, confirm: bool) -> Result<usize, String> {
    if !confirm {
        return Err("Refused: revert requires explicit confirmation.".into());
    }
    let mutator = RealMutator;
    let active = change_log::active_entries(); // already newest-first
    let mut count = 0;
    for entry in active {
        if revert_entry(&mutator, &entry.id).is_ok() {
            count += 1;
        }
    }
    let _ = app.emit("change_log_reverted", "all");
    Ok(count)
}

/// Revert a specific set of active ChangeLog entries by id — used by the
/// auto-apply gate on game exit and by crash recovery on startup. Same reverse
/// logic as a manual undo (RealMutator); silently skips ids already reverted or
/// unknown. Returns how many were actually reverted.
pub fn revert_by_ids(app: &AppHandle, ids: &[String]) -> usize {
    let mutator = RealMutator;
    let mut count = 0;
    for id in ids {
        if revert_entry(&mutator, id).is_ok() {
            let _ = app.emit("change_log_reverted", id);
            count += 1;
        }
    }
    count
}

/// Read-only — current change log for the UI.
#[tauri::command]
pub fn get_change_log() -> Vec<change_log::ChangeLogEntry> {
    let mut all = change_log::all();
    all.reverse(); // newest first for display
    all
}

/// Summary of a headless revert-all (used by the uninstaller / --revert-all CLI).
#[derive(Debug, Default)]
pub struct RevertSummary {
    pub reverted: usize,
    pub failed: usize,
    pub reverted_ids: Vec<String>,
    pub descriptions: Vec<String>,
}

/// Reverse a set of change-log entries (newest-first) through a mutator. With
/// `dry_run`, nothing is applied — it only reports what WOULD be reverted, so
/// the uninstaller's `--revert-all --dry-run` is completely safe to run. Pure
/// over the mutator + entries: MockMutator proves it without touching the real
/// machine or the persisted log. This is the engine behind uninstall safety —
/// a user who removes Mujify with tweaks still applied gets their original
/// Windows settings back before the files are deleted.
pub fn revert_entries(
    m: &dyn SystemMutator,
    entries: &[change_log::ChangeLogEntry],
    dry_run: bool,
) -> RevertSummary {
    let mut s = RevertSummary::default();
    for entry in entries {
        if dry_run {
            s.reverted += 1;
            s.reverted_ids.push(entry.id.clone());
            s.descriptions.push(entry.description.clone());
            continue;
        }
        // Reverse order — last-applied op is undone first.
        let mut ok = true;
        for undo in entry.undo_ops.iter().rev() {
            if undo_op(m, undo).is_err() {
                ok = false;
            }
        }
        if ok {
            s.reverted += 1;
            s.reverted_ids.push(entry.id.clone());
            s.descriptions.push(entry.description.clone());
        } else {
            s.failed += 1;
        }
    }
    s
}

#[cfg(test)]
mod tests {
    use super::super::system_mutator::{MockMutator, RegHive, SystemMutator};
    use super::super::tweak_ops::{apply_op, ops_for, undo_op, UndoOp};

    // End-to-end reversibility through the same helpers the engine uses.
    #[test]
    fn full_apply_then_reverse_restores_everything() {
        let m = MockMutator::new()
            .with_dword(RegHive::Hkcu, r"System\GameConfigStore", "GameDVR_Enabled", 1);

        // Apply two tweaks, collecting undo ops in application order.
        let mut undos: Vec<UndoOp> = Vec::new();
        for id in ["power_high_perf", "disable_game_bar"] {
            for op in ops_for(id) {
                undos.push(apply_op(&m, &op).unwrap());
            }
        }
        assert_eq!(m.active_power_plan_guid().unwrap(), super::super::tweak_ops::HIGH_PERF_GUID);
        assert_eq!(m.get_dword(RegHive::Hkcu, r"System\GameConfigStore", "GameDVR_Enabled"), Some(0));

        // Revert all in reverse.
        for u in undos.iter().rev() {
            undo_op(&m, u).unwrap();
        }
        assert_eq!(m.active_power_plan_guid().unwrap(), "BALANCED-GUID");
        // GameDVR_Enabled restored to its real prior value (1), not deleted.
        assert_eq!(m.get_dword(RegHive::Hkcu, r"System\GameConfigStore", "GameDVR_Enabled"), Some(1));
    }

    // The uninstaller's revert-all: dry-run reports but changes nothing; the real
    // run restores the exact prior state. Proven under MockMutator (never runs on
    // a real machine here).
    #[test]
    fn revert_entries_dry_run_is_safe_then_real_restores() {
        use super::super::change_log::ChangeLogEntry;
        let m = MockMutator::new();
        let undos: Vec<UndoOp> = ops_for("power_high_perf")
            .iter()
            .map(|o| apply_op(&m, o).unwrap())
            .collect();
        assert_eq!(m.active_power_plan_guid().unwrap(), super::super::tweak_ops::HIGH_PERF_GUID);
        let entry = ChangeLogEntry {
            id: "e1".into(),
            timestamp: 0,
            tweak_id: "power_high_perf".into(),
            description: "High Performance Power Plan".into(),
            risk_level: "safe".into(),
            reversible: true,
            undone: false,
            undo_ops: undos,
        };
        // Dry run: counts it, but the plan is STILL high-perf (nothing changed).
        let dry = super::revert_entries(&m, std::slice::from_ref(&entry), true);
        assert_eq!(dry.reverted, 1);
        assert_eq!(dry.reverted_ids, vec!["e1".to_string()]);
        assert_eq!(m.active_power_plan_guid().unwrap(), super::super::tweak_ops::HIGH_PERF_GUID);
        // Real run: restores the original Balanced plan.
        let real = super::revert_entries(&m, std::slice::from_ref(&entry), false);
        assert_eq!(real.reverted, 1);
        assert_eq!(real.failed, 0);
        assert_eq!(m.active_power_plan_guid().unwrap(), "BALANCED-GUID");
    }
}
