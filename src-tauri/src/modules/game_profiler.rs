//! Universal game profiling — every game gets a real recommended-tweak profile.
//!
//! Three layers: (1) a hardcoded preset for the ~12 known games; else (2) an
//! engine-detected profile — scan the game's install folder for engine
//! signatures and combine with the live GPU/CPU bottleneck; else (3) a safe
//! generic gaming profile. There is never "no preset". Read-only: it only
//! recommends — applying still goes through the confirm modal.

use std::path::Path;

use serde::Serialize;
use walkdir::WalkDir;

use super::game_profiles::{get_recommended_tweaks, TweakRec};

/// A curated (tweak_id, why) recommendation pair.
type Rec = (&'static str, &'static str);

pub struct EngineProfile {
    pub name: &'static str,
    /// Typical bottleneck tendency when we can't measure it live.
    pub tendency: &'static str, // "gpu" | "cpu" | "mixed"
    /// Short phrase used in the "why" reason line.
    pub focus: &'static str,
    pub recommended: &'static [Rec],
    pub not_recommended: &'static [Rec],
}

// ---- Engine → recommended catalog tweaks ----

const UNREAL: EngineProfile = EngineProfile {
    name: "Unreal Engine",
    tendency: "gpu",
    focus: "GPU latency and frame pacing",
    recommended: &[
        ("hags", "Unreal is GPU-heavy — GPU scheduling can smooth frame delivery."),
        ("gpu_priority", "Prioritizes the game on the GPU scheduler."),
        ("disable_fso", "Exclusive fullscreen lowers input lag."),
        ("disable_gamedvr", "Removes background capture that costs GPU frames."),
        ("disable_game_bar", "Drops the Xbox overlay capture overhead."),
        ("mmcss_gaming", "Gives the render thread more scheduling share."),
        ("disable_power_throttling", "Stops the GPU/CPU being throttled to save power."),
    ],
    not_recommended: &[],
};

const UNITY: EngineProfile = EngineProfile {
    name: "Unity",
    tendency: "cpu",
    focus: "single-thread CPU headroom",
    recommended: &[
        ("win32_priority", "Unity often bottlenecks on one thread — favour foreground threads."),
        ("disable_core_parking", "Keep every core awake for the main thread."),
        ("game_priority", "Raise the game's process priority."),
        ("mmcss_gaming", "More CPU/GPU scheduling share for the game."),
        ("large_system_cache", "Frees CPU for the foreground game."),
        ("disable_power_throttling", "Stops power-saving throttling of the main thread."),
        ("disable_game_bar", "Removes overlay capture overhead."),
    ],
    not_recommended: &[],
};

const SOURCE: EngineProfile = EngineProfile {
    name: "Source / Source 2",
    tendency: "cpu",
    focus: "latency and CPU responsiveness for competitive play",
    recommended: &[
        ("disable_nagle", "Competitive netcode — send inputs immediately."),
        ("tcp_ack_frequency", "Immediate ACKs for snappier hit registration."),
        ("network_qos", "Protects your ping from background apps."),
        ("mouse_accel_off", "1:1 aim for consistent flicks."),
        ("disable_fso", "Lower input latency in fullscreen."),
        ("win32_priority", "Favours the game's threads."),
        ("disable_core_parking", "Steadier frame pacing."),
    ],
    not_recommended: &[],
};

const CRYENGINE: EngineProfile = EngineProfile {
    name: "CryEngine",
    tendency: "gpu",
    focus: "GPU throughput and frame pacing",
    recommended: &[
        ("hags", "GPU-heavy engine — test GPU scheduling for smoother frames."),
        ("gpu_priority", "Prioritizes the game on the GPU."),
        ("disable_fso", "Lower input lag in fullscreen."),
        ("mmcss_gaming", "More scheduling share."),
        ("disable_core_parking", "Keeps cores awake."),
    ],
    not_recommended: &[],
};

const RE_ENGINE: EngineProfile = EngineProfile {
    name: "RE Engine",
    tendency: "gpu",
    focus: "GPU latency and frame pacing",
    recommended: &[
        ("hags", "GPU-heavy — GPU scheduling can help frame delivery."),
        ("gpu_priority", "Prioritizes the game on the GPU."),
        ("disable_fso", "Lower input lag."),
        ("mmcss_gaming", "More scheduling share."),
    ],
    not_recommended: &[],
};

const FROSTBITE: EngineProfile = EngineProfile {
    name: "Frostbite",
    tendency: "gpu",
    focus: "GPU latency and frame pacing",
    recommended: &[
        ("hags", "GPU-heavy — test GPU scheduling."),
        ("gpu_priority", "Prioritizes the game on the GPU."),
        ("disable_fso", "Lower input lag."),
        ("disable_gamedvr", "Removes background capture."),
        ("mmcss_gaming", "More scheduling share."),
    ],
    not_recommended: &[],
};

