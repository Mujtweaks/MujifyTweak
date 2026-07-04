//! Checkpoints 4–5 (detection half) + the permanent hard-blocked list.
//!
//! Two jobs:
//!  1. Detect when a known anti-cheat driver/service is live, so the UI can show
//!     "Protected Game Active" and (later) TweaksEngine can refuse risky tweaks.
//!  2. Hold the ALWAYS_BLOCKED list of operations that are never permitted —
//!     not by the user, not by the AI. This is enforcement, not a suggestion.

use serde::Serialize;

/// Known anti-cheat process names (lowercased, without .exe).
pub const ANTI_CHEAT_PROCESSES: &[&str] = &[
    "easyanticheat",
    "easyanticheat_eos",
    "beservice",
    "battleye",
    "vgc",
    "vgtray",
    "vanguard",
    "faceit",
    "faceitservice",
    "gameguard",
    "gg",
    "mhyprot",
    "ricochet",
    "aceclient",
    "sguard",
];

/// Operations that will NEVER be executed regardless of caller (incl. the AI).
/// This is the anti-cheat-safe-by-construction guarantee in code form.
/// Consumed by TweaksEngine's guard at Checkpoint 8b — kept now so the invariant
/// exists in code before any apply path does.
#[allow(dead_code)]
pub const ALWAYS_BLOCKED: &[&str] = &[
    "write_process_memory",
    "create_remote_thread",
    "inject_dll",
    "install_driver",
    "hook_game_process",
    "modify_anticheat_files",
    "open_game_process_vm_write",
];

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AntiCheatStatus {
    pub active: bool,
    pub detected: Vec<String>,
}

/// Given a snapshot of lowercased process stems, report anti-cheat presence.
pub fn evaluate(process_stems: &[String]) -> AntiCheatStatus {
    let mut detected: Vec<String> = ANTI_CHEAT_PROCESSES
        .iter()
        .filter(|ac| process_stems.iter().any(|p| p == *ac || p.contains(*ac)))
        .map(|s| s.to_string())
        .collect();
    detected.dedup();
    AntiCheatStatus {
        active: !detected.is_empty(),
        detected,
    }
}

/// Central guard every state-changing path must consult before executing.
/// (Wired into TweaksEngine at Checkpoint 8+.)
#[allow(dead_code)]
pub fn is_blocked(operation: &str) -> bool {
    ALWAYS_BLOCKED.contains(&operation)
}
