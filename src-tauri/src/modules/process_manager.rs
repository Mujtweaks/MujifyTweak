//! Background Apps — close the background programs eating your RAM before a
//! game, and see the real memory that came back.
//!
//! Same philosophy as the Services manager: Mujify only lists processes it can
//! NAME and EXPLAIN. It will not dump 300 rows of `svchost.exe` and let you
//! shoot Windows in the foot. Everything offered here is a real, recognisable
//! desktop app — a launcher, a chat client, a browser, vendor RGB software.
//!
//! Honesty rules this module lives by:
//!  * Closing a process is an ACTION, not a settings change — there is no prior
//!    state to snapshot, so it deliberately does NOT pretend to be reversible
//!    through the ChangeLog. The UI says "reopen it yourself", because that is
//!    the truth. (Same shape as `cleaner::clean_junk` / `debloat::remove_bloatware`.)
//!  * The freed-RAM figure is a real GlobalMemoryStatusEx before/after delta.
//!    Never a fabricated number, never an estimate.
//!  * Every kill target is re-validated against the catalog HERE, on the
//!    backend. The frontend's list is never trusted.
//!  * The game you are playing, and the anti-cheat protecting it, are never
//!    offered and never killed.

use std::mem::size_of;

use serde::Serialize;
use sysinfo::{ProcessesToUpdate, System};
use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};

use super::anti_cheat_guard::ANTI_CHEAT_PROCESSES;

const MB: u64 = 1_048_576;

/// One background app the user may safely be offered the chance to close.
pub struct ProcDef {
    /// Lowercased exe stem (no ".exe").
    pub stem: &'static str,
    pub display: &'static str,
    /// launcher | chat | browser | vendor | cloud | media
    pub category: &'static str,
    pub description: &'static str,
    /// True when closing it before a game is a safe, obvious win.
    pub recommended: bool,
    /// The real cost. None means there genuinely isn't one worth a warning.
    pub warning: Option<&'static str>,
}