const GODOT: EngineProfile = EngineProfile {
    name: "Godot",
    tendency: "mixed",
    focus: "general responsiveness",
    recommended: &[
        ("mmcss_gaming", "More scheduling share for the game."),
        ("disable_game_bar", "Removes overlay capture overhead."),
        ("disable_fso", "Lower input latency in fullscreen."),
        ("disable_power_throttling", "Stops power-saving throttling."),
    ],
    not_recommended: &[],
};

const GAMEMAKER: EngineProfile = EngineProfile {
    name: "GameMaker",
    tendency: "cpu",
    focus: "CPU responsiveness for 2D titles",
    recommended: &[
        ("win32_priority", "Favours the game's thread."),
        ("mmcss_gaming", "More scheduling share."),
        ("disable_game_bar", "Removes overlay capture overhead."),
    ],
    not_recommended: &[],
};

const RPGMAKER: EngineProfile = EngineProfile {
    name: "RPG Maker",
    tendency: "cpu",
    focus: "light CPU tuning",
    recommended: &[
        ("disable_game_bar", "Removes overlay capture overhead."),
        ("disable_fso", "Lower input latency."),
        ("win32_priority", "Favours the game's thread."),
    ],
    not_recommended: &[],
};

const GENERIC: EngineProfile = EngineProfile {
    name: "Generic",
    tendency: "mixed",
    focus: "a safe, conservative gaming baseline",
    recommended: &[
        ("power_high_perf", "High Performance stops the CPU/GPU down-clocking."),
        ("disable_game_bar", "Removes the Xbox overlay capture overhead."),
        ("disable_gamedvr", "Stops background capture that costs FPS."),
        ("disable_power_throttling", "Stops the game being throttled to save power."),
        ("mmcss_gaming", "Gives the game more CPU/GPU scheduling share."),
    ],
    not_recommended: &[],
};

/// Classify the engine from lowercased, forward-slash relative paths found in
/// the game folder. Uses specific filename/folder matches — never a bare
/// extension alone (`.pak` / `.pck` collide across engines and must corroborate).
pub fn classify_engine(paths: &[String]) -> Option<&'static EngineProfile> {
    let has = |needle: &str| paths.iter().any(|p| p.contains(needle));
    let ends = |suf: &str| paths.iter().any(|p| p.ends_with(suf));
    let file = |name: &str| {
        let tail = format!("/{name}");
        paths.iter().any(|p| p == name || p.ends_with(&tail))
    };

    // Unreal: engine folder, cooked Paks + .pak, IO-store, or shipping exe.
    if has("engine/binaries")
        || (has("content/paks") && ends(".pak"))
        || ends(".utoc")
        || ends("-win64-shipping.exe")
    {
        return Some(&UNREAL);
    }
    // Unity: player dll, a *_Data folder, il2cpp, or the crash handler.
    if file("unityplayer.dll")
        || paths.iter().any(|p| p.ends_with("_data") || p.contains("_data/"))
        || (file("gameassembly.dll") && has("il2cpp_data"))
        || file("unitycrashhandler64.exe")
    {
        return Some(&UNITY);
    }
    // Source / Source 2.
    if file("gameinfo.gi")
        || file("gameinfo.txt")
        || file("engine2.dll")
        || has("bin/engine.dll")
        || has("bin/tier0.dll")
    {
        return Some(&SOURCE);
    }
    // RE Engine (Capcom).
    if file("re_chunk_000.pak") {
        return Some(&RE_ENGINE);
    }
    // CryEngine.
    if file("crysystem.dll") || file("cryrenderd3d11.dll") {
        return Some(&CRYENGINE);
    }
    // Frostbite.
    if has("engine.buildinfo") {
        return Some(&FROSTBITE);
    }
    // Godot — strong markers only (a lone .pck is too weak).
    if file("project.godot") || file("godotsharp.dll") {
        return Some(&GODOT);
    }
    // GameMaker.
    if file("data.win") {
        return Some(&GAMEMAKER);
    }
    // RPG Maker.
    if file("rpg_rt.exe")
        || file("rpg_core.js")
        || paths.iter().any(|p| p.contains("rgss") && p.ends_with(".dll"))
    {
        return Some(&RPGMAKER);
    }
    None
}

/// Bounded, lowercased, forward-slash relative paths under `root`. Depth- and
/// count-limited so a huge game folder can't stall the scan.
fn collect_paths(root: &Path) -> Vec<String> {
    WalkDir::new(root)
        .max_depth(4)
        .into_iter()
        .filter_map(|e| e.ok())
        .take(8000)
        .filter_map(|entry| {
            entry
                .path()
                .strip_prefix(root)
                .ok()
                .map(|rel| rel.to_string_lossy().to_lowercase().replace('\\', "/"))
        })
        .filter(|s| !s.is_empty())
        .collect()
}

