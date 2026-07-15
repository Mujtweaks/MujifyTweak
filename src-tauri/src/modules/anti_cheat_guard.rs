//! Checkpoints 4–5 (detection half) + the permanent hard-blocked list.
//!
//! Two jobs:
//!  1. Detect when a known anti-cheat driver/service is live, so the UI can show
//!     "Protected Game Active" and (later) TweaksEngine can refuse risky tweaks.
//!  2. Hold the ALWAYS_BLOCKED list of operations that are never permitted —
//!     not by the user, not by the AI. This is enforcement, not a suggestion.

use serde::Serialize;

/// Known anti-cheat process names (lowercased, without .exe). Matched EXACTLY
/// against a process stem — never as a substring. A substring match here was a
/// real bug: the old list held `"gg"`, which matches any process whose name
/// merely contains those two letters, so the gate below latched on at random.
pub const ANTI_CHEAT_PROCESSES: &[&str] = &[
    "easyanticheat",
    "easyanticheat_eos",
    "easyanticheat_launcher",
    "beservice",
    "beclient",
    "battleye",
    "vgc",
    "vgtray",
    "vanguard",
    "faceit",
    "faceitservice",
    "gameguard",
    "gamemon",
    "blackcipher",
    "mhyprot",
    "ricochet",
    "aceclient",
    "acewebaccel",
    "sgguard",
    "sguard",
    "sguard64",
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
    /// The gate is ENGAGED: an anti-cheat is loaded *and* a game is actually
    /// live, so anything above Safe is refused until the game exits.
    pub active: bool,
    /// An anti-cheat is merely installed/idle in the background. Informational
    /// only — it does not restrict anything.
    pub present: bool,
    pub detected: Vec<String>,
}

/// Given a snapshot of lowercased process stems plus whether a game is actually
/// running right now, report anti-cheat presence and whether the gate engages.
///
/// The distinction matters and used to be missing. Riot Vanguard (`vgc`,
/// `vgtray`) starts at boot on every PC that has VALORANT installed and never
/// exits; EasyAntiCheat's service behaves the same way. Treating that idle
/// service as "protected game active" left the gate latched on permanently, so
/// `tweaks_engine::apply_one` refused every non-Safe tweak forever — the app
/// simply could not optimize anything. An idle anti-cheat service is not a
/// tamper-detection risk: nothing is being protected until the game is live.
/// The gate therefore engages only while a game is genuinely running.
pub fn evaluate(process_stems: &[String], game_running: bool) -> AntiCheatStatus {
    let mut detected: Vec<String> = ANTI_CHEAT_PROCESSES
        .iter()
        .filter(|ac| process_stems.iter().any(|p| p == *ac))
        .map(|s| s.to_string())
        .collect();
    detected.dedup();
    let present = !detected.is_empty();
    AntiCheatStatus {
        active: present && game_running,
        present,
        detected,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stems(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn idle_anticheat_service_does_not_engage_the_gate() {
        // Riot Vanguard runs from boot on any PC with VALORANT installed. With no
        // game running it must NOT block applies — this was the bug that made
        // "Apply" do nothing forever on those machines.
        let s = evaluate(&stems(&["vgc", "vgtray", "explorer", "chrome"]), false);
        assert!(s.present, "the anti-cheat is installed and should be reported");
        assert!(!s.active, "an idle anti-cheat service must not block optimizing");
    }

    #[test]
    fn anticheat_plus_live_game_engages_the_gate() {
        let s = evaluate(&stems(&["vgc", "valorant-win64-shipping"]), true);
        assert!(s.present);
        assert!(s.active, "a live protected game must still hold risky tweaks");
    }

    #[test]
    fn a_game_with_no_anticheat_does_not_engage_the_gate() {
        let s = evaluate(&stems(&["bloonstd6", "explorer"]), true);
        assert!(!s.present);
        assert!(!s.active);
    }

    #[test]
    fn matching_is_exact_not_substring() {
        // The old list matched substrings and contained "gg", so any process whose
        // name merely contained those letters latched the gate on.
        let s = evaluate(&stems(&["loggingservice", "eggtimer", "debugger"]), true);
        assert!(!s.present, "'gg'-style substring matches must never count");
        // A name that merely *contains* a real anti-cheat name isn't one either.
        let s = evaluate(&stems(&["easyanticheat_setup_helper"]), true);
        assert!(!s.present);
        // …but the real process still matches.
        assert!(evaluate(&stems(&["easyanticheat"]), true).present);
    }

    #[test]
    fn injection_style_operations_stay_permanently_blocked() {
        // Rule: no instruction, including from the AI, can unlock these.
        assert!(is_blocked("inject_dll"));
        assert!(is_blocked("write_process_memory"));
        assert!(is_blocked("create_remote_thread"));
        assert!(!is_blocked("power_high_perf"));
    }
}

/// Central guard every state-changing path must consult before executing.
/// (Wired into TweaksEngine at Checkpoint 8+.)
#[allow(dead_code)]
pub fn is_blocked(operation: &str) -> bool {
    ALWAYS_BLOCKED.contains(&operation)
}

/// Take a FRESH process snapshot and report whether the gate is engaged
/// server-side. TweaksEngine calls this so an apply never trusts the frontend's
/// flag alone — the pure `evaluate` above is the tested core; this just feeds it
/// live data (including whether a game is actually running).
pub fn detect_active() -> bool {
    use sysinfo::{ProcessesToUpdate, System};
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    let stems: Vec<String> = sys
        .processes()
        .values()
        .map(|p| {
            let n = p.name().to_string_lossy().to_lowercase();
            n.strip_suffix(".exe").unwrap_or(&n).to_string()
        })
        .collect();
    let game_running = super::game_detector::detect_active_game(&sys).is_some();
    evaluate(&stems, game_running).active
}