/// The curated catalog of closable background apps.
pub const CLOSABLE: &[ProcDef] = &[
    // ---- Game launchers -------------------------------------------------
    ProcDef {
        stem: "epicgameslauncher",
        display: "Epic Games Launcher",
        category: "launcher",
        description: "Epic's storefront. It keeps a full browser engine running in the background just to show you the store.",
        recommended: true,
        warning: Some("Epic games launched through it won't start until you reopen it. Close this only if you're not playing an Epic game."),
    },
    ProcDef {
        stem: "battle.net",
        display: "Battle.net",
        category: "launcher",
        description: "Blizzard's launcher, which stays resident after your game starts.",
        recommended: true,
        warning: Some("Blizzard games need it running to launch. Close it only if you're not playing one."),
    },
    ProcDef {
        stem: "eadesktop",
        display: "EA App",
        category: "launcher",
        description: "EA's launcher. Heavy, and it stays in the background permanently.",
        recommended: true,
        warning: Some("EA games need it running to launch. Close it only if you're not playing one."),
    },
    ProcDef {
        stem: "galaxyclient",
        display: "GOG Galaxy",
        category: "launcher",
        description: "GOG's launcher and its background sync helpers.",
        recommended: true,
        warning: None,
    },
    ProcDef {
        stem: "upc",
        display: "Ubisoft Connect",
        category: "launcher",
        description: "Ubisoft's launcher, resident in the background.",
        recommended: true,
        warning: Some("Ubisoft games need it running to launch. Close it only if you're not playing one."),
    },
    ProcDef {
        stem: "steamwebhelper",
        display: "Steam Web Helper",
        category: "launcher",
        description: "Steam's built-in browser. It is usually the single largest RAM consumer on a gaming PC — often more than Steam itself.",
        recommended: false,
        warning: Some("This is part of Steam. Closing it can make the Steam window blank or unresponsive, and Steam may need restarting. It does NOT close your running game."),
    },
    // ---- Chat / social ---------------------------------------------------
    ProcDef {
        stem: "discord",
        display: "Discord",
        category: "chat",
        description: "Chat client running on a full browser engine. Commonly several hundred MB.",
        recommended: false,
        warning: Some("You'll drop out of voice chat and stop receiving messages. Most people want this ON while gaming."),
    },
    ProcDef {
        stem: "slack",
        display: "Slack",
        category: "chat",
        description: "Work chat. Rarely needed mid-game, and it is not light.",
        recommended: true,
        warning: None,
    },
    ProcDef {
        stem: "ms-teams",
        display: "Microsoft Teams",
        category: "chat",
        description: "Work chat that loves to start itself and sit in the background.",
        recommended: true,
        warning: None,
    },
    ProcDef {
        stem: "teams",
        display: "Microsoft Teams",
        category: "chat",
        description: "Work chat that loves to start itself and sit in the background.",
        recommended: true,
        warning: None,
    },
    ProcDef {
        stem: "telegram",
        display: "Telegram",
        category: "chat",
        description: "Messaging client sitting in the background.",
        recommended: true,
        warning: None,
    },
    ProcDef {
        stem: "whatsapp",
        display: "WhatsApp",
        category: "chat",
        description: "Messaging client sitting in the background.",
        recommended: true,
        warning: None,
    },
    // ---- Browsers --------------------------------------------------------
    ProcDef {
        stem: "chrome",
        display: "Google Chrome",
        category: "browser",
        description: "Chrome runs one process per tab and extension. It is very often the biggest single thing between you and more free RAM.",
        recommended: false,
        warning: Some("This closes ALL your tabs and windows. Anything unsaved in a web page is gone."),
    },
    ProcDef {
        stem: "msedge",
        display: "Microsoft Edge",
        category: "browser",
        description: "Edge, including the copies Windows starts on its own to 'preload' the browser.",
        recommended: false,
        warning: Some("This closes ALL your tabs and windows. Anything unsaved in a web page is gone."),
    },
    ProcDef {
        stem: "firefox",
        display: "Mozilla Firefox",
        category: "browser",
        description: "Firefox and its per-tab content processes.",
        recommended: false,
        warning: Some("This closes ALL your tabs and windows. Anything unsaved in a web page is gone."),
    },
    ProcDef {
        stem: "brave",
        display: "Brave",
        category: "browser",
        description: "Brave and its per-tab content processes.",
        recommended: false,
        warning: Some("This closes ALL your tabs and windows. Anything unsaved in a web page is gone."),
    },
    ProcDef {
        stem: "opera",
        display: "Opera",
        category: "browser",
        description: "Opera and its per-tab content processes.",
        recommended: false,
        warning: Some("This closes ALL your tabs and windows. Anything unsaved in a web page is gone."),
    },
    // ---- Cloud sync ------------------------------------------------------
    ProcDef {
        stem: "onedrive",
        display: "OneDrive",
        category: "cloud",
        description: "Cloud sync. It wakes up and hits your disk while you play.",
        recommended: true,
        warning: Some("File syncing pauses until you reopen it. Nothing is deleted — it catches up next time it runs."),
    },
    ProcDef {
        stem: "dropbox",
        display: "Dropbox",
        category: "cloud",
        description: "Cloud sync with a permanent background presence and real disk activity.",
        recommended: true,
        warning: Some("File syncing pauses until you reopen it. Nothing is deleted."),
    },
    ProcDef {
        stem: "googledrivefs",
        display: "Google Drive",
        category: "cloud",
        description: "Cloud sync running in the background.",
        recommended: true,
        warning: Some("File syncing pauses until you reopen it. Nothing is deleted."),
    },
    // ---- Media -----------------------------------------------------------
    ProcDef {
        stem: "spotify",
        display: "Spotify",
        category: "media",
        description: "Music player built on a browser engine.",
        recommended: false,
        warning: Some("Your music stops. Obviously."),
    },
    // ---- Vendor / RGB / overlay software ---------------------------------
    ProcDef {
        stem: "nvidia web helper",
        display: "NVIDIA Web Helper",
        category: "vendor",
        description: "NVIDIA's background helper service. Not needed to play games — the driver itself is separate and untouched.",
        recommended: true,
        warning: None,
    },
    ProcDef {
        stem: "nvcontainer",
        display: "NVIDIA Container",
        category: "vendor",
        description: "NVIDIA's background container host (telemetry, GeForce Experience features).",
        recommended: false,
        warning: Some("The NVIDIA overlay, ShadowPlay and driver-level game recording stop working until you reopen it. Your display driver itself is unaffected."),
    },
    ProcDef {
        stem: "armourycrate.service",
        display: "Armoury Crate",
        category: "vendor",
        description: "ASUS's RGB and fan-control suite. Famously heavy.",
        recommended: true,
        warning: Some("Custom fan curves and RGB set through Armoury Crate revert to defaults until it's running again. If you rely on a custom fan curve, leave it on."),
    },
    ProcDef {
        stem: "icue",
        display: "Corsair iCUE",
        category: "vendor",
        description: "Corsair's RGB and peripheral suite.",
        recommended: true,
        warning: Some("RGB lighting and any custom fan curves revert to defaults until it's running again."),
    },
    ProcDef {
        stem: "razer synapse 3",
        display: "Razer Synapse",
        category: "vendor",
        description: "Razer's peripheral and RGB suite.",
        recommended: true,
        warning: Some("Custom mouse/keyboard macros and DPI profiles stop applying until it's running again."),
    },
    ProcDef {
        stem: "lghub",
        display: "Logitech G HUB",
        category: "vendor",
        description: "Logitech's peripheral and RGB suite.",
        recommended: true,
        warning: Some("Custom mouse/keyboard macros and DPI profiles stop applying until it's running again."),
    },
    ProcDef {
        stem: "msiafterburner",
        display: "MSI Afterburner",
        category: "vendor",
        description: "GPU overclocking and monitoring tool.",
        recommended: false,
        warning: Some("Any applied overclock or custom fan curve reverts to stock until it's running again. If you're overclocked, leave this on."),
    },
];

