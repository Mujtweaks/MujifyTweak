//! Checkpoint 4 — GameDetector (+ anti-cheat detection wiring).
//!
//! Primary mechanism is sysinfo process polling (correct with WMI tracing fully
//! disabled, per the plan's reliability note). Every 2 s it:
//!
//! - snapshots running processes, matches against the known-games table,
//! - emits `game_changed` when the active game starts/stops,
//! - emits `anti_cheat_status` from the same snapshot.
//!
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

/// Steam appids that are tools/runtimes/redistributables/desktop-apps, not games
/// — hidden from the library so they don't show as tiles. (Read-only filter.)
const NON_GAME_APPIDS: &[&str] = &[
    "228980",  // Steamworks Common Redistributables
    "1070560", // Steam Linux Runtime 1.0 (scout)
    "1391110", // Steam Linux Runtime 2.0 (soldier)
    "1628350", // Steam Linux Runtime 3.0 (sniper)
    "1493710", // Proton Experimental
    "1826330", // Proton EasyAntiCheat Runtime
    "2180100", // Proton Hotfix
    "431960",  // Wallpaper Engine (desktop app, not a game)
    "250820",  // SteamVR (runtime)
    "1637140", // MyDockFinder (desktop app)
    "223850",  // Steamworks Common (SDK)
];

/// Non-game desktop apps that ship on game stores and would otherwise show as
/// tiles. Matched as a lowercased substring of the title, across ALL scanners
/// (so a store's name string still gets filtered even without a known appid).
const NON_GAME_NAMES: &[&str] = &[
    "wallpaper engine", "mydockfinder", "steamvr", "3dmark", "pcmark",
    "aseprite", "obs studio", "blender", "bandicam", "voicemod", "rewasd",
    "spacedesk", "lively wallpaper", "cheat engine", "wemod", "wallpaper",
    "dock finder", "rivatuner", "msi afterburner", "razer", "logitech g hub",
    // GPU/driver/vendor software & UWP system packages — never games.
    "appup", "intel arc", "intelarc", "arc control", "arc software",
    "graphics command", "intel graphics", "geforce", "nvidia app",
    "radeon software", "amd software", "adrenalin", "armoury crate",
    "nahimic", "realtek", "microsoft.", "windows.", "gaming services",
    "xbox", "game bar", "nvidia control", "displayfusion",
    // Dev tools / editors that ship next to games but aren't games themselves.
    // "roblox studio" catches the Start-menu shortcut "Roblox Studio for <user>".
    "roblox studio", "unreal engine", "unity hub", "godot", "rpg maker",
    "visual studio", "vscode", "vs code", " sdk", "development kit",
    // Common desktop/UWP apps that were slipping through as "games".
    "claude", "spotify", "discord", "whatsapp", "telegram", "slack",
    "obsidian", "notion", "zoom", "microsoft teams", "vlc media",
    "onedrive", "dropbox", "adobe", "chatgpt", "copilot",
    // Launchers, background services, runtimes & anti-cheat — NOT games, even
    // though they install/run inside game folders.
    "epic online services", "epiconlineservices", "epic games launcher",
    "riot client", "riot vanguard", "riotclient", "vgc",
    "easyanticheat", "easy anti-cheat", "battleye", "battle.net",
    "ea app", "ea desktop", "origin", "ubisoft connect", "uplay",
    "gog galaxy", "steam client", "steamworks", "redistributable",
    "directx", "visual c++", "dotnet", ".net runtime", "vcredist",
];

/// True if a title is a known non-game desktop app (Wallpaper Engine, docks, …).
fn is_non_game_name(name: &str) -> bool {
    let n = name.to_lowercase();
    NON_GAME_NAMES.iter().any(|x| n.contains(x))
}

