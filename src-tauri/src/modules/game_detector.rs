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
    /// The exact file to pull the game's icon from, when we already know it —
    /// Windows' own registered `DisplayIcon`, or a resolved launcher exe.
    ///
    /// Without this the icon extractor has to GUESS by walking the install
    /// folder, which fails exactly where it matters: a data-only folder like
    /// `%APPDATA%\.minecraft` has no exe at all, and a huge folder can burn the
    /// walk's file cap before reaching the real game. Both produced letter tiles.
    pub icon_path: Option<String>,
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

/// Non-game apps whose names are too SHORT or too common to match as a bare
/// substring — these are matched on whole-word boundaries instead. "hone" (the
/// rival optimizer, which was showing up as a game tile) can't be a substring
/// rule or it would also eat a game called "Phone Simulator".
///
/// Mostly PC-tuning/utility software: it lives next to games and gets picked up
/// by the install-path heuristic, but it is never something you play.
const NON_GAME_WORDS: &[&str] = &[
    "hone", "wemod", "cheat engine", "razer cortex", "game booster",
    "smart game booster", "advanced systemcare", "ccleaner", "iobit",
    "driver booster", "wise care", "throttlestop", "process lasso",
    "o&o shutup", "rip tweaks", "riptweaks", "jv16", "tweaking",
    // Our own app must never list itself as one of the user's games.
    "mujify", "mujify tweaks",
];

/// True if a title is a known non-game desktop app (Wallpaper Engine, docks,
/// rival optimizers, …).
///
/// Two matching modes on purpose: distinctive multi-word names are safe as
/// substrings, while short/common ones must match whole words only.
fn is_non_game_name(name: &str) -> bool {
    let n = name.to_lowercase();
    if NON_GAME_NAMES.iter().any(|x| n.contains(x)) {
        return true;
    }
    // Whole-word/phrase match: pad both sides so "hone" hits "Hone 1.2" but not
    // "Phone Simulator".
    let padded = format!(" {} ", norm_name(name));
    NON_GAME_WORDS
        .iter()
        .any(|w| padded.contains(&format!(" {w} ")))
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
    // Fortnite ships several content packs as their own folders/manifests
    // ("Fortnite_JunoContent" = the LEGO/Juno content), which showed as extra
    // tiles beside Fortnite. They are all one game.
    if n.contains("fortnite") {
        return "Fortnite".to_string();
    }
    // "Minecraft Launcher" IS Minecraft — it's how you launch and play it, and
    // it's what Xbox/Game Pass installs the game as. Excluding "launcher" here
    // meant a user with Game Pass Minecraft got TWO tiles: a "Minecraft" one
    // from the data folder (no exe, so a letter tile) and a "Minecraft Launcher"
    // one next to it. They collapse into a single Minecraft, and push_unique
    // back-fills whichever entry actually knows where the exe is.
    if n.contains("minecraft") && !n.contains("dungeon") && !n.contains("legend") && !n.contains("education") {
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
        // A duplicate that knows the real icon file wins — that's the whole
        // point of collapsing "Minecraft Launcher" into "Minecraft".
        if existing.icon_path.is_none() && g.icon_path.is_some() {
            existing.icon_path = g.icon_path;
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
        icon_path: None,
    })
}