/// Processes that are NEVER offered and never killed, whatever the caller asks.
/// Killing any of these ranges from "your desktop disappears" to an instant BSOD.
pub const PROTECTED_STEMS: &[&str] = &[
    // Kernel / session / security core — several of these bugcheck the box.
    "system", "registry", "smss", "csrss", "wininit", "winlogon", "services",
    "lsass", "lsaiso", "svchost", "fontdrvhost", "sihost", "ctfmon",
    "dwm", "audiodg", "conhost", "runtimebroker", "spoolsv", "wudfhost",
    "memory compression", "secure system", "idle",
    // Shell — closing it takes the taskbar and desktop with it.
    "explorer",
    // Mujify itself.
    "mujify-tweaks", "mujify tweaks",
];

/// True if a process must never be touched. Anti-cheat is included: killing it
/// mid-session is the fastest route to a ban, which is the exact opposite of
/// what this app is for.
pub fn is_protected(stem: &str) -> bool {
    let s = stem.to_lowercase();
    PROTECTED_STEMS.iter().any(|p| s == *p)
        || ANTI_CHEAT_PROCESSES.iter().any(|p| s == *p)
}

/// The catalog entry for an exe stem, if we can name and explain it.
pub fn def_for(stem: &str) -> Option<&'static ProcDef> {
    let s = stem.to_lowercase();
    CLOSABLE.iter().find(|d| d.stem == s)
}

/// True if this process may be offered to the user at all. Protection always
/// wins over the catalog, so a name in both lists is still refused.
pub fn is_closable(stem: &str) -> bool {
    !is_protected(stem) && def_for(stem).is_some()
}

/// One background app, grouped across all its processes (Chrome is ~20 of them),
/// with REAL measured memory.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundApp {
    pub stem: String,
    pub display: String,
    pub category: String,
    pub description: String,
    pub warning: Option<String>,
    pub recommended: bool,
    /// Summed private working set across every process of this app, in MB.
    pub memory_mb: u64,
    /// How many processes this app is running.
    pub instances: u32,
}

fn stem_of(name: &str) -> String {
    let n = name.to_lowercase();
    n.strip_suffix(".exe").unwrap_or(&n).to_string()
}

fn mem_status() -> MEMORYSTATUSEX {
    let mut m = MEMORYSTATUSEX {
        dwLength: size_of::<MEMORYSTATUSEX>() as u32,
        ..Default::default()
    };
    unsafe {
        let _ = GlobalMemoryStatusEx(&mut m);
    }
    m
}

/// Group a process snapshot into the catalogued background apps, skipping
/// anything protected, uncatalogued, or belonging to the game being played.
///
/// Pure over its inputs (name, memory-bytes pairs) so the grouping and filtering
/// are unit-testable without touching real processes.
pub fn group_apps(procs: &[(String, u64)], active_game_stem: Option<&str>) -> Vec<BackgroundApp> {
    let mut out: Vec<BackgroundApp> = Vec::new();
    for (name, mem_bytes) in procs {
        let stem = stem_of(name);
        // Never offer to close the game the user is actually playing.
        if active_game_stem.map(|g| g == stem).unwrap_or(false) {
            continue;
        }
        if !is_closable(&stem) {
            continue;
        }
        let Some(def) = def_for(&stem) else { continue };
        match out.iter_mut().find(|a| a.stem == stem) {
            Some(existing) => {
                existing.memory_mb += mem_bytes / MB;
                existing.instances += 1;
            }
            None => out.push(BackgroundApp {
                stem: stem.clone(),
                display: def.display.to_string(),
                category: def.category.to_string(),
                description: def.description.to_string(),
                warning: def.warning.map(String::from),
                recommended: def.recommended,
                memory_mb: mem_bytes / MB,
                instances: 1,
            }),
        }
    }
    // Biggest RAM hog first — that's the one worth closing.
    out.sort_by(|a, b| b.memory_mb.cmp(&a.memory_mb));
    out
}

