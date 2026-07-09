//! Checkpoint 4 — GameDetector (+ anti-cheat detection wiring).
//!
//! Primary mechanism is sysinfo process polling (correct with WMI tracing fully
//! disabled, per the plan's reliability note). Every 2 s it:
//!   - snapshots running processes, matches against the known-games table,
//!   - emits `game_changed` when the active game starts/stops,
//!   - emits `anti_cheat_status` from the same snapshot.
//! Installed-library discovery (Steam/Epic/GOG) is a separate on-demand command
//! that reads registry + manifests — no processes are launched or modified.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use serde::Serialize;
use sysinfo::{ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter};

use super::anti_cheat_guard;
use super::games_db;

#[derive(Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GameInfo {
    pub name: String,
    pub exe: String,
    pub launcher: Option<String>,
    pub install_path: Option<String>,
    /// Steam appid when known — the frontend uses it to show the real header art.
    pub app_id: Option<String>,
}

static RUNNING: AtomicBool = AtomicBool::new(false);

/// Steam appids that are tools/runtimes/redistributables, not games — hidden
/// from the library so they don't show as art-less tiles. (Read-only filter.)
const NON_GAME_APPIDS: &[&str] = &[
    "228980",  // Steamworks Common Redistributables
    "1070560", // Steam Linux Runtime 1.0 (scout)
    "1391110", // Steam Linux Runtime 2.0 (soldier)
    "1628350", // Steam Linux Runtime 3.0 (sniper)
    "1493710", // Proton Experimental
    "1826330", // Proton EasyAntiCheat Runtime
    "2180100", // Proton Hotfix
];

fn stem_of(process_name: &str) -> String {
    process_name
        .to_lowercase()
        .strip_suffix(".exe")
        .unwrap_or(&process_name.to_lowercase())
        .to_string()
}

pub fn start(app: AppHandle) {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }

    thread::spawn(move || {
        let mut sys = System::new();
        let mut last_active: Option<GameInfo> = None;

        loop {
            sys.refresh_processes(ProcessesToUpdate::All, true);

            let stems: Vec<String> = sys
                .processes()
                .values()
                .map(|p| stem_of(&p.name().to_string_lossy()))
                .collect();

            // Active game = first running process matching the known-games table.
            let mut active: Option<GameInfo> = None;
            for process in sys.processes().values() {
                let raw = process.name().to_string_lossy().to_string();
                let stem = stem_of(&raw);
                if let Some(name) = games_db::lookup(&stem) {
                    active = Some(GameInfo {
                        name: name.to_string(),
                        exe: raw,
                        launcher: None,
                        install_path: process
                            .exe()
                            .and_then(|p| p.parent())
                            .map(|p| p.to_string_lossy().to_string()),
                        app_id: None,
                    });
                    break;
                }
            }

            if active != last_active {
                let _ = app.emit("game_changed", &active);
                // Start/stop real FPS capture (PresentMon) for the new game.
                super::frame_time_monitor::on_active_game_change(&app, &active);
                last_active = active;
            }

            let ac = anti_cheat_guard::evaluate(&stems);
            let _ = app.emit("anti_cheat_status", &ac);

            // FPS Drop Detective: accumulate this game's live session; on exit it
            // records the session and, if the run regressed vs. the game's
            // baseline, returns a report we surface on the Dashboard.
            if let Some(report) =
                super::sessions::on_tick(last_active.as_ref().map(|g| g.name.as_str()))
            {
                let _ = app.emit("detective_report", &report);
            }

            thread::sleep(Duration::from_secs(2));
        }
    });
}

// ---- Installed-library discovery (read-only) --------------------------------

fn read_reg_string(root: &winreg::RegKey, path: &str, name: &str) -> Option<String> {
    let key = root.open_subkey(path).ok()?;
    key.get_value::<String, _>(name).ok()
}

