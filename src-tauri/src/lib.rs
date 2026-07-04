// Mujify Tweaks — Rust core.
//
// Implemented checkpoints: 1 (ping IPC), 2 (HardwareProfiler), 3 (SystemMonitor),
// 4–5 (GameDetector + AntiCheatGuard detection), 7 (NetworkMonitor),
// 8 scan-half (tweak catalog + read-only scanner), 11 storage-half (ProfileStore).
//
// Safety invariant: no code path here applies a tweak to the machine. The
// scanner reads only; the apply/rollback engines (Checkpoints 8b–10) arrive
// later and every state-changing op will route TweaksEngine → AntiCheatGuard →
// ChangeLog. AntiCheatGuard::ALWAYS_BLOCKED is enforced regardless of caller.

mod modules;

use serde::Serialize;

use modules::{game_detector, hardware_profiler, network_monitor, profile_store, system_monitor,
    tweak_catalog};

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
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Start the live monitors (each spawns its own thread, pushes events).
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
