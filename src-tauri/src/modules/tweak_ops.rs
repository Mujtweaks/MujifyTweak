//! Concrete, reversible operations behind each tweak.
//!
//! A tweak is a list of `Op`s. Applying an Op first CAPTURES the current value
//! (producing an `UndoOp`), then writes the new value. Rollback replays the
//! `UndoOp`s in reverse. This is what makes "one-click Revert All" restore the
//! exact pre-tweak state rather than a generic default.
//!
//! All logic here is written against the `SystemMutator` trait, so it is fully
//! exercised by `MockMutator` in tests without touching the real system.

use serde::{Deserialize, Serialize};

use super::system_mutator::{RegHive, SystemMutator};

/// Windows "High performance" power scheme — a well-known fixed GUID.
pub const HIGH_PERF_GUID: &str = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c";

#[derive(Clone)]
pub enum Op {
    PowerPlan { guid: &'static str },
    Dword { hive: RegHive, path: &'static str, name: &'static str, value: u32 },
    Sz { hive: RegHive, path: &'static str, name: &'static str, value: &'static str },
    FlushDns,
}

/// Captured before-state, enough to precisely reverse one Op.
#[derive(Serialize, Deserialize, Clone)]
#[serde(tag = "kind")]
pub enum UndoOp {
    PowerPlan { guid: String },
    Dword { hive: RegHive, path: String, name: String, prev: Option<u32> },
    Sz { hive: RegHive, path: String, name: String, prev: Option<String> },
    None,
}

/// Capture + apply one Op. Returns the UndoOp needed to reverse it.
pub fn apply_op(m: &dyn SystemMutator, op: &Op) -> Result<UndoOp, String> {
    match op {
        Op::PowerPlan { guid } => {
            let prev = m.active_power_plan_guid().unwrap_or_default();
            m.set_power_plan(guid)?;
            Ok(UndoOp::PowerPlan { guid: prev })
        }
        Op::Dword { hive, path, name, value } => {
            let prev = m.get_dword(*hive, path, name);
            m.set_dword(*hive, path, name, *value)?;
            Ok(UndoOp::Dword { hive: *hive, path: path.to_string(), name: name.to_string(), prev })
        }
        Op::Sz { hive, path, name, value } => {
            let prev = m.get_sz(*hive, path, name);
            m.set_sz(*hive, path, name, value)?;
            Ok(UndoOp::Sz { hive: *hive, path: path.to_string(), name: name.to_string(), prev })
        }
        Op::FlushDns => {
            m.flush_dns()?;
            Ok(UndoOp::None) // transient cache; nothing to restore
        }
    }
}

/// Reverse one previously-applied Op from its captured UndoOp.
pub fn undo_op(m: &dyn SystemMutator, undo: &UndoOp) -> Result<(), String> {
    match undo {
        UndoOp::PowerPlan { guid } => {
            if !guid.is_empty() {
                m.set_power_plan(guid)?;
            }
            Ok(())
        }
        UndoOp::Dword { hive, path, name, prev } => match prev {
            Some(v) => m.set_dword(*hive, path, name, *v),
            None => m.delete_value(*hive, path, name),
        },
        UndoOp::Sz { hive, path, name, prev } => match prev {
            Some(v) => m.set_sz(*hive, path, name, v),
            None => m.delete_value(*hive, path, name),
        },
        UndoOp::None => Ok(()),
    }
}

/// The concrete op list for a tweak id. Unknown ids return empty (nothing runs).
/// Only fully-reversible, genuinely-safe tweaks are wired for apply right now;
/// the rest of the catalog remains scan-only until individually implemented.
pub fn ops_for(tweak_id: &str) -> Vec<Op> {
    match tweak_id {
        "power_high_perf" => vec![Op::PowerPlan { guid: HIGH_PERF_GUID }],
        "disable_game_bar" => vec![
            Op::Dword { hive: RegHive::Hkcu, path: r"Software\Microsoft\GameBar", name: "AppCaptureEnabled", value: 0 },
            Op::Dword { hive: RegHive::Hkcu, path: r"System\GameConfigStore", name: "GameDVR_Enabled", value: 0 },
        ],
        "mouse_accel_off" => vec![
            Op::Sz { hive: RegHive::Hkcu, path: r"Control Panel\Mouse", name: "MouseSpeed", value: "0" },
            Op::Sz { hive: RegHive::Hkcu, path: r"Control Panel\Mouse", name: "MouseThreshold1", value: "0" },
            Op::Sz { hive: RegHive::Hkcu, path: r"Control Panel\Mouse", name: "MouseThreshold2", value: "0" },
        ],
        "flush_dns" => vec![Op::FlushDns],
        _ => Vec::new(),
    }
}

/// Whether an apply path exists for this tweak id yet (UI shows others as
/// scan-only, never as a fake "apply" button that does nothing).
pub fn is_appliable(tweak_id: &str) -> bool {
    !ops_for(tweak_id).is_empty()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::system_mutator::MockMutator;

    #[test]
    fn power_plan_applies_and_reverts_exactly() {
        let m = MockMutator::new(); // starts at "BALANCED-GUID"
        let undos: Vec<UndoOp> = ops_for("power_high_perf")
            .iter()
            .map(|op| apply_op(&m, op).unwrap())
            .collect();
        assert_eq!(m.active_power_plan_guid().unwrap(), HIGH_PERF_GUID);

        for u in undos.iter().rev() {
            undo_op(&m, u).unwrap();
        }
        // Restored to the exact prior plan, not a generic default.
        assert_eq!(m.active_power_plan_guid().unwrap(), "BALANCED-GUID");
    }

    #[test]
    fn game_bar_undo_deletes_values_that_did_not_exist() {
        let m = MockMutator::new(); // no GameBar values present
        let undos: Vec<UndoOp> = ops_for("disable_game_bar")
            .iter()
            .map(|op| apply_op(&m, op).unwrap())
            .collect();
        assert_eq!(m.get_dword(RegHive::Hkcu, r"Software\Microsoft\GameBar", "AppCaptureEnabled"), Some(0));

        for u in undos.iter().rev() {
            undo_op(&m, u).unwrap();
        }
        // Values that didn't exist before are removed, not left at 0.
        assert_eq!(m.get_dword(RegHive::Hkcu, r"Software\Microsoft\GameBar", "AppCaptureEnabled"), None);
    }

    #[test]
    fn game_bar_undo_restores_prior_value() {
        // AppCaptureEnabled was already 1 → undo must put back 1, not delete.
        let m = MockMutator::new()
            .with_dword(RegHive::Hkcu, r"Software\Microsoft\GameBar", "AppCaptureEnabled", 1);
        let undos: Vec<UndoOp> = ops_for("disable_game_bar")
            .iter()
            .map(|op| apply_op(&m, op).unwrap())
            .collect();
        assert_eq!(m.get_dword(RegHive::Hkcu, r"Software\Microsoft\GameBar", "AppCaptureEnabled"), Some(0));

        for u in undos.iter().rev() {
            undo_op(&m, u).unwrap();
        }
        assert_eq!(m.get_dword(RegHive::Hkcu, r"Software\Microsoft\GameBar", "AppCaptureEnabled"), Some(1));
    }
}
