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
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};

use modules::{
    ai_backend, auto_apply, benchmark, change_journal, change_log, cleaner, config, debloat,
    driver_doctor, fix_catalog,
    game_detector, game_icons, game_profiler, game_profiles, game_settings, hardware_profiler, hardware_tier,
    health_scan, logger, network_monitor, profile_store, ram_optimizer, ready_check, restore_points,
    rollback_engine, server_ping, sessions, speed_test, support, system_monitor, tweak_catalog,
    tweaks_engine,
};

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Tray icon with Open / Quick Optimize / Exit. Left-click opens the window.
/// Live tray tooltip: how many optimizations are currently applied (real count
/// from the change log — the same source the Change Log page uses).
fn tray_tooltip() -> String {
    let active = rollback_engine::get_change_log()
        .iter()
        .filter(|e| !e.undone)
        .count();
    match active {
        0 => "Mujify Tweaks — no optimizations applied".to_string(),
        1 => "Mujify Tweaks — 1 optimization active".to_string(),
        n => format!("Mujify Tweaks — {n} optimizations active"),
    }
}

fn build_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Mujify Tweaks", true, None::<&str>)?;
    let quick = MenuItem::with_id(app, "quick_optimize", "Quick Optimize", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Exit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quick, &quit])?;

    let mut builder = TrayIconBuilder::with_id("mujify-tray")
        .menu(&menu)
        .tooltip(tray_tooltip())
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "quick_optimize" => {
                show_main(app);
                let _ = app.emit("navigate", "tweaks");
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;

    // Keep the tray tooltip's "N optimizations active" count live.
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            if let Some(tray) = handle.tray_by_id("mujify-tray") {
                let _ = tray.set_tooltip(Some(tray_tooltip()));
            }
        }
    });
    Ok(())
}

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

/// Ask the updater plugin whether a newer release exists. Returns an honest
/// status string; errors (e.g. no public release channel yet) surface as Err.
#[tauri::command]
async fn check_for_updates(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await {
        Ok(Some(update)) => Ok(format!("Update available: v{}", update.version)),
        Ok(None) => Ok("You're on the latest version.".into()),
        Err(e) => {
            logger::warn(format!("updater: check failed: {e}"));
            Err(format!("Update check unavailable: {e}"))
        }
    }
}

/// Is "start Mujify on Windows startup" currently enabled?
#[tauri::command]
fn get_autostart_enabled(app: tauri::AppHandle) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().unwrap_or(false)
}

/// Turn "start on startup" on or off (Settings toggle).
#[tauri::command]
fn set_autostart_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let al = app.autolaunch();
    if enabled { al.enable() } else { al.disable() }.map_err(|e| e.to_string())
}

/// Save a system report (HTML built by the frontend from real data) to the user's
/// Documents folder and return the full path. Read-only w.r.t. the system — it
/// only writes the one report file the user asked for.
#[tauri::command]
fn save_report(html: String) -> Result<String, String> {
    let base = std::env::var("USERPROFILE").map_err(|_| "Couldn't find your user folder.".to_string())?;
    let dir = std::path::PathBuf::from(base).join("Documents");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let ts = chrono::Local::now().format("%Y-%m-%d_%H%M%S");
    let path = dir.join(format!("Mujify-System-Report-{ts}.html"));
    std::fs::write(&path, html).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateInfo {
    available: bool,
    version: String,
    current: String,
}

/// Non-throwing update check for the in-app banner. Any failure (no release
/// channel yet, offline) resolves to `available: false` — never an error the UI
/// has to handle, never a browser page.
#[tauri::command]
async fn get_update_info(app: tauri::AppHandle) -> UpdateInfo {
    use tauri_plugin_updater::UpdaterExt;
    let current = app.package_info().version.to_string();
    let checked = match app.updater() {
        Ok(updater) => updater.check().await.ok().flatten(),
        Err(_) => None,
    };
    match checked {
        Some(u) => UpdateInfo { available: true, version: u.version.clone(), current },
        None => UpdateInfo { available: false, version: current.clone(), current },
    }
}

/// Download + install the update entirely in-app, emitting `update_progress`
/// ({chunk,total}) and `update_installing`, then relaunch. Never opens a browser.
#[tauri::command]
async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No update available.".to_string())?;
    let a1 = app.clone();
    let a2 = app.clone();
    update
        .download_and_install(
            move |chunk_length, content_length| {
                let _ = a1.emit(
                    "update_progress",
                    serde_json::json!({ "chunk": chunk_length, "total": content_length }),
                );
            },
            move || {
                let _ = a2.emit("update_installing", ());
            },
        )
        .await
        .map_err(|e| {
            logger::warn(format!("updater: install failed: {e}"));
            e.to_string()
        })?;
    app.restart()
}