/// The single source of truth for "is a game running right now, and which one".
///
/// Shared by the poller below and by `anti_cheat_guard::detect_active`, so the
/// UI's indicator and the backend's apply gate can never disagree about whether
/// a game is live. Read-only: it only inspects an existing process snapshot.
pub fn detect_active_game(sys: &System) -> Option<GameInfo> {
    // First a curated match (nice display names)…
    for process in sys.processes().values() {
        let raw = process.name().to_string_lossy().to_string();
        let stem = stem_of(&raw);
        if let Some(name) = games_db::lookup(&stem) {
            return Some(GameInfo {
                name: name.to_string(),
                exe: raw,
                launcher: None,
                install_path: process
                    .exe()
                    .and_then(|p| p.parent())
                    .map(|p| p.to_string_lossy().to_string()),
                app_id: None,
                icon_path: None,
            });
        }
    }
    // …then launcher-less games (Roblox, Minecraft Java, …) matched by exe /
    // command line, with no library-folder requirement…
    for process in sys.processes().values() {
        let stem = stem_of(&process.name().to_string_lossy());
        let cmd = process
            .cmd()
            .iter()
            .map(|s| s.to_string_lossy().to_lowercase())
            .collect::<Vec<_>>()
            .join(" ");
        if let Some(name) = standalone_running_game(&stem, &cmd) {
            return Some(GameInfo {
                name: name.to_string(),
                exe: process.name().to_string_lossy().to_string(),
                launcher: None,
                install_path: process
                    .exe()
                    .and_then(|p| p.parent())
                    .map(|p| p.to_string_lossy().to_string()),
                app_id: None,
                icon_path: None,
            });
        }
    }
    // …then a GENERIC pass so games not in the table are still detected.
    for process in sys.processes().values() {
        let stem = stem_of(&process.name().to_string_lossy());
        if let Some(path) = process.exe() {
            if let Some(g) = game_from_running(&path.to_string_lossy(), &stem) {
                return Some(g);
            }
        }
    }
    None
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

            let active: Option<GameInfo> = detect_active_game(&sys);

            if active != last_active {
                let _ = app.emit("game_changed", &active);
                // Start/stop real FPS capture (PresentMon) for the new game.
                super::frame_time_monitor::on_active_game_change(&app, &active);
                last_active = active;
            }

            // The gate only engages while a game is genuinely live — an idle
            // anti-cheat service (Vanguard runs from boot forever) must not.
            let ac = anti_cheat_guard::evaluate(&stems, last_active.is_some());
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
                        icon_path: None,
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
                            icon_path: None,
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
                icon_path: None,
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
                icon_path: None,
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
            // Windows already registered this program's icon — by far the most
            // reliable logo source, and it needs no folder walking or guessing.
            let display_icon: String = entry.get_value("DisplayIcon").unwrap_or_default();
            let icon_path = icon_path_from_display_icon(&display_icon)
                .filter(|p| std::path::Path::new(p).is_file());
            // push_unique handles both "already found by a more precise scanner"
            // (normalized-name de-dup) and non-game filtering.
            push_unique(games, GameInfo {
                name,
                exe: String::new(),
                launcher: Some(if publisher.trim().is_empty() { "Installed".into() } else { publisher }),
                install_path: if install_location.trim().is_empty() { None } else { Some(install_location) },
                app_id: None,
                icon_path,
            });
        }
    };

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    scan_one(&hklm, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", games);
    scan_one(&hklm, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall", games);
    scan_one(&hkcu, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", games);
}

/// Clean an uninstall entry's `DisplayIcon` into a plain file path.
///
/// Windows already knows the icon for every installed program, so this is by far
/// the most reliable logo source — no folder walking, no guessing. The value is
/// usually `C:\path\game.exe,0` (an icon index) and is sometimes quoted.
fn icon_path_from_display_icon(raw: &str) -> Option<String> {
    let s = raw.trim().trim_matches('"');
    if s.is_empty() {
        return None;
    }
    // Strip a trailing icon index (",0" / ",-1") without breaking "C:\..." paths.
    let path = match s.rfind(',') {
        Some(i) if s[i + 1..].trim().parse::<i32>().is_ok() => &s[..i],
        _ => s,
    };
    let path = path.trim().trim_matches('"');
    if path.is_empty() {
        return None;
    }
    Some(path.to_string())
}

/// The Roblox PLAYER exe, if the player is actually installed.
///
/// Roblox versions live in `%LOCALAPPDATA%\Roblox\Versions\<hash>\`, and the
/// same folder also holds Roblox STUDIO. Testing for the Versions folder alone
/// therefore claimed "Roblox is installed" for someone who only has Studio — and
/// pointed the icon extractor at a folder so large it hit its file cap before
/// finding anything, leaving a letter tile. Requiring the player's exe fixes the
/// false positive and hands the icon extractor the exact file in one step.
/// The CLASSIC Roblox player, at %LOCALAPPDATA%\Roblox\Versions\<hash>\.
///
/// Only the classic install is looked for here. The Microsoft Store build lives
/// in `Program Files\WindowsApps`, which a normal (non-elevated) process cannot
/// list or read at all — so probing it would be dead code. That build is instead
/// found by `scan_xbox` via `C:\XboxGames\Roblox\Content`, which IS readable and
/// holds the same RobloxPlayerBeta.exe.
fn roblox_player_exe() -> Option<PathBuf> {
    let versions = PathBuf::from(std::env::var("LOCALAPPDATA").ok()?)
        .join("Roblox")
        .join("Versions");
    for entry in std::fs::read_dir(&versions).ok()?.flatten() {
        let exe = entry.path().join("RobloxPlayerBeta.exe");
        if exe.is_file() {
            return Some(exe);
        }
    }
    None
}

/// Exe names inside an Xbox game's `Content\` that are never the game itself.
const XBOX_HELPER_EXES: &[&str] = &["gamelaunchhelper", "crashhandler", "crashpad", "unins"];

/// Score an Xbox logo asset. Higher is better; `None` means "not a logo".
///
/// Game Pass titles ship their branding as PNGs (an MSIX app's icon lives in the
/// package manifest, NOT inside the exe), in a spray of variants:
/// `SmallLogo.altform-unplated_targetsize-256.png`, `.contrast-black_…`, and so
/// on. We want the biggest normal-contrast one; the high-contrast/black/white
/// accessibility variants are wrong outside those themes, and SplashScreen is a
/// wide banner rather than a logo.
fn xbox_logo_score(file_name: &str) -> Option<i32> {
    let n = file_name.to_lowercase();
    if !n.ends_with(".png") {
        return None;
    }
    if n.contains("splashscreen") || n.contains("widelogo") || n.contains("badge") {
        return None; // banners, not logos
    }
    if n.contains("contrast-black") || n.contains("contrast-white") || n.contains("contrast-high") {
        return None; // accessibility variants
    }
    let mut score = 0;
    if n.contains("largelogo") { score += 40 }
    if n.contains("square150x150") || n.contains("square310x310") { score += 35 }
    if n.contains("graphicslogo") { score += 25 }
    if n.contains("storelogo") { score += 20 }
    if n.contains("smalllogo") { score += 15 }
    if n.contains("targetsize-256") { score += 30 }
    if n.contains("scale-400") { score += 12 }
    if n.contains("scale-200") { score += 8 }
    if n.contains("unplated") { score += 6 } // transparent, no coloured plate
    if score == 0 && !n.contains("logo") {
        return None;
    }
    Some(score)
}

/// The best icon source inside an Xbox title's `Content\` folder.
///
/// A logo PNG is STRONGLY preferred over the exe: Game Pass exes routinely can't
/// be opened at all (the folder denies direct reads), and even when they can they
/// often carry no embedded icon, which is exactly why these tiles were showing a
/// bare letter. Falls back to the real game exe — skipping `gamelaunchhelper.exe`,
/// which every Game Pass title ships and which would otherwise give every Xbox
/// game the same generic icon.
fn xbox_icon_source(content: &std::path::Path) -> Option<PathBuf> {
    let mut best_logo: Option<(i32, u64, PathBuf)> = None;
    let mut best_exe: Option<(u64, PathBuf)> = None;

    for entry in std::fs::read_dir(content).ok()?.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|s| s.to_str()) else { continue };
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);

        if let Some(score) = xbox_logo_score(name) {
            if best_logo
                .as_ref()
                .map(|(s, sz, _)| (score, size) > (*s, *sz))
                .unwrap_or(true)
            {
                best_logo = Some((score, size, path));
            }
            continue;
        }
        if path.extension().map(|e| e.eq_ignore_ascii_case("exe")).unwrap_or(false) {
            let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
            if XBOX_HELPER_EXES.iter().any(|h| stem.contains(h)) {
                continue;
            }
            if best_exe.as_ref().map(|(s, _)| size > *s).unwrap_or(true) {
                best_exe = Some((size, path));
            }
        }
    }
    best_logo
        .map(|(_, _, p)| p)
        .or_else(|| best_exe.map(|(_, p)| p))
}

