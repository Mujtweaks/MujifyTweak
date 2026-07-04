// Mujify Tweaks — Rust core.
//
// Implemented: Checkpoint 1 (ping), 2 (HardwareProfiler), 3 (SystemMonitor),
// 4–5 (GameDetector + AntiCheatGuard), 7 (NetworkMonitor), 8 (tweak catalog +
// read-only scanner), 8b/9 (TweaksEngine apply + ChangeLog), 10 (RollbackEngine),
// 11 (ProfileStore), 13–15 (Baseline/Post/Delta benchmark).
//
// Safety invariants:
//  - Every state-changing op routes TweaksEngine → AntiCheatGuard → ChangeLog,
//    captures a precise before-state, and is reversible. No unlogged path.
//  - `apply_tweaks` / `revert_*` REQUIRE explicit `confirm: true` from the user's
//    per-action UI confirmation, and run RealMutator. Never called by tooling.
//  - The apply/undo logic is proven by `cargo test` under MockMutator (touches
//    nothing). No tweak is ever executed to "verify" during development.
//  - AntiCheatGuard::ALWAYS_BLOCKED is enforced regardless of caller.

mod modules;

use serde::Serialize;

use modules::{
    benchmark, change_log, game_detector, hardware_profiler, network_monitor, profile_store,
    rollback_engine, system_monitor, tweak_catalog, tweaks_engine,
};

/// Checkpoint 1 — IPC proof-of-life. The System Guard card renders this verbatim.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PingResponse {
    status: &'static str,
    app_version: String,
    timestamp_utc: String,
}

#[tauri::command]
fn ping(app: tauri::AppHandle) -> PingResponse {
    PingResponse {
        status: "ok",
        app_version: app.package_info().version.to_string(),
        timestamp_utc: chrono::Utc::now().to_rfc3339(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Restore the persisted change log so Revert All survives restarts.
    change_log::load();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let handle = app.handle().clone();
            system_monitor::start(handle.clone());
            network_monitor::start(handle.clone());
            game_detector::start(handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ping,
            hardware_profiler::get_hardware_profile,
            game_detector::get_installed_games,
            tweak_catalog::scan_tweaks,
            profile_store::list_profiles,
            profile_store::save_profile,
            profile_store::delete_profile,
            tweaks_engine::apply_tweaks,
            rollback_engine::revert_single,
            rollback_engine::revert_all,
            rollback_engine::get_change_log,
            benchmark::run_benchmark,
            benchmark::get_latest_report,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