/// Normalized de-dup key: lowercase, separators→space, whitespace collapsed —
/// so "Watch Dogs", "Watch_Dogs" and "watch-dogs" all count as one title.
fn norm_name(name: &str) -> String {
    name.to_lowercase()
        .replace(['_', '-', ':', '™', '®'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Collapse variant / per-user / launcher-suffixed titles to one canonical name
/// so the SAME game found by different scanners shows exactly once — e.g.
/// "Roblox", "Roblox Player" and "Roblox Player for <user>" are all just Roblox.
fn canonical_name(name: &str) -> String {
    let n = name.to_lowercase();
    if n.contains("roblox") {
        return "Roblox".to_string();
    }
    if n.contains("counter-strike") || n.contains("counter strike") || n == "cs2" {
        return "Counter-Strike 2".to_string();
    }
    if n.contains("minecraft") && !n.contains("dungeon") && !n.contains("legend") && !n.contains("launcher") {
        return "Minecraft".to_string();
    }
    name.to_string()
}

/// Add a game to the library unless it's a non-game app or a duplicate of one
/// already found (by canonical normalized name). The single choke-point every
/// scanner pushes through, so filtering + de-dup can't drift between them. When a
/// duplicate carries richer data (an install path or Steam appid for cover art),
/// it back-fills the entry we already have rather than being dropped outright.
fn push_unique(games: &mut Vec<GameInfo>, mut g: GameInfo) {
    if g.name.trim().is_empty() || is_non_game_name(&g.name) {
        return;
    }
    g.name = canonical_name(&g.name);
    let key = norm_name(&g.name);
    if let Some(existing) = games.iter_mut().find(|x| norm_name(&x.name) == key) {
        if existing.install_path.is_none() && g.install_path.is_some() {
            existing.install_path = g.install_path;
        }
        if existing.app_id.is_none() && g.app_id.is_some() {
            existing.app_id = g.app_id;
        }
        if existing.exe.is_empty() && !g.exe.is_empty() {
            existing.exe = g.exe;
        }
        return;
    }
    games.push(g);
}

fn stem_of(process_name: &str) -> String {
    process_name
        .to_lowercase()
        .strip_suffix(".exe")
        .unwrap_or(&process_name.to_lowercase())
        .to_string()
}

/// Path fragments that mean "this exe lives inside a game library" — used to
/// detect ANY running game, not just the curated ones.
const LIB_MARKERS: &[&str] = &[
    "steamapps\\common",
    "epic games\\",
    "gog galaxy\\games",
    "gog games\\",
    "riot games\\",
    "\\ea games\\",
    "\\origin games\\",
    "ubisoft game launcher\\games",
    "ubisoft\\ubisoft game launcher",
    "\\xboxgames\\",
    // NOTE: "\\windowsapps\\" was removed — it matched EVERY UWP/MSIX app
    // (Claude, Spotify, Discord…), so those were wrongly flagged as "games".
    // Real UWP games are caught by name (STANDALONE_RUNNING) or \xboxgames\.
];

/// Launcher / helper / crash-handler exes that live in game folders but are NOT
/// the game itself — never treat these as the active game.
const NOT_GAME_EXES: &[&str] = &[
    "steam", "steamwebhelper", "steamservice", "gameoverlayui", "cef",
    "epicgameslauncher", "epicwebhelper", "unrealcefsubprocess", "eoshelper",
    "galaxyclient", "galaxycommunication", "battle.net", "agent",
    "riotclientservices", "riotclientux", "riotclientcrashhandler", "riotclient",
    "eadesktop", "eabackgroundservice", "origin", "ubisoftconnect", "upc",
    "crashhandler", "crashreportclient", "unitycrashhandler64", "unitycrashhandler32",
    "launcher", "vconsole2", "easyanticheat", "battleye", "vgtray", "vgc",
    // Epic Online Services (the SDK/overlay that runs alongside games — not a game).
    "epiconlineservices", "epiconlineservicesuserhelper", "eosoverlayrenderprocess",
    "epicgameslauncher", "epicwebhelper",
];

/// Launcher-less games whose running process lives OUTSIDE any library folder
/// (Roblox in %LOCALAPPDATA%, Minecraft under a Java runtime, …), so the
/// path-based `game_from_running` never catches them. Matched by exe stem, which
/// is why they were showing "no game active" even mid-game.
const STANDALONE_RUNNING: &[(&str, &str)] = &[
    ("robloxplayerbeta", "Roblox"),
    ("robloxplayer", "Roblox"),
    ("minecraft.windows", "Minecraft"),
    ("minecraftwindows", "Minecraft"),
    ("fortniteclient-win64-shipping", "Fortnite"),
    ("valorant-win64-shipping", "VALORANT"),
    ("league of legends", "League of Legends"),
    ("leagueoflegends", "League of Legends"),
    ("genshinimpact", "Genshin Impact"),
    ("yuanshen", "Genshin Impact"),
];

/// Detect a launcher-less game from its process. `cmd` is the lowercased, joined
/// command line — used to identify Minecraft Java, which runs as `javaw.exe`.
fn standalone_running_game(stem: &str, cmd: &str) -> Option<&'static str> {
    if let Some((_, name)) = STANDALONE_RUNNING.iter().find(|(s, _)| stem == *s) {
        return Some(name);
    }
    if (stem == "javaw" || stem == "java") && (cmd.contains("minecraft") || cmd.contains("net.minecraft")) {
        return Some("Minecraft");
    }
    None
}

/// Turn a folder or exe name into a readable title ("watch_dogs2" → "Watch Dogs2").
fn titleize(raw: &str) -> String {
    let cleaned = raw.replace(['_', '-'], " ");
    cleaned
        .split_whitespace()
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// The game's folder name — the segment right after the library marker in the
/// exe path (e.g. …\steamapps\common\<GameFolder>\bin\game.exe → "GameFolder").
fn game_name_from_path(path: &str) -> Option<String> {
    let p = path.replace('/', "\\");
    let pl = p.to_lowercase();
    for m in LIB_MARKERS {
        if let Some(idx) = pl.find(m) {
            let after = &p[idx + m.len()..];
            let seg = after.trim_start_matches('\\').split('\\').next()?;
            if !seg.is_empty() && !seg.eq_ignore_ascii_case("bin") {
                return Some(titleize(seg));
            }
        }
    }
    None
}

/// Generic active-game detection: an exe inside a game library that isn't a
/// known launcher/helper. Curated name wins; else the folder name; else the exe.
fn game_from_running(exe_path: &str, stem: &str) -> Option<GameInfo> {
    let path_l = exe_path.to_lowercase();
    if !LIB_MARKERS.iter().any(|m| path_l.contains(m)) {
        return None;
    }
    if NOT_GAME_EXES.iter().any(|n| stem == *n || stem.contains(n)) {
        return None;
    }
    let name = games_db::lookup(stem)
        .map(|s| s.to_string())
        .or_else(|| game_name_from_path(exe_path))
        .unwrap_or_else(|| titleize(stem));
    // A desktop app living in a library folder (e.g. Wallpaper Engine) is not a game.
    if is_non_game_name(&name) {
        return None;
    }
    Some(GameInfo {
        name,
        exe: format!("{stem}.exe"),
        launcher: None,
        install_path: std::path::Path::new(exe_path)
            .parent()
            .map(|p| p.to_string_lossy().to_string()),
        app_id: None,
    })
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

            // Active game — first a curated match (nice display names), then a
            // GENERIC pass so games not in the table are still detected.
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
            // Launcher-less games (Roblox, Minecraft Java, …) matched by exe /
            // command line, no library-folder requirement.
            if active.is_none() {
                for process in sys.processes().values() {
                    let stem = stem_of(&process.name().to_string_lossy());
                    let cmd = process
                        .cmd()
                        .iter()
                        .map(|s| s.to_string_lossy().to_lowercase())
                        .collect::<Vec<_>>()
                        .join(" ");
                    if let Some(name) = standalone_running_game(&stem, &cmd) {
                        active = Some(GameInfo {
                            name: name.to_string(),
                            exe: process.name().to_string_lossy().to_string(),
                            launcher: None,
                            install_path: process.exe().and_then(|p| p.parent()).map(|p| p.to_string_lossy().to_string()),
                            app_id: None,
                        });
                        break;
                    }
                }
            }
            if active.is_none() {
                for process in sys.processes().values() {
                    let stem = stem_of(&process.name().to_string_lossy());
                    if let Some(path) = process.exe() {
                        if let Some(g) = game_from_running(&path.to_string_lossy(), &stem) {
                            active = Some(g);
                            break;
                        }
                    }
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
                    // Precise per-game folder (…\common\<installdir>) so the
                    // engine profiler can scan the right directory, not all of common.
                    let install_path = match &installdir {
                        Some(d) => steamapps.join("common").join(d),
                        None => steamapps.join("common"),
                    };
                    push_unique(games, GameInfo {
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
                        push_unique(games, GameInfo {
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

/// Parse GOG Galaxy's registry install records.
fn scan_gog(games: &mut Vec<GameInfo>) {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let Ok(root) = hklm.open_subkey(r"SOFTWARE\WOW6432Node\GOG.com\Games") else {
        return;
    };
    for id in root.enum_keys().flatten() {
        let Ok(k) = root.open_subkey(&id) else { continue };
        let name: Option<String> = k.get_value("gameName").ok();
        let path: Option<String> = k.get_value("path").ok();
        if let Some(name) = name {
            push_unique(games, GameInfo {
                name,
                exe: String::new(),
                launcher: Some("GOG".into()),
                install_path: path,
                app_id: None,
            });
        }
    }
}

/// Parse Ubisoft Connect's registry install records (name = install folder).
fn scan_ubisoft(games: &mut Vec<GameInfo>) {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let Ok(root) = hklm.open_subkey(r"SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs") else {
        return;
    };
    for id in root.enum_keys().flatten() {
        let Ok(k) = root.open_subkey(&id) else { continue };
        let dir: Option<String> = k.get_value("InstallDir").ok();
        if let Some(dir) = dir {
            let name = dir
                .replace('/', "\\")
                .trim_end_matches('\\')
                .rsplit('\\')
                .next()
                .map(titleize)
                .unwrap_or_else(|| "Ubisoft Game".into());
            push_unique(games, GameInfo {
                name,
                exe: String::new(),
                launcher: Some("Ubisoft".into()),
                install_path: Some(dir),
                app_id: None,
            });
        }
    }
}

/// Windows publishers that (almost) exclusively make games — a strong signal
/// that an Uninstall-registry entry is a real, playable game. Catches titles
/// from launchers (Battle.net, EA/Origin, Rockstar, Riot, Amazon Games) that
/// don't expose a clean per-title manifest the way Steam/Epic/GOG/Ubisoft do.
const GAME_PUBLISHERS: &[&str] = &[
    "blizzard entertainment", "riot games", "electronic arts", "rockstar games",
    "take-two interactive", "2k", "activision", "bethesda softworks", "square enix",
    "capcom", "sega", "bandai namco", "cd projekt", "fromsoftware", "bungie",
    "mojang", "mojang studios", "amazon games", "wb games", "warner bros. games",
    "paradox interactive", "focus entertainment", "team17", "devolver digital",
    "thq nordic", "koei tecmo", "respawn entertainment", "insomniac games",
    "id software", "eidos", "annapurna interactive", "roblox", "mojang",
    "hoyoverse", "mihoyo", "innersloth", "krafton", "pubg", "epic games",
];

/// Uninstall-entry DisplayNames that are launchers/clients themselves (exact
/// match, lowercased) — never the game, even though a game publisher often owns
/// the launcher too (e.g. Battle.net is "published" by Blizzard Entertainment).
const LAUNCHER_APP_NAMES: &[&str] = &[
    "steam", "battle.net", "origin", "ea app", "ea desktop", "ubisoft connect",
    "uplay", "epic games launcher", "gog galaxy", "riot client",
    "rockstar games launcher", "amazon games",
];

/// Substrings that mean "tool / redistributable / driver", never a game,
/// regardless of publisher (a game publisher's installer can bundle these too).
const NOT_A_GAME_CONTAINS: &[&str] = &[
    "redistributable", "runtime", " sdk", "directx", "visual c++",
    ".net desktop runtime", "razer", "logitech", "corsair", "chipset",
    "realtek", "nvidia ", "geforce experience",
];

/// Is this Windows "installed programs" entry probably a real, playable game?
/// Pure + unit-tested: real (known) publisher wins first; otherwise fall back to
/// "installed inside a known game-library-style folder" (same markers used to
/// detect running games), so unrecognized publishers still get a fair shot.
fn is_probable_game(display_name: &str, publisher: &str, install_location: &str) -> bool {
    let name_l = display_name.to_lowercase();
    if LAUNCHER_APP_NAMES.iter().any(|n| name_l == *n) {
        return false;
    }
    if NOT_A_GAME_CONTAINS.iter().any(|n| name_l.contains(n)) {
        return false;
    }
    let pub_l = publisher.to_lowercase();
    if GAME_PUBLISHERS.iter().any(|p| pub_l.contains(p)) {
        return true;
    }
    let loc_l = install_location.to_lowercase().replace('/', "\\");
    LIB_MARKERS.iter().any(|m| loc_l.contains(m))
}

/// Generic catch-all: any Windows "installed programs" (Uninstall registry)
/// entry that looks like a real game by publisher or install path. This is what
/// picks up Battle.net, EA/Origin, Rockstar, Riot, Amazon Games and standalone
/// installers — launchers that don't expose a clean per-title manifest the way
/// Steam/Epic/GOG/Ubisoft do. Runs LAST so the precise scanners above always win
/// on any overlap (dedup by name); read-only, no launches, no modifications.
fn scan_uninstall_registry(games: &mut Vec<GameInfo>) {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let scan_one = |root: &RegKey, path: &str, games: &mut Vec<GameInfo>| {
        let Ok(uninstall) = root.open_subkey(path) else {
            return;
        };
        for sub in uninstall.enum_keys().flatten() {
            let Ok(entry) = uninstall.open_subkey(&sub) else { continue };
            let name: String = match entry.get_value("DisplayName") {
                Ok(v) => v,
                Err(_) => continue,
            };
            if name.trim().is_empty() {
                continue;
            }
            // SystemComponent=1 marks a Windows/driver component, not a
            // user-facing program — skip those outright.
            let system_component: u32 = entry.get_value("SystemComponent").unwrap_or(0);
            if system_component == 1 {
                continue;
            }
            let publisher: String = entry.get_value("Publisher").unwrap_or_default();
            let install_location: String = entry.get_value("InstallLocation").unwrap_or_default();
            if !is_probable_game(&name, &publisher, &install_location) {
                continue;
            }
            // push_unique handles both "already found by a more precise scanner"
            // (normalized-name de-dup) and non-game filtering.
            push_unique(games, GameInfo {
                name,
                exe: String::new(),
                launcher: Some(if publisher.trim().is_empty() { "Installed".into() } else { publisher }),
                install_path: if install_location.trim().is_empty() { None } else { Some(install_location) },
                app_id: None,
            });
        }
    };

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    scan_one(&hklm, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", games);
    scan_one(&hklm, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall", games);
    scan_one(&hkcu, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", games);
}

/// Popular games installed OUTSIDE the standard launchers — Roblox, Minecraft
/// (Java + Bedrock/UWP), etc. — detected by their well-known install folder
/// existing. They don't appear in Steam/Epic/GOG manifests or the uninstall
/// registry with a recognisable publisher, so they'd be missed otherwise.
/// (display name, env var, subpath that proves it's installed). Read-only.
const STANDALONE_GAMES: &[(&str, &str, &str)] = &[
    ("Roblox", "LOCALAPPDATA", r"Roblox\Versions"),
    // Launcher folder FIRST so its exe (real icon) wins the name de-dupe over the
    // data-only .minecraft folder, which has no executable to pull a logo from.
    ("Minecraft", "ProgramFiles(x86)", r"Minecraft Launcher"),
    ("Minecraft", "ProgramFiles", r"Minecraft Launcher"),
    ("Minecraft", "APPDATA", r".minecraft"),
    ("Minecraft", "LOCALAPPDATA", r"Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe"),
    ("Minecraft Legends", "LOCALAPPDATA", r"Packages\Microsoft.MinecraftEducationEdition_8wekyb3d8bbwe"),
    ("Fortnite", "PROGRAMFILES", r"Epic Games\Fortnite"),
    ("VALORANT", "PROGRAMFILES", r"Riot Games\VALORANT"),
    ("League of Legends", "PROGRAMFILES", r"Riot Games\League of Legends"),
];

fn scan_standalone(games: &mut Vec<GameInfo>) {
    for (name, var, sub) in STANDALONE_GAMES {
        let Ok(base) = std::env::var(var) else { continue };
        let path = PathBuf::from(base).join(sub);
        if path.exists() {
            push_unique(games, GameInfo {
                name: (*name).to_string(),
                exe: String::new(),
                launcher: Some("Installed".into()),
                install_path: Some(path.to_string_lossy().into()),
                app_id: None,
            });
        }
    }
}

/// Read-only scan across installed libraries. No launches, no modifications.
/// Steam + Epic + GOG + Ubisoft are read directly for precise metadata (install
/// path, Steam appid for header art); the Uninstall-registry catch-all then adds
/// anything else — Battle.net, EA/Origin, Rockstar, Riot, Amazon Games, and any
/// other installed title recognized by publisher or install path. Xbox/Game Pass
/// (UWP) titles don't expose a reliably-readable pre-install manifest either;
/// those are still picked up live the moment they're launched (see
/// `game_from_running`'s `\xboxgames\` / `\windowsapps\` library markers).
#[tauri::command]
pub fn get_installed_games() -> Vec<GameInfo> {
    let mut games = Vec::new();
    scan_steam(&mut games);
    scan_epic(&mut games);
    scan_gog(&mut games);
    scan_ubisoft(&mut games);
    scan_uninstall_registry(&mut games);
    scan_standalone(&mut games);
    games.sort_by_key(|g| g.name.to_lowercase());
    games.truncate(300);
    games
}

/// Resolve a game title to a Steam appid via Steam's public store search, so the
/// UI can show REAL cover art for non-Steam games (Epic/Xbox/standalone) that
/// don't carry an appid. Read-only network lookup from Rust (no CSP limits); the
/// image itself then loads from the already-allowed Steam CDN. Returns None on
/// any failure — the UI just keeps its placeholder, never a wrong cover.
#[tauri::command]
pub async fn resolve_steam_appid(name: String) -> Option<String> {
    let q = name.trim();
    if q.is_empty() {
        return None;
    }
    let url = reqwest::Url::parse_with_params(
        "https://store.steampowered.com/api/storesearch/",
        &[("term", q), ("cc", "us"), ("l", "en")],
    )
    .ok()?;
    let client = reqwest::Client::new();
    let resp = client
        .get(url)
        .timeout(std::time::Duration::from_secs(6))
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let v: serde_json::Value = resp.json().await.ok()?;
    let items = v.get("items")?.as_array()?;
    // Only accept a confident match: the top result's name should look like the
    // query (case-insensitive contains either way) so we don't slap the wrong
    // cover on a game. Otherwise keep the placeholder.
    // Require an EXACT title match (ignoring case, spaces and punctuation) so we
    // never slap the wrong cover on a game — e.g. "Minecraft" must not match
    // "Minecraft Dungeons". Non-matches fall through to the game's own exe icon.
    let norm = |s: &str| s.chars().filter(|c| c.is_alphanumeric()).flat_map(|c| c.to_lowercase()).collect::<String>();
    let want = norm(q);
    let first = items.first()?;
    let hit_name = first.get("name")?.as_str()?;
    if norm(hit_name) != want {
        return None;
    }
    first.get("id")?.as_u64().map(|id| id.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redistributables_and_desktop_apps_are_filtered_but_real_games_are_not() {
        // Redistributables + desktop apps (Wallpaper Engine) must be hidden…
        assert!(NON_GAME_APPIDS.contains(&"228980"));
        assert!(NON_GAME_APPIDS.contains(&"431960")); // Wallpaper Engine
        // …while real games (e.g. Dota 2 = 570, CS2 = 730) must not be.
        assert!(!NON_GAME_APPIDS.contains(&"570"));
        assert!(!NON_GAME_APPIDS.contains(&"730"));
    }

    #[test]
    fn standalone_and_publisher_coverage_includes_common_games() {
        // The launcher-less games users kept saying were missing must be covered.
        let names: Vec<&str> = STANDALONE_GAMES.iter().map(|(n, _, _)| *n).collect();
        assert!(names.contains(&"Roblox"));
        assert!(names.contains(&"Minecraft"));
        // Their publishers are recognised too (for the uninstall-registry path).
        assert!(is_probable_game("Roblox", "Roblox Corporation", ""));
        assert!(is_probable_game("Minecraft Launcher", "Mojang", ""));
    }

    #[test]
    fn launcher_less_running_games_are_detected() {
        // Roblox runs from %LOCALAPPDATA% (no library folder) — must still match.
        assert_eq!(standalone_running_game("robloxplayerbeta", ""), Some("Roblox"));
        // Minecraft Java is a javaw process — identified by its command line.
        assert_eq!(
            standalone_running_game("javaw", "-cp c:\\users\\me\\appdata\\roaming\\.minecraft\\libraries net.minecraft.client.main.main"),
            Some("Minecraft")
        );
        // A plain javaw (e.g. an IDE) is NOT a game.
        assert_eq!(standalone_running_game("javaw", "-jar build/tool.jar"), None);
        // Something random isn't a game.
        assert_eq!(standalone_running_game("notepad", ""), None);
    }

    #[test]
    fn non_game_desktop_apps_are_filtered_by_name() {
        assert!(is_non_game_name("Wallpaper Engine"));
        assert!(is_non_game_name("MyDockFinder"));
        assert!(is_non_game_name("SteamVR"));
        // A real game with an innocuous name is not swept in.
        assert!(!is_non_game_name("Watch Dogs"));
        assert!(!is_non_game_name("Combat Master"));
        // Roblox Studio (the dev editor, Start-menu "Roblox Studio for <user>") is
        // NOT a game — but the Roblox player still is.
        assert!(is_non_game_name("Roblox Studio for syeda"));
        assert!(is_non_game_name("Unreal Engine 5.4"));
        assert!(!is_non_game_name("Roblox"));
        // UWP/desktop apps that were being flagged as games are now filtered.
        assert!(is_non_game_name("Claude 1.20186.1.0 X64 Pzs8sxrjxfjjc"));
        assert!(is_non_game_name("Spotify"));
        assert!(is_non_game_name("Discord"));
        // The \windowsapps\ marker is gone, so a UWP app path is NOT a "game".
        assert!(game_from_running(r"C:\Program Files\WindowsApps\Claude_1.0\claude.exe", "claude").is_none());
    }

    #[test]
    fn services_launchers_anticheat_are_not_games_and_roblox_dedupes() {
        // Launchers / services / anti-cheat must never appear as games.
        assert!(is_non_game_name("Epic Online Services"));
        assert!(is_non_game_name("Riot Client"));
        assert!(is_non_game_name("Riot Vanguard"));
        // Roblox found three ways collapses to a single "Roblox".
        assert_eq!(canonical_name("Roblox Player"), "Roblox");
        assert_eq!(canonical_name("Roblox Player for Urban9"), "Roblox");
        let mut games = Vec::new();
        let mk = |n: &str, path: Option<&str>| GameInfo {
            name: n.to_string(), exe: String::new(), launcher: None,
            install_path: path.map(String::from), app_id: None,
        };
        push_unique(&mut games, mk("Roblox Player", None));
        push_unique(&mut games, mk("Roblox Player for Urban9", None));
        push_unique(&mut games, mk("Roblox", Some(r"C:\Users\x\AppData\Local\Roblox\Versions")));
        push_unique(&mut games, mk("Epic Online Services", None)); // filtered
        assert_eq!(games.len(), 1, "all Roblox variants collapse; EOS is filtered");
        assert_eq!(games[0].name, "Roblox");
        // The richer install path back-filled from a later duplicate (for its icon).
        assert!(games[0].install_path.is_some());
    }

    #[test]
    fn push_unique_dedupes_across_separator_variants_and_filters_non_games() {
        let mut games = Vec::new();
        let mk = |n: &str| GameInfo {
            name: n.to_string(), exe: String::new(), launcher: None,
            install_path: None, app_id: None,
        };
        push_unique(&mut games, mk("Watch Dogs"));
        push_unique(&mut games, mk("Watch_Dogs")); // same title, different separator
        push_unique(&mut games, mk("watch-dogs")); // same again
        push_unique(&mut games, mk("Wallpaper Engine")); // non-game, must be dropped
        assert_eq!(games.len(), 1, "Watch Dogs variants collapse to one, no non-games");
        assert_eq!(games[0].name, "Watch Dogs");
    }

    #[test]
    fn generic_detection_finds_uncurated_games_by_path() {
        // An unknown game inside a Steam library folder is detected + named
        // from its folder, not the exe.
        let g = game_from_running(
            r"D:\Steam\steamapps\common\Some Cool Game\bin\game.exe",
            "game",
        )
        .expect("should detect a game inside steamapps/common");
        assert_eq!(g.name, "Some Cool Game");
    }

    #[test]
    fn generic_detection_ignores_launchers_and_non_library_exes() {
        // The Steam client itself must never be flagged as a game…
        assert!(game_from_running(r"C:\Program Files (x86)\Steam\steam.exe", "steam").is_none());
        // …nor a random app outside any game library.
        assert!(game_from_running(r"C:\Windows\explorer.exe", "explorer").is_none());
    }

    #[test]
    fn titleize_cleans_folder_names() {
        assert_eq!(titleize("watch_dogs-2"), "Watch Dogs 2");
    }

    #[test]
    fn uninstall_scan_recognizes_publisher_whitelisted_games() {
        assert!(is_probable_game("Overwatch 2", "Blizzard Entertainment", ""));
        assert!(is_probable_game("Grand Theft Auto V", "Rockstar Games", ""));
        assert!(is_probable_game("VALORANT", "Riot Games, Inc.", ""));
    }

    #[test]
    fn uninstall_scan_filters_launchers_and_tools_even_from_game_publishers() {
        // The launcher itself, even though a real game publisher "owns" it.
        assert!(!is_probable_game("Battle.net", "Blizzard Entertainment", ""));
        assert!(!is_probable_game("EA app", "Electronic Arts", ""));
        // Redistributables/drivers are never games, regardless of publisher string.
        assert!(!is_probable_game("Microsoft Visual C++ 2015 Redistributable (x64)", "Microsoft Corporation", ""));
        assert!(!is_probable_game("NVIDIA GeForce Experience", "NVIDIA Corporation", ""));
    }

    #[test]
    fn uninstall_scan_catches_unpublished_titles_by_install_path() {
        // No recognized publisher, but installed inside a known game-library folder.
        assert!(is_probable_game("Some Indie Game", "", r"D:\Epic Games\SomeIndieGame"));
        // Random unrelated software isn't swept in.
        assert!(!is_probable_game("Notepad++", "", r"C:\Program Files\Notepad++"));
        assert!(!is_probable_game("Spotify", "Spotify AB", r"C:\Users\me\AppData\Roaming\Spotify"));
    }
}