/// Popular games installed OUTSIDE the standard launchers — Roblox, Minecraft
/// (Java + Bedrock/UWP), etc. — detected by their well-known install folder
/// existing. They don't appear in Steam/Epic/GOG manifests or the uninstall
/// registry with a recognisable publisher, so they'd be missed otherwise.
/// (display name, env var, subpath that proves it's installed). Read-only.
const STANDALONE_GAMES: &[(&str, &str, &str)] = &[
    // Roblox is NOT here: presence of its Versions folder does not mean the
    // player is installed (Roblox Studio shares it). See roblox_player_exe().
    ("Minecraft", "ProgramFiles(x86)", r"Minecraft Launcher"),
    ("Minecraft", "ProgramFiles", r"Minecraft Launcher"),
    ("Minecraft", "APPDATA", r".minecraft"),
    ("Minecraft", "LOCALAPPDATA", r"Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe"),
    ("Minecraft Legends", "LOCALAPPDATA", r"Packages\Microsoft.MinecraftEducationEdition_8wekyb3d8bbwe"),
    ("Fortnite", "PROGRAMFILES", r"Epic Games\Fortnite"),
    ("VALORANT", "PROGRAMFILES", r"Riot Games\VALORANT"),
    ("League of Legends", "PROGRAMFILES", r"Riot Games\League of Legends"),
];

