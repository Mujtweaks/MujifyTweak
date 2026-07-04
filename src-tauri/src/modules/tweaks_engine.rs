//! Checkpoint 8b/9 — TweaksEngine (the single apply gateway).
//!
//! EVERY state-changing path — the Optimizer, the Tweaks tab, and later the AI
//! assistant — routes through `apply_one`. It: (1) refuses ALWAYS_BLOCKED ops,
//! (2) refuses when a protected anti-cheat process is live, (3) captures the
//! precise before-state, (4) applies, (5) writes one ChangeLog entry. There is
//! no second, unlogged way to change the system.
//!
//! The Tauri `apply_tweaks` command REQUIRES an explicit `confirm: true` set by
//! the user's per-action confirmation in the UI, and it runs `RealMutator`. It
//! is never called by tests or tooling. Tests drive `apply_one` with
//! `MockMutator`, so the logic is proven without touching the real machine.

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::anti_cheat_guard;
use super::change_log::{self, ChangeLogEntry};
use super::system_mutator::{RealMutator, SystemMutator};
use super::tweak_ops::{apply_op, ops_for};
use super::tweak_catalog;

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn meta_for(tweak_id: &str) -> (String, String, bool) {
    // (description, risk, reversible) pulled from the catalog where possible.
    let info = tweak_catalog::info_for(tweak_id);
    match info {
        Some(i) => (
            i.title,
            match i.risk {
                tweak_catalog::Risk::Safe => "safe",
                tweak_catalog::Risk::Moderate => "moderate",
                tweak_catalog::Risk::Advanced => "advanced",
            }
            .to_string(),
            tweak_id != "flush_dns", // flush is one-shot, not state-reversible
        ),
        None => (tweak_id.to_string(), "safe".to_string(), true),
    }
}

/// Core apply for one tweak. Generic over the mutator so tests use MockMutator.
/// Returns the created ChangeLog entry (not yet pushed) or an error/blocked note.
pub fn apply_one(
    m: &dyn SystemMutator,
    tweak_id: &str,
    protected_active: bool,
) -> Result<ChangeLogEntry, String> {
    if anti_cheat_guard::is_blocked(tweak_id) {
        return Err(format!("Operation '{tweak_id}' is permanently blocked."));
    }
    let (description, risk_level, reversible) = meta_for(tweak_id);

    // Restricted categories are refused while a protected game is running.
    if protected_active && risk_level != "safe" {
        return Err("Blocked: a protected anti-cheat game is running.".into());
    }

    let ops = ops_for(tweak_id);
    if ops.is_empty() {
        return Err(format!("'{tweak_id}' has no apply implementation yet."));
    }

    let mut undo_ops = Vec::new();
    for op in &ops {
        undo_ops.push(apply_op(m, op)?);
    }

    Ok(ChangeLogEntry {
        id: uuid::Uuid::new_v4().to_string(),
        timestamp: now_ms(),
        tweak_id: tweak_id.to_string(),
        description,
        risk_level,
        reversible,
        undone: false,
        undo_ops,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyOutcome {
    pub applied: Vec<ChangeLogEntry>,
    pub blocked: Vec<String>,
}

/// Tauri command — apply a set of tweaks. `confirm` MUST be true (set by the
/// user's explicit per-action confirmation). Uses the RealMutator. Every result
/// is logged; nothing here runs without the user's click.
#[tauri::command]
pub fn apply_tweaks(
    app: AppHandle,
    ids: Vec<String>,
    confirm: bool,
    anti_cheat_active: bool,
) -> Result<ApplyOutcome, String> {
    if !confirm {
        return Err("Refused: apply requires explicit confirmation.".into());
    }
    let mutator = RealMutator;
    let mut applied = Vec::new();
    let mut blocked = Vec::new();

    for id in ids {
        match apply_one(&mutator, &id, anti_cheat_active) {
            Ok(entry) => {
                change_log::push(entry.clone());
                let _ = app.emit("change_log_update", &entry);
                applied.push(entry);
            }
            Err(msg) => blocked.push(format!("{id}: {msg}")),
        }
    }
    Ok(ApplyOutcome { applied, blocked })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::system_mutator::{MockMutator, RegHive};

    #[test]
    fn apply_one_logs_and_is_reversible() {
        let m = MockMutator::new();
        let entry = apply_one(&m, "power_high_perf", false).unwrap();
        assert_eq!(entry.tweak_id, "power_high_perf");
        assert!(entry.reversible);
        assert!(!entry.undo_ops.is_empty());
        assert_eq!(m.active_power_plan_guid().unwrap(), super::super::tweak_ops::HIGH_PERF_GUID);
    }

    #[test]
    fn moderate_tweak_blocked_when_protected_game_running() {
        let m = MockMutator::new();
        // A moderate-risk tweak must refuse while anti-cheat is active.
        let res = apply_one(&m, "power_ultimate", true);
        assert!(res.is_err());
        // ...and nothing was written.
        assert!(m.calls.borrow().is_empty());
    }

    #[test]
    fn safe_tweak_allowed_when_protected_game_running() {
        let m = MockMutator::new();
        let res = apply_one(&m, "mouse_accel_off", true);
        assert!(res.is_ok());
        assert_eq!(m.get_sz(RegHive::Hkcu, r"Control Panel\Mouse", "MouseSpeed").unwrap(), "0");
    }
}
