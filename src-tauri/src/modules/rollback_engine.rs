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

/// Read-only — current change log for the UI.
#[tauri::command]
pub fn get_change_log() -> Vec<change_log::ChangeLogEntry> {
    let mut all = change_log::all();
    all.reverse(); // newest first for display
    all
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
}