/// Headless revert-all for the uninstaller / `--revert-all` CLI. Restores every
/// still-active change from the persisted log, marks them undone (the log file
/// itself is kept as a record), and prints a summary. `dry_run` reports what
/// WOULD happen without changing anything — safe to run any time.
fn cli_revert_all(dry_run: bool) {
    change_log::load();
    let entries = change_log::active_entries(); // newest-first
    if entries.is_empty() {
        println!("Mujify Tweaks: no active changes to restore — nothing to do.");
        return;
    }
    println!(
        "Mujify Tweaks: {} {} original Windows setting(s)…",
        if dry_run { "would restore" } else { "restoring" },
        entries.len()
    );
    let summary =
        rollback_engine::revert_entries(&modules::system_mutator::RealMutator, &entries, dry_run);
    for d in &summary.descriptions {
        println!("  {} {}", if dry_run { "would revert:" } else { "reverted:" }, d);
    }
    if !dry_run {
        // Persist undone flags for what actually reverted; the log file is kept.
        for id in &summary.reverted_ids {
            change_log::mark_undone(id);
        }
    }
    println!(
        "Mujify Tweaks: {} {} setting(s){}.",
        if dry_run { "would restore" } else { "restored" },
        summary.reverted,
        if summary.failed > 0 {
            format!(", {} could not be restored (see the app's Change Log)", summary.failed)
        } else {
            String::new()
        }
    );
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Local crash logging (no telemetry) — records panics to
    // %AppData%\MujifyTweaks\logs so users can report bugs without tracking.
    logger::install_panic_hook();

    // Uninstall / manual restore path: `mujify-tweaks.exe --revert-all [--dry-run]`.
    // The NSIS uninstaller calls this BEFORE removing files, so a user who
    // uninstalls with tweaks still applied gets their original Windows settings
    // back. Runs headless and exits without ever starting the GUI.
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--revert-all") {
        cli_revert_all(args.iter().any(|a| a == "--dry-run"));
        return;
    }

    // A single local startup line (no telemetry) — confirms the app launched and
    // at what version, which is the first thing a bug report needs.
    logger::info(format!("Mujify Tweaks v{} started", env!("CARGO_PKG_VERSION")));

    // Restore the persisted change log so Revert All survives restarts.
    change_log::load();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .setup(|app| {
            let handle = app.handle().clone();
            // Start-on-startup defaults ON: enable it once on first launch, then
            // respect the user's choice forever (a marker file records that we've
            // done the one-time default so a later "off" in Settings sticks).
            {
                use tauri_plugin_autostart::ManagerExt;
                if let Ok(appdata) = std::env::var("APPDATA") {
                    let marker = std::path::PathBuf::from(appdata)
                        .join("MujifyTweaks")
                        .join("autostart_initialized");
                    // Only record the one-time default once enabling actually
                    // succeeds — otherwise a transient failure would permanently
                    // skip the default. Retries on the next launch until it sticks.
                    if !marker.exists() && handle.autolaunch().enable().is_ok() {
                        let _ = std::fs::create_dir_all(marker.parent().unwrap());
                        let _ = std::fs::write(&marker, "1");
                    }
                }
            }
            system_monitor::start(handle.clone());
            network_monitor::start(handle.clone());
            game_detector::start(handle.clone());
            // Crash safety: if a previous session auto-applied a game's profile
            // but never got to revert it (app closed mid-game), restore now so
            // nothing is left stuck on. No-op unless there's a stale record.
            auto_apply::recover_stale(&handle);
            // FPS Drop Detective: snapshot system facts at launch + once a day,
            // journaling what changed (read-only, local).
            change_journal::start();
            // Tray is a convenience, not load-bearing: if it fails to create (seen
            // in some elevated/session-0 configs) DON'T abort setup — a returned
            // Err here would stop the whole app from opening. Log and carry on so
            // the main window always shows.
            if let Err(e) = build_tray(&handle) {
                logger::warn(format!("tray setup failed (continuing without tray): {e}"));
            }
            Ok(())
        })
        // Close (X) minimizes to the tray instead of quitting; tray → Exit quits.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            ping,
            check_for_updates,
            get_update_info,
            install_update,
            get_autostart_enabled,
            set_autostart_enabled,
            save_report,
            hardware_profiler::get_hardware_profile,
            hardware_tier::get_hardware_tier,
            game_detector::get_installed_games,
            game_detector::resolve_steam_appid,
            game_icons::game_icon,
            game_profiles::get_recommended_tweaks,
            game_profiler::get_game_profile,
            game_settings::get_settings_advice,
            network_monitor::get_network_info,
            server_ping::ping_game_servers,
            server_ping::list_game_catalog,
            speed_test::speed_test_download,
            speed_test::speed_test_upload,
            tweak_catalog::scan_tweaks,
            fix_catalog::scan_fixes,
            fix_catalog::apply_fix,
            driver_doctor::scan_device_health,
            driver_doctor::repair_drivers,
            health_scan::scan_system_health,
            debloat::scan_bloatware,
            debloat::remove_bloatware,
            cleaner::scan_junk,
            cleaner::scan_large_files,
            cleaner::scan_duplicate_files,
            cleaner::clean_junk,
            cleaner::reveal_in_explorer,
            ram_optimizer::ram_status,
            ram_optimizer::optimize_ram,
            restore_points::list_restore_points,
            restore_points::restore_protection_enabled,
            restore_points::create_restore_point,
            restore_points::delete_all_restore_points,
            profile_store::list_profiles,
            profile_store::save_profile,
            profile_store::delete_profile,
            auto_apply::set_auto_apply_master,
            auto_apply::get_auto_apply_master,
            auto_apply::auto_apply_profile,
            auto_apply::auto_revert_profile,
            tweaks_engine::apply_tweaks,
            tweaks_engine::check_reset_tweaks,
            rollback_engine::revert_single,
            rollback_engine::revert_all,
            rollback_engine::get_change_log,
            benchmark::run_benchmark,
            benchmark::get_latest_report,
            logger::open_logs_folder,
            sessions::get_game_sessions,
            sessions::get_detective_report,
            sessions::dismiss_detective_report,
            change_journal::get_change_journal,
            support::get_support_report,
            ready_check::ready_check,
            config::get_api_key,
            config::set_api_key,
            ai_backend::ai_chat,
            ai_backend::stop_ai,
            ai_backend::save_ai_session,
            ai_backend::load_ai_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