/// Tauri command — READ-ONLY. Lists the catalogued background apps currently
/// running, with their real measured memory. Closes nothing.
#[tauri::command]
pub async fn list_background_apps() -> Vec<BackgroundApp> {
    tokio::task::spawn_blocking(|| {
        let mut sys = System::new();
        sys.refresh_processes(ProcessesToUpdate::All, true);
        let active_game = super::game_detector::detect_active_game(&sys)
            .map(|g| stem_of(&g.exe));
        let procs: Vec<(String, u64)> = sys
            .processes()
            .values()
            .map(|p| (p.name().to_string_lossy().to_string(), p.memory()))
            .collect();
        group_apps(&procs, active_game.as_deref())
    })
    .await
    .unwrap_or_default()
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CloseResult {
    /// Display names actually closed.
    pub closed: Vec<String>,
    /// Real reasons things didn't close (refused, access denied, already gone).
    pub failed: Vec<String>,
    pub processes_closed: u32,
    /// REAL measured delta, not an estimate. 0 if Windows gave nothing back.
    pub freed_mb: u64,
}

/// Tauri command — close the named background apps. Requires the user's explicit
/// confirmation from the modal; never called by tests or tooling.
///
/// Every stem is re-validated against the catalog HERE. The frontend's list is
/// not trusted, so no amount of tampering with the UI can make this kill
/// `lsass.exe`, an anti-cheat, or the running game.
#[tauri::command]
pub async fn close_background_apps(stems: Vec<String>, confirm: bool) -> Result<CloseResult, String> {
    if !confirm {
        return Err("Refused: closing apps requires explicit confirmation.".into());
    }
    tokio::task::spawn_blocking(move || close_impl(stems)).await.map_err(|e| e.to_string())?
}

fn close_impl(stems: Vec<String>) -> Result<CloseResult, String> {
    let before = mem_status().ullAvailPhys;
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    let active_game = super::game_detector::detect_active_game(&sys).map(|g| stem_of(&g.exe));

    let mut closed: Vec<String> = Vec::new();
    let mut failed: Vec<String> = Vec::new();
    let mut count = 0u32;

    for raw in &stems {
        let stem = stem_of(raw);
        // Backend re-validation — the real gate.
        if !is_closable(&stem) {
            let msg = format!("{stem}: refused — not a closable background app.");
            super::logger::warn(msg.clone());
            failed.push(msg);
            continue;
        }
        if active_game.as_deref() == Some(stem.as_str()) {
            let msg = format!("{stem}: refused — that's the game you're playing.");
            super::logger::warn(msg.clone());
            failed.push(msg);
            continue;
        }
        let display = def_for(&stem).map(|d| d.display).unwrap_or(&stem);
        let mut killed_any = false;
        let mut denied = false;
        for p in sys.processes().values() {
            if stem_of(&p.name().to_string_lossy()) != stem {
                continue;
            }
            if p.kill() {
                killed_any = true;
                count += 1;
            } else {
                denied = true;
            }
        }
        if killed_any {
            closed.push(display.to_string());
        } else if denied {
            // Never silently swallow it — say what actually happened.
            let msg = format!("{display}: Windows refused to close it (it may need admin rights).");
            super::logger::warn(msg.clone());
            failed.push(msg);
        } else {
            failed.push(format!("{display}: wasn't running any more."));
        }
    }

    // Let Windows settle its memory accounting before re-measuring, so the freed
    // figure is real rather than a race.
    std::thread::sleep(std::time::Duration::from_millis(600));
    let after = mem_status().ullAvailPhys;
    let freed_mb = after.saturating_sub(before) / MB;

    super::logger::info(format!(
        "close background apps: closed {count} process(es) across {} app(s), freed {freed_mb} MB",
        closed.len()
    ));

    Ok(CloseResult { closed, failed, processes_closed: count, freed_mb })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_critical_processes_are_never_closable() {
        // Killing any of these ranges from "desktop gone" to an instant BSOD.
        for p in [
            "csrss", "wininit", "winlogon", "services", "lsass", "smss", "svchost",
            "dwm", "audiodg", "explorer", "system", "registry", "fontdrvhost",
        ] {
            assert!(is_protected(p), "{p} must be protected");
            assert!(!is_closable(p), "{p} must never be offered");
        }
        // Case doesn't matter.
        assert!(is_protected("LSASS"));
        assert!(is_protected("Explorer"));
    }

    #[test]
    fn anticheat_is_never_closable() {
        // Killing anti-cheat mid-session is a ban risk — the exact opposite of
        // what this app is for. It's protected, never offered.
        for p in ["vgc", "vgtray", "easyanticheat", "beservice", "battleye"] {
            assert!(is_protected(p), "{p} must be protected");
            assert!(!is_closable(p));
        }
    }

    #[test]
    fn mujify_never_offers_to_close_itself() {
        assert!(is_protected("mujify-tweaks"));
        assert!(!is_closable("mujify-tweaks"));
    }

    #[test]
    fn only_catalogued_apps_are_closable() {
        assert!(is_closable("discord"));
        assert!(is_closable("chrome"));
        assert!(is_closable("epicgameslauncher"));
        // An unknown process is NOT offered — we only list what we can explain.
        assert!(!is_closable("some_random_thing"));
        assert!(!is_closable(""));
    }

    #[test]
    fn protection_beats_the_catalog_even_if_both_match() {
        // Belt and braces: if a name ever ends up in both lists, protection wins.
        assert!(!CLOSABLE.iter().any(|d| is_protected(d.stem)),
            "no catalogued app may also be a protected process");
    }

    #[test]
    fn apps_are_grouped_across_processes_and_sorted_by_real_memory() {
        // Chrome runs one process per tab — they must collapse into one row whose
        // memory is the SUM, which is the whole point of the grouping.
        let procs = vec![
            ("chrome.exe".to_string(), 300 * MB),
            ("chrome.exe".to_string(), 200 * MB),
            ("chrome.exe".to_string(), 100 * MB),
            ("Discord.exe".to_string(), 250 * MB),
            ("lsass.exe".to_string(), 900 * MB),   // protected — must not appear
            ("mystery.exe".to_string(), 800 * MB), // uncatalogued — must not appear
        ];
        let apps = group_apps(&procs, None);
        assert_eq!(apps.len(), 2, "only the two catalogued apps are listed");
        // Biggest first.
        assert_eq!(apps[0].stem, "chrome");
        assert_eq!(apps[0].memory_mb, 600, "chrome's processes are summed");
        assert_eq!(apps[0].instances, 3);
        assert_eq!(apps[1].stem, "discord");
        assert_eq!(apps[1].instances, 1);
        assert!(!apps.iter().any(|a| a.stem == "lsass"));
        assert!(!apps.iter().any(|a| a.stem == "mystery"));
    }

    #[test]
    fn the_running_game_is_never_offered() {
        // A game that happens to share a name with a catalogued app must still be
        // excluded while it's the active game.
        let procs = vec![
            ("chrome.exe".to_string(), 100 * MB),
            ("discord.exe".to_string(), 100 * MB),
        ];
        let apps = group_apps(&procs, Some("discord"));
        assert!(!apps.iter().any(|a| a.stem == "discord"), "the active game is never listed");
        assert!(apps.iter().any(|a| a.stem == "chrome"));
    }

    #[test]
    fn apps_that_cost_the_user_something_carry_a_warning() {
        // Closing a browser loses tabs; closing an overclock tool drops the clock.
        assert!(def_for("chrome").unwrap().warning.is_some());
        assert!(def_for("msiafterburner").unwrap().warning.is_some());
        assert!(def_for("discord").unwrap().warning.is_some());
        // …and the ones people actually want gone by default are recommended.
        assert!(def_for("slack").unwrap().recommended);
        assert!(!def_for("chrome").unwrap().recommended, "never pre-tick losing someone's tabs");
        assert!(!def_for("discord").unwrap().recommended, "most people want Discord on while gaming");
    }

    #[test]
    fn every_catalog_entry_is_lowercase_unique_and_explained() {
        for (i, d) in CLOSABLE.iter().enumerate() {
            assert_eq!(d.stem, d.stem.to_lowercase(), "{} stem must be lowercase", d.stem);
            assert!(!d.display.trim().is_empty());
            assert!(d.description.len() > 20, "{} needs a real explanation", d.stem);
            assert!(
                !CLOSABLE[..i].iter().any(|p| p.stem == d.stem && p.display == d.display),
                "duplicate entry {}",
                d.stem
            );
        }
    }
}