/// Parse Steam `libraryfolders.vdf` + `appmanifest_*.acf` for installed titles.
fn scan_steam(games: &mut Vec<GameInfo>) {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let steam_path = read_reg_string(&hkcu, r"Software\Valve\Steam", "SteamPath").or_else(|| {
        read_reg_string(&hklm, r"SOFTWARE\WOW6432Node\Valve\Steam", "InstallPath")
    });
    let Some(steam_path) = steam_path else {
        return;
    };

    // Library roots from libraryfolders.vdf (very light parse: "path" lines).
    let mut library_roots: Vec<PathBuf> = vec![PathBuf::from(&steam_path)];
    let vdf = PathBuf::from(&steam_path)
        .join("steamapps")
        .join("libraryfolders.vdf");
    if let Ok(text) = std::fs::read_to_string(&vdf) {
        for line in text.lines() {
            let line = line.trim();
            if let Some(rest) = line.strip_prefix("\"path\"") {
                if let Some(start) = rest.find('"') {
                    if let Some(end) = rest[start + 1..].find('"') {
                        let path = &rest[start + 1..start + 1 + end];
                        library_roots.push(PathBuf::from(path.replace("\\\\", "\\")));
                    }
                }
            }
        }
    }

    for root in library_roots {
        let steamapps = root.join("steamapps");
        let Ok(entries) = std::fs::read_dir(&steamapps) else {
            continue;
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with("appmanifest_") || !name.ends_with(".acf") {
                continue;
            }
            // appmanifest_<appid>.acf → appid for the Steam header art.
            let app_id = name
                .trim_start_matches("appmanifest_")
                .trim_end_matches(".acf")
                .to_string();
            if NON_GAME_APPIDS.contains(&app_id.as_str()) {
                continue; // skip runtimes / redistributables
            }
            if let Ok(text) = std::fs::read_to_string(entry.path()) {
                let field = |key: &str| {
                    text.lines()
                        .find(|l| l.trim_start().starts_with(&format!("\"{key}\"")))
                        .and_then(|l| l.split('"').nth(3))
                        .map(|s| s.to_string())
                };
                let title = field("name");
                let installdir = field("installdir");
                if let Some(title) = title {
                    if !games.iter().any(|g| g.name == title) {
                        // Precise per-game folder (…\common\<installdir>) so the
                        // engine profiler can scan the right directory, not all of common.
                        let install_path = match &installdir {
                            Some(d) => steamapps.join("common").join(d),
                            None => steamapps.join("common"),
                        };
                        games.push(GameInfo {
                            name: title,
                            exe: String::new(),
                            launcher: Some("Steam".into()),
                            install_path: Some(install_path.to_string_lossy().into()),
                            app_id: if app_id.is_empty() { None } else { Some(app_id) },
                        });
                    }
                }
            }
        }
    }
}

/// Parse Epic manifests (%ProgramData%\Epic\EpicGamesLauncher\...\*.item).
fn scan_epic(games: &mut Vec<GameInfo>) {
    let Ok(programdata) = std::env::var("ProgramData") else {
        return;
    };
    let manifests = PathBuf::from(programdata)
        .join("Epic")
        .join("EpicGamesLauncher")
        .join("Data")
        .join("Manifests");
    let Ok(entries) = std::fs::read_dir(&manifests) else {
        return;
    };
    for entry in entries.flatten() {
        if entry.path().extension().map(|e| e == "item").unwrap_or(false) {
            if let Ok(text) = std::fs::read_to_string(entry.path()) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                    if let Some(title) = json.get("DisplayName").and_then(|v| v.as_str()) {
                        if !games.iter().any(|g| g.name == title) {
                            games.push(GameInfo {
                                name: title.to_string(),
                                exe: json
                                    .get("LaunchExecutable")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                launcher: Some("Epic".into()),
                                install_path: json
                                    .get("InstallLocation")
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string()),
                                app_id: None,
                            });
                        }
                    }
                }
            }
        }
    }
}

/// Read-only scan across Steam + Epic libraries. No launches, no modifications.
#[tauri::command]
pub fn get_installed_games() -> Vec<GameInfo> {
    let mut games = Vec::new();
    scan_steam(&mut games);
    scan_epic(&mut games);
    games.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    games.truncate(200);
    games
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redistributables_are_filtered_but_real_games_are_not() {
        // The known Steamworks redistributable must be hidden from the library…
        assert!(NON_GAME_APPIDS.contains(&"228980"));
        // …while real games (e.g. Wallpaper Engine 431960) must not be.
        assert!(!NON_GAME_APPIDS.contains(&"431960"));
    }
}