/// Riot's install metadata folder names → the real display name. Riot titles
/// have no Steam/Epic manifest and no uninstall entry per game, so without this
/// they only ever appeared once already running.
fn riot_product_display_name(dir_name: &str) -> Option<&'static str> {
    // Folders are "<product>.<patchline>", e.g. "valorant.live".
    let product = dir_name.split('.').next()?.to_lowercase();
    Some(match product.as_str() {
        "valorant" => "VALORANT",
        "league_of_legends" => "League of Legends",
        "legends_of_runeterra" | "bacon" => "Legends of Runeterra",
        "wildrift" => "Wild Rift",
        _ => return None,
    })
}

/// Installed Riot games, from %ProgramData%\Riot Games\Metadata\<product>.<line>.
/// Read-only: it only lists directory names.
fn scan_riot(games: &mut Vec<GameInfo>) {
    let Ok(programdata) = std::env::var("ProgramData") else {
        return;
    };
    let metadata = PathBuf::from(programdata).join("Riot Games").join("Metadata");
    let Ok(entries) = std::fs::read_dir(&metadata) else {
        return;
    };
    for entry in entries.flatten() {
        if !entry.path().is_dir() {
            continue;
        }
        let dir = entry.file_name().to_string_lossy().to_string();
        let Some(name) = riot_product_display_name(&dir) else {
            continue;
        };
        // REQUIRE the real game folder to exist. A metadata folder alone is NOT
        // proof of an install: the Riot Client leaves metadata behind after an
        // uninstall, and lists products the user never fully installed — which is
        // exactly why users saw League of Legends / Legends of Runeterra as ghost
        // tiles for games they'd never downloaded. If the actual folder isn't
        // there, skip it; a game installed to a non-default drive is still caught
        // the moment it's launched (running-detection), which is a far better
        // failure than inventing a game that isn't on the PC.
        let Some(install) = ["SystemDrive", "PROGRAMFILES", "ProgramFiles(x86)"]
            .iter()
            .filter_map(|v| std::env::var(v).ok())
            .map(|base| PathBuf::from(base).join("Riot Games").join(name))
            .find(|p| p.is_dir())
            .map(|p| p.to_string_lossy().to_string())
        else {
            continue;
        };
        push_unique(games, GameInfo {
            name: name.to_string(),
            exe: String::new(),
            launcher: Some("Riot".into()),
            install_path: Some(install),
            app_id: None,
            icon_path: None,
        });
    }
}

/// Installed Xbox / Game Pass (PC) titles. They install to `<drive>:\XboxGames\
/// <Game Name>\Content\…`, which is readable — unlike their UWP manifests, which
/// is why these games previously only showed up once they were already running.
fn scan_xbox(games: &mut Vec<GameInfo>) {
    for letter in 'A'..='Z' {
        let root = PathBuf::from(format!("{letter}:\\XboxGames"));
        let Ok(entries) = std::fs::read_dir(&root) else {
            continue; // drive doesn't exist, or has no Xbox library
        };
        for entry in entries.flatten() {
            if !entry.path().is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            // Every real title has a Content\ folder; skip launcher scaffolding.
            let content = entry.path().join("Content");
            if !content.exists() {
                continue;
            }
            // Resolve the real exe now: it's the icon source, and it saves the
            // extractor from walking a multi-GB game folder to guess at one.
            let icon_path = xbox_icon_source(&content).map(|p| p.to_string_lossy().to_string());
            push_unique(games, GameInfo {
                name,
                exe: String::new(),
                launcher: Some("Xbox".into()),
                install_path: Some(content.to_string_lossy().to_string()),
                app_id: None,
                icon_path,
            });
        }
    }
}

