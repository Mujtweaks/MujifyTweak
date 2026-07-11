//! Plain-English change log — the transparency backbone.
//!
//! Every applied tweak becomes one entry carrying before/after undo data, a
//! risk level, and a human description. Entries are never deleted (undo only
//! flips `undone` + annotates), and the whole log persists to AppData so a
//! Revert All still works after an app restart. Held in a process-global Mutex
//! so commands, the monitor, and the rollback engine share one source of truth.

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use super::tweak_ops::UndoOp;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChangeLogEntry {
    pub id: String,
    pub timestamp: i64,
    pub tweak_id: String,
    pub description: String,
    pub risk_level: String,
    pub reversible: bool,
    pub undone: bool,
    /// Ops needed to reverse this entry, in application order.
    pub undo_ops: Vec<UndoOp>,
}

static LOG: Mutex<Vec<ChangeLogEntry>> = Mutex::new(Vec::new());

fn log_path() -> Option<PathBuf> {
    let base = std::env::var("APPDATA").ok()?;
    let dir = PathBuf::from(base).join("MujifyTweaks");
    fs::create_dir_all(&dir).ok()?;
    Some(dir.join("change_log.json"))
}

fn persist() {
    if let Some(path) = log_path() {
        if let Ok(json) = serde_json::to_string_pretty(&*LOG.lock().unwrap_or_else(|e| e.into_inner())) {
            let _ = fs::write(path, json);
        }
    }
}

/// Load persisted entries on startup (so Revert All survives a restart).
pub fn load() {
    if let Some(path) = log_path() {
        if let Ok(text) = fs::read_to_string(&path) {
            if let Ok(entries) = serde_json::from_str::<Vec<ChangeLogEntry>>(&text) {
                *LOG.lock().unwrap_or_else(|e| e.into_inner()) = entries;
            }
        }
    }
}

pub fn push(entry: ChangeLogEntry) {
    LOG.lock().unwrap_or_else(|e| e.into_inner()).push(entry);
    persist();
}

pub fn all() -> Vec<ChangeLogEntry> {
    LOG.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

/// Find the most recent not-yet-undone entry for a tweak (used by revert).
pub fn take_active(entry_id: &str) -> Option<ChangeLogEntry> {
    let log = LOG.lock().unwrap_or_else(|e| e.into_inner());
    log.iter()
        .find(|e| e.id == entry_id && !e.undone)
        .cloned()
}

pub fn mark_undone(entry_id: &str) {
    {
        let mut log = LOG.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(e) = log.iter_mut().find(|e| e.id == entry_id) {
            e.undone = true;
        }
    }
    persist();
}

/// Active (not undone) entries, most recent first.
pub fn active_entries() -> Vec<ChangeLogEntry> {
    let mut v: Vec<ChangeLogEntry> = LOG
        .lock()
        .unwrap()
        .iter()
        .filter(|e| !e.undone)
        .cloned()
        .collect();
    v.reverse();
    v
}
