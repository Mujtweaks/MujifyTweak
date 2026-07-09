//! Pre-game "Ready Check" — a fast, read-only pre-flight when a game launches.
//!
//! Reuses the health-scan classifiers (no duplicated logic): we run the same
//! read-only system health scan and turn the relevant findings into ✓/✗ items
//! for a quick F1-style checklist. Read-only — it NEVER applies anything; any ✗
//! links the user to the matching fix through the normal confirm pipeline.

use serde::Serialize;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReadyCheckItem {
    pub label: String,
    pub ok: bool,
    pub detail: String,
    /// A finding id the UI can route to a fix, or None. Informational items = None.
    pub action: Option<String>,
    pub informational: bool,
}

fn item(label: &str, ok: bool, ok_detail: &str, bad_detail: &str, action: Option<&str>) -> ReadyCheckItem {
    ReadyCheckItem {
        label: label.into(),
        ok,
        detail: if ok { ok_detail.into() } else { bad_detail.into() },
        action: if ok { None } else { action.map(|s| s.into()) },
        informational: false,
    }
}

/// Run the read-only ready check for the active game. Reuses `scan_system_health`
/// (the health-scan classifiers) and adds game-profile + anti-cheat status.
#[tauri::command]
pub fn ready_check(game_name: Option<String>, game_install_path: Option<String>) -> Vec<ReadyCheckItem> {
    let report = super::health_scan::scan_system_health(game_name, game_install_path);
    let has = |id: &str| report.findings.iter().any(|f| f.id == id);

    let mut items = vec![
        item(
            "Thermals OK",
            !has("thermal"),
            "CPU is running cool.",
            "CPU is in the thermal-throttling range — check cooling.",
            Some("thermal"),
        ),
        item(
            "No background CPU hog",
            !has("bg_process"),
            "Nothing is stealing CPU in the background.",
            "A background app is using a lot of CPU.",
            Some("bg_process"),
        ),
        item(
            "Monitor at max refresh",
            !has("refresh_rate"),
            "Display is at its highest refresh rate.",
            "Your monitor isn't at its highest refresh rate.",
            Some("refresh_rate"),
        ),
        item(
            "Power plan optimal",
            !has("power_plan"),
            "Power plan won't down-clock during games.",
            "Power plan may down-clock your CPU/GPU.",
            Some("power_plan"),
        ),
    ];

    // Game profile applied (proxy: any Mujify tweaks currently active).
    let applied = !super::change_log::active_entries().is_empty();
    items.push(item(
        "Optimizations applied",
        applied,
        "Your Mujify tweaks are active.",
        "No Mujify tweaks are applied yet.",
        Some("apply_profile"),
    ));

    // Anti-cheat — informational only.
    let ac = super::anti_cheat_guard::detect_active();
    items.push(ReadyCheckItem {
        label: "Anti-cheat".into(),
        ok: !ac,
        detail: if ac {
            "Protected game detected — risky tweaks are held automatically.".into()
        } else {
            "None detected.".into()
        },
        action: None,
        informational: true,
    });

    items
}