fn scan_standalone(games: &mut Vec<GameInfo>) {
    // Roblox first, and only when the PLAYER's exe genuinely exists. The exe
    // path doubles as the icon source, so this can never fall to a letter tile.
    if let Some(exe) = roblox_player_exe() {
        push_unique(games, GameInfo {
            name: "Roblox".into(),
            exe: "RobloxPlayerBeta.exe".into(),
            launcher: Some("Installed".into()),
            install_path: exe.parent().map(|p| p.to_string_lossy().to_string()),
            app_id: None,
            icon_path: Some(exe.to_string_lossy().to_string()),
        });
    }
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
                icon_path: None,
            });
        }
    }
}

/// Read-only scan across installed libraries. No launches, no modifications.
///
/// Steam + Epic + GOG + Ubisoft are read directly for precise metadata (install
/// path, Steam appid for cover art). Riot and Xbox/Game Pass get dedicated
/// scanners because they publish no manifest any of the above can read — before
/// those existed, those titles only appeared once you were already playing them.
/// The Uninstall-registry catch-all then adds anything else — Battle.net,
/// EA/Origin, Rockstar, Amazon Games, and any other installed title recognized
/// by publisher or install path.
#[tauri::command]
pub fn get_installed_games() -> Vec<GameInfo> {
    let mut games = Vec::new();
    scan_steam(&mut games);
    scan_epic(&mut games);
    scan_gog(&mut games);
    scan_ubisoft(&mut games);
    scan_riot(&mut games);
    scan_xbox(&mut games);
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
    let candidates: Vec<(String, String)> = items
        .iter()
        .take(5)
        .filter_map(|it| {
            let name = it.get("name")?.as_str()?.to_string();
            let id = it.get("id")?.as_u64()?.to_string();
            Some((name, id))
        })
        .collect();
    best_steam_match(q, &candidates)
}