pub fn detect_engine(root: &Path) -> Option<&'static EngineProfile> {
    if !root.is_dir() {
        return None;
    }
    classify_engine(&collect_paths(root))
}

fn live_bottleneck() -> Option<String> {
    super::frame_time_monitor::latest_frame().and_then(|f| f.bottleneck)
}

fn to_recs(list: &[Rec]) -> Vec<TweakRec> {
    list.iter()
        .map(|(id, why)| TweakRec {
            id: id.to_string(),
            why: why.to_string(),
        })
        .collect()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameProfileResult {
    pub game_name: String,
    /// "preset" | "engine" | "generic".
    pub source: String,
    pub engine: Option<String>,
    /// Live bottleneck ("gpu"/"cpu"/"balanced") when a game is running.
    pub bottleneck: Option<String>,
    /// The plain-English "why" line shown to the user.
    pub reason: String,
    pub impact: String,
    pub recommended: Vec<TweakRec>,
    pub not_recommended: Vec<TweakRec>,
}

/// The universal profile for a game: preset → engine-detected → safe generic.
/// Always returns a real profile. Read-only.
#[tauri::command]
pub fn get_game_profile(game_name: String, install_path: Option<String>) -> GameProfileResult {
    // 1. Hardcoded preset (the ~12 known games).
    if let Some(p) = get_recommended_tweaks(game_name.clone()) {
        return GameProfileResult {
            game_name,
            source: "preset".into(),
            engine: None,
            bottleneck: live_bottleneck(),
            reason: format!(
                "Tuned Mujify preset for {} — these are hand-picked for this game.",
                p.name
            ),
            impact: p.impact,
            recommended: p.recommended,
            not_recommended: p.not_recommended,
        };
    }

    // 2. Engine detection from the install folder + live bottleneck.
    if let Some(path) = install_path.as_deref().filter(|p| !p.is_empty()) {
        if let Some(eng) = detect_engine(Path::new(path)) {
            let live = live_bottleneck();
            let bneck_desc = match live.as_deref() {
                Some("gpu") => "GPU-bound (live)".to_string(),
                Some("cpu") => "CPU-bound (live)".to_string(),
                Some("balanced") => "balanced load (live)".to_string(),
                Some("capped") => "frame-capped (live)".to_string(),
                _ => match eng.tendency {
                    "gpu" => "typically GPU-bound".into(),
                    "cpu" => "typically CPU-bound".into(),
                    _ => "mixed load".into(),
                },
            };
            return GameProfileResult {
                game_name,
                source: "engine".into(),
                engine: Some(eng.name.to_string()),
                bottleneck: live,
                reason: format!(
                    "Detected {} · {} · these tweaks target {}.",
                    eng.name, bneck_desc, eng.focus
                ),
                impact: "high".into(),
                recommended: to_recs(eng.recommended),
                not_recommended: to_recs(eng.not_recommended),
            };
        }
    }

    // 3. Safe generic fallback — always something real, never "no preset".
    GameProfileResult {
        game_name,
        source: "generic".into(),
        engine: None,
        bottleneck: live_bottleneck(),
        reason:
            "No preset or known engine detected — applying a safe, conservative gaming profile that helps almost any game."
                .into(),
        impact: "medium".into(),
        recommended: to_recs(GENERIC.recommended),
        not_recommended: to_recs(GENERIC.not_recommended),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn p(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn detects_unreal_by_shipping_exe() {
        let e = classify_engine(&p(&["mygame-win64-shipping.exe", "engine/binaries/win64/x.dll"]))
            .unwrap();
        assert_eq!(e.name, "Unreal Engine");
    }

    #[test]
    fn detects_unity_by_player_and_data() {
        let e = classify_engine(&p(&["unityplayer.dll", "mygame_data/globalgamemanagers"])).unwrap();
        assert_eq!(e.name, "Unity");
    }

    #[test]
    fn detects_source_by_gameinfo() {
        let e = classify_engine(&p(&["game/gameinfo.gi", "bin/engine2.dll"])).unwrap();
        assert!(e.name.starts_with("Source"));
    }

    #[test]
    fn bare_pak_or_pck_alone_is_not_an_engine() {
        // A lone .pak / .pck must never identify an engine on its own.
        assert!(classify_engine(&p(&["data/foo.pak", "bar.pck"])).is_none());
    }

    #[test]
    fn no_match_returns_none_so_caller_uses_generic() {
        assert!(classify_engine(&p(&["readme.txt", "game.exe"])).is_none());
    }
}
