//! Auto-apply gate — the SERVER-side guard for per-game auto-optimization.
//!
//! The auto-apply path never trusts the frontend. This module owns:
//!   1. the master switch, persisted HERE (synced from Settings) — the frontend
//!      cannot flip the real gate just by editing its own localStorage;
//!   2. the applied-state record (which ChangeLog entries a running game's
//!      profile applied), persisted to disk so an app crash can't leave tweaks
//!      stuck on — on next launch we revert a stale record;
//!   3. the actual apply, which re-reads the game's saved profile server-side
//!      (master on + the profile's own `auto_apply` flag + the profile's tweak
//!      list) before touching anything.
//!
//! Everything still flows through `tweaks_engine::apply_one` → AntiCheatGuard →
//! ChangeLog, exactly like a manual apply. Nothing here bypasses that pipeline,
//! and the tweak list comes from the saved profile, never from the caller.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use super::anti_cheat_guard;
use super::change_log;
use super::profile_store;
use super::rollback_engine;
use super::system_mutator::RealMutator;
use super::tweaks_engine::{apply_one, ApplyOutcome};

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AutoApplyState {
    /// Master switch, mirrored from Settings. The gate reads THIS, not the UI.
    master_enabled: bool,
    /// The game whose profile is currently auto-applied (None when idle).
    active_game: Option<String>,
    /// ChangeLog entry ids applied for `active_game`, to revert on exit/crash.
    applied_entry_ids: Vec<String>,
}

fn state_path() -> Option<PathBuf> {
    let base = std::env::var("APPDATA").ok()?;
    let dir = PathBuf::from(base).join("MujifyTweaks");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join("auto_apply.json"))
}

fn load() -> AutoApplyState {
    state_path()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn save(state: &AutoApplyState) {
    if let Some(p) = state_path() {
        if let Ok(json) = serde_json::to_string_pretty(state) {
            let _ = std::fs::write(p, json);
        }
    }
}

/// Pure gate decision: what to auto-apply given the master switch and the
/// profile-derived tweak list. Master off → nothing, whatever the profile says.
/// (The profile opt-in + tweak selection is enforced in `profile_store`; this is
/// the second, independent gate the frontend cannot satisfy on its own.)
fn gated(master: bool, profile_tweaks: Vec<String>) -> Vec<String> {
    if master {
        profile_tweaks
    } else {
        Vec::new()
    }
}

/// The server-side master switch value (the gate's source of truth).
pub fn master_enabled() -> bool {
    load().master_enabled
}

/// Sync the master switch from Settings. The gate reads the persisted value, so
/// the frontend toggling its own store is not enough to enable auto-apply — this
/// command has to have run and written `true` first.
#[tauri::command]
pub fn set_auto_apply_master(enabled: bool) {
    let mut s = load();
    s.master_enabled = enabled;
    save(&s);
}

/// Read the persisted master switch (so the UI can reconcile with the backend).
#[tauri::command]
pub fn get_auto_apply_master() -> bool {
    master_enabled()
}

/// Auto-apply a game's opted-in profile — verified end to end on the server.
/// Refuses unless (1) the master switch is on AND (2) the game has a saved
/// profile with `auto_apply` on and at least one tweak. The tweak list comes
/// from that profile, not the caller. Records what it applied so exit/crash can
/// revert exactly that, and nothing else.
#[tauri::command]
pub fn auto_apply_profile(app: AppHandle, game_name: String) -> Result<ApplyOutcome, String> {
    let ids = gated(
        master_enabled(),
        profile_store::auto_apply_tweaks_for(&game_name),
    );
    if ids.is_empty() {
        return Err("Auto-apply is off, or this game has no opted-in profile.".into());
    }

    let mutator = RealMutator;
    // Auto-apply is unattended, so re-check anti-cheat on the backend every time.
    let protected = anti_cheat_guard::detect_active();
    let mut applied = Vec::new();
    let mut blocked = Vec::new();
    for id in &ids {
        match apply_one(&mutator, id, protected) {
            Ok(entry) => {
                change_log::push(entry.clone());
                let _ = app.emit("change_log_update", &entry);
                applied.push(entry);
            }
            Err(msg) => {
                super::logger::warn(format!("auto-apply '{id}' not applied: {msg}"));
                blocked.push(format!("{id}: {msg}"));
            }
        }
    }

    // Persist what we applied so a crash before game-exit can't strand it.
    let mut s = load();
    s.active_game = Some(game_name);
    s.applied_entry_ids = applied.iter().map(|e| e.id.clone()).collect();
    save(&s);

    Ok(ApplyOutcome { applied, blocked })
}

/// Revert exactly what the last auto-apply applied (on game exit / switch), and
/// clear the persisted record. Returns how many entries were reverted.
#[tauri::command]
pub fn auto_revert_profile(app: AppHandle) -> usize {
    let mut s = load();
    let ids = std::mem::take(&mut s.applied_entry_ids);
    s.active_game = None;
    save(&s);
    rollback_engine::revert_by_ids(&app, &ids)
}

/// Startup crash recovery: if a previous session recorded auto-applied tweaks
/// but never got to revert them (app closed/crashed while a game was running),
/// revert them now so nothing is left stuck on. The ChangeLog persists across
/// restarts, so those entries are still active and revert cleanly. Safe no-op
/// when the record is empty.
pub fn recover_stale(app: &AppHandle) {
    let mut s = load();
    if s.applied_entry_ids.is_empty() {
        return;
    }
    let ids = std::mem::take(&mut s.applied_entry_ids);
    let game = s.active_game.take().unwrap_or_default();
    save(&s);
    let n = rollback_engine::revert_by_ids(app, &ids);
    if n > 0 {
        super::logger::info(format!(
            "auto-apply crash recovery: reverted {n} stranded tweak(s) from {game}"
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn master_off_blocks_everything() {
        // Even a fully opted-in profile's tweaks are dropped when master is off.
        assert!(gated(false, vec!["power_high_perf".into(), "mouse_accel_off".into()]).is_empty());
    }

    #[test]
    fn master_on_passes_profile_tweaks_through() {
        assert_eq!(
            gated(true, vec!["power_high_perf".into()]),
            vec!["power_high_perf".to_string()]
        );
    }

    #[test]
    fn master_on_with_no_profile_tweaks_is_still_empty() {
        // Master on but the profile gate returned nothing → still a no-op.
        assert!(gated(true, vec![]).is_empty());
    }
}