/// Normalize a title for comparison: letters and digits only, lowercased.
fn norm_title(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

/// The part of a Steam title before its subtitle — "Warface: Clutch" → "Warface".
/// Only punctuation that genuinely introduces a subtitle counts; a plain space
/// does NOT, which is what keeps "Minecraft" from matching "Minecraft Dungeons".
fn title_without_subtitle(s: &str) -> &str {
    match s.find([':', '–', '—', '(', '|']) {
        Some(i) => s[..i].trim_end(),
        None => s,
    }
}

/// Pick the best CONFIDENT Steam match for a title, or None (the UI then falls
/// back to the game's own exe icon — never a wrong cover).
///
/// Exact-match-only was too strict: real titles carry subtitles Steam spells out
/// in full ("Warface" is listed as "Warface: Clutch"), so those games silently
/// got a letter tile. Accepting the subtitle form is safe because the part before
/// the colon still has to match exactly.
fn best_steam_match(query: &str, candidates: &[(String, String)]) -> Option<String> {
    let want = norm_title(query);
    if want.is_empty() {
        return None;
    }
    let score = |name: &str| -> u8 {
        if norm_title(name) == want {
            2 // exact title
        } else if norm_title(title_without_subtitle(name)) == want {
            1 // same game, Steam just spells the subtitle out
        } else {
            0 // not confident — no cover is better than the wrong cover
        }
    };
    candidates
        .iter()
        .map(|(name, id)| (score(name), id))
        .filter(|(s, _)| *s > 0)
        .max_by_key(|(s, _)| *s)
        .map(|(_, id)| id.clone())
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
        assert!(names.contains(&"Minecraft"));
        // Roblox is deliberately NOT a folder-existence check: its Versions
        // folder also exists for someone who only has Roblox STUDIO, which
        // wrongly claimed the game was installed and gave a letter tile. It's
        // detected by the player's real exe instead — see roblox_player_exe().
        assert!(!names.contains(&"Roblox"));
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
            install_path: path.map(String::from), app_id: None, icon_path: None,
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
            install_path: None, app_id: None, icon_path: None,
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
    fn display_icon_registry_values_are_cleaned_into_real_paths() {
        // The common form: a path plus an icon index.
        assert_eq!(
            icon_path_from_display_icon(r"C:\Games\Cool\game.exe,0").as_deref(),
            Some(r"C:\Games\Cool\game.exe")
        );
        // Quoted, negative index.
        assert_eq!(
            icon_path_from_display_icon(r#""C:\Program Files\A Game\g.exe",-1"#).as_deref(),
            Some(r"C:\Program Files\A Game\g.exe")
        );
        // No index at all.
        assert_eq!(
            icon_path_from_display_icon(r"C:\Games\x\y.ico").as_deref(),
            Some(r"C:\Games\x\y.ico")
        );
        // A drive-letter colon must NOT be mistaken for an index separator.
        assert_eq!(
            icon_path_from_display_icon(r"C:\a,b\game.exe").as_deref(),
            Some(r"C:\a,b\game.exe"),
            "a comma that isn't followed by a number is part of the path"
        );
        assert_eq!(icon_path_from_display_icon(""), None);
        assert_eq!(icon_path_from_display_icon("   "), None);
    }

    #[test]
    fn minecraft_launcher_collapses_into_minecraft_and_keeps_the_real_icon() {
        // The Game Pass install is literally called "Minecraft Launcher", which
        // used to produce a SECOND tile next to a letter-tile "Minecraft" from
        // the data folder. They must be one game, keeping the launcher's exe.
        assert_eq!(canonical_name("Minecraft Launcher"), "Minecraft");
        assert_eq!(canonical_name("Minecraft"), "Minecraft");
        // …but genuinely different games keep their own identity.
        assert_eq!(canonical_name("Minecraft Dungeons"), "Minecraft Dungeons");
        assert_eq!(canonical_name("Minecraft Legends"), "Minecraft Legends");

        let mut games = Vec::new();
        // Xbox scanner finds the launcher (knows the exe) …
        push_unique(&mut games, GameInfo {
            name: "Minecraft Launcher".into(), exe: String::new(), launcher: Some("Xbox".into()),
            install_path: Some(r"C:\XboxGames\Minecraft Launcher\Content".into()),
            app_id: None, icon_path: Some(r"C:\XboxGames\Minecraft Launcher\Content\game.exe".into()),
        });
        // … and the standalone scanner finds the data folder (no exe).
        push_unique(&mut games, GameInfo {
            name: "Minecraft".into(), exe: String::new(), launcher: Some("Installed".into()),
            install_path: Some(r"C:\Users\me\AppData\Roaming\.minecraft".into()),
            app_id: None, icon_path: None,
        });
        assert_eq!(games.len(), 1, "one Minecraft, not two");
        assert_eq!(games[0].name, "Minecraft");
        assert!(games[0].icon_path.is_some(), "the real icon survives the collapse");
    }

    #[test]
    fn a_richer_duplicate_backfills_the_icon_path() {
        let mut games = Vec::new();
        push_unique(&mut games, GameInfo {
            name: "Some Game".into(), exe: String::new(), launcher: None,
            install_path: None, app_id: None, icon_path: None,
        });
        push_unique(&mut games, GameInfo {
            name: "Some Game".into(), exe: String::new(), launcher: None,
            install_path: None, app_id: None, icon_path: Some(r"C:\g\game.exe".into()),
        });
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].icon_path.as_deref(), Some(r"C:\g\game.exe"));
    }

    #[test]
    fn rival_optimizers_are_not_games_but_similar_titles_survive() {
        // "Hone" is a rival PC optimizer that was showing up as a game tile.
        assert!(is_non_game_name("Hone"));
        assert!(is_non_game_name("Hone 1.2"));
        assert!(is_non_game_name("WeMod"));
        assert!(is_non_game_name("Razer Cortex"));
        // The app must never list itself.
        assert!(is_non_game_name("Mujify Tweaks"));
        // Whole-word matching: a real game that merely CONTAINS those letters is
        // not swept in. This is why "hone" can't be a substring rule.
        assert!(!is_non_game_name("Phone Simulator"));
        assert!(!is_non_game_name("Telephone Booth"));
        assert!(!is_non_game_name("Hollow Knight"));
    }

    #[test]
    fn xbox_logo_assets_are_picked_over_accessibility_and_banner_variants() {
        // Game Pass ships a spray of logo variants; picking the wrong one gives a
        // black-on-black icon or a stretched banner.
        let s = |n: &str| xbox_logo_score(n);
        // Never: high-contrast/accessibility variants, or wide banners.
        assert_eq!(s("SmallLogo.contrast-black_altform-unplated_targetsize-256.png"), None);
        assert_eq!(s("SmallLogo.contrast-white_altform-unplated_targetsize-256.png"), None);
        assert_eq!(s("SmallLogo.contrast-high_altform-unplated_targetsize-256.png"), None);
        assert_eq!(s("SplashScreen.png"), None);
        assert_eq!(s("WideLogo.scale-200.png"), None);
        // Not an image at all.
        assert_eq!(s("Minecraft.exe"), None);
        // The big 256px unplated logo must beat the small scaled one — this is
        // the exact pair present in a real Game Pass Minecraft install.
        let big = s("SmallLogo.altform-unplated_targetsize-256.png").unwrap();
        let small = s("SmallLogo.scale-200.png").unwrap();
        assert!(big > small, "the 256px asset must win ({big} vs {small})");
        // And a proper LargeLogo outranks a StoreLogo.
        assert!(s("LargeLogo.scale-400.png").unwrap() > s("StoreLogo.png").unwrap());
    }

    #[test]
    fn fortnite_content_packs_collapse_into_one_fortnite() {
        // "Fortnite_JunoContent" (the LEGO/Juno content) was showing as a second
        // tile beside Fortnite. Everything Fortnite is one game.
        assert_eq!(canonical_name("Fortnite_JunoContent"), "Fortnite");
        assert_eq!(canonical_name("Fortnite"), "Fortnite");
        assert_eq!(canonical_name("Fortnite Festival"), "Fortnite");
        let mut games = Vec::new();
        let mk = |n: &str| GameInfo {
            name: n.to_string(), exe: String::new(), launcher: None,
            install_path: None, app_id: None, icon_path: None,
        };
        push_unique(&mut games, mk("Fortnite"));
        push_unique(&mut games, mk("Fortnite_JunoContent"));
        assert_eq!(games.len(), 1, "content packs collapse into Fortnite");
        assert_eq!(games[0].name, "Fortnite");
    }

    #[test]
    fn riot_metadata_folders_map_to_real_titles() {
        assert_eq!(riot_product_display_name("valorant.live"), Some("VALORANT"));
        assert_eq!(
            riot_product_display_name("league_of_legends.live"),
            Some("League of Legends")
        );
        // Non-game Riot components (the client itself, patchline scaffolding).
        assert_eq!(riot_product_display_name("riot_client.live"), None);
        assert_eq!(riot_product_display_name(""), None);
    }

    #[test]
    fn steam_match_accepts_exact_and_subtitled_titles() {
        let c = |v: &[(&str, &str)]| -> Vec<(String, String)> {
            v.iter().map(|(n, i)| (n.to_string(), i.to_string())).collect()
        };
        // Exact title.
        assert_eq!(
            best_steam_match("Counter-Strike 2", &c(&[("Counter-Strike 2", "730")])),
            Some("730".into())
        );
        // Steam spells the subtitle out — same game, so the cover is right.
        // This is exactly the case that used to fall through to a letter tile.
        assert_eq!(
            best_steam_match("Warface", &c(&[("Warface: Clutch", "291480")])),
            Some("291480".into())
        );
        // Separators and case in our own title don't matter.
        assert_eq!(
            best_steam_match("Watch_Dogs", &c(&[("Watch_Dogs", "243470")])),
            Some("243470".into())
        );
    }

    #[test]
    fn steam_match_never_returns_a_wrong_cover() {
        let c = |v: &[(&str, &str)]| -> Vec<(String, String)> {
            v.iter().map(|(n, i)| (n.to_string(), i.to_string())).collect()
        };
        // A different game that merely starts with the same word must NOT match —
        // a plain space is not a subtitle separator.
        assert_eq!(best_steam_match("Minecraft", &c(&[("Minecraft Dungeons", "1672970")])), None);
        // Nor a sequel.
        assert_eq!(best_steam_match("Portal", &c(&[("Portal 2", "620")])), None);
        // Unrelated results are rejected outright.
        assert_eq!(best_steam_match("Fortnite", &c(&[("Rocket League", "252950")])), None);
        // No results at all.
        assert_eq!(best_steam_match("Fortnite", &[]), None);
        // An exact hit further down the list still wins over a near-miss on top.
        assert_eq!(
            best_steam_match("Fall Guys", &c(&[("Fall Guys Costume", "1"), ("Fall Guys", "1097150")])),
            Some("1097150".into())
        );
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
