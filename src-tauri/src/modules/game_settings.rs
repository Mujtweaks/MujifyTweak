//! Game Settings Advisor — the real FPS engine.
//!
//! For a detected/selected game we recommend the exact in-game GRAPHICS settings
//! for THIS machine's hardware tier (from `hardware_tier`), with an honest impact
//! tier, a visual-cost note, and a plain-English reason. Resolution: a tuned
//! per-game preset → the detected engine's generic advice (Unreal/Unity/Source)
//! → universal advice. Plus an upscaler recommendation that cross-references the
//! game's support with the GPU's (XeSS on Arc, DLSS on RTX, FSR elsewhere).
//!
//! Recommendations only — nothing edits a game's config files. The user changes
//! these in the game's own menu, then proves the gain with the before/after
//! benchmark. We never fabricate a percentage.

use std::collections::HashMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

use super::hardware_tier::{self, HardwareTier};

const DB_JSON: &str = include_str!("../../resources/game_settings_db.json");

#[derive(Deserialize)]
struct SettingsDb {
    games: Vec<GameSettingsDef>,
    engines: HashMap<String, Vec<SettingRec>>,
    universal: Vec<SettingRec>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GameSettingsDef {
    #[serde(rename = "match", default)]
    match_names: Vec<String>,
    name: String,
    #[serde(default)]
    #[allow(dead_code)]
    engine: String,
    #[serde(default)]
    upscalers: Vec<String>,
    recommendations: Vec<SettingRec>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SettingRec {
    setting: String,
    by_tier: HashMap<String, String>,
    impact: String,
    visual_cost: String,
    why: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedRec {
    pub setting: String,
    pub value: String,
    pub impact: String,
    pub visual_cost: String,
    pub why: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpscalerAdvice {
    pub upscaler: String,
    pub quality: String,
    pub impact: String,
    pub why: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SettingsAdvice {
    /// "preset" | "engine" | "universal".
    pub source: String,
    pub reason: String,
    pub game_name: String,
    pub hardware: HardwareTier,
    pub recommendations: Vec<ResolvedRec>,
    pub upscaler: Option<UpscalerAdvice>,
}

/// Map a GPU tier to the JSON lookup key. Unknown → conservative "entry".
fn tier_key(gpu_tier: &str) -> &str {
    match gpu_tier {
        "integrated" | "entry" | "mid" | "high" | "ultra" => gpu_tier,
        _ => "entry",
    }
}

fn tier_word(gpu_tier: &str) -> &'static str {
    match gpu_tier {
        "integrated" => "integrated-graphics",
        "entry" => "entry-tier",
        "mid" => "mid-tier",
        "high" => "high-end",
        "ultra" => "flagship",
        _ => "unrecognized",
    }
}

/// Resolve each recommendation's value for this GPU tier (falling back to the
/// "mid" column, then a dash — never a guess).
fn resolve(recs: &[SettingRec], gpu_tier: &str) -> Vec<ResolvedRec> {
    let key = tier_key(gpu_tier);
    recs.iter()
        .map(|r| ResolvedRec {
            setting: r.setting.clone(),
            value: r
                .by_tier
                .get(key)
                .or_else(|| r.by_tier.get("mid"))
                .cloned()
                .unwrap_or_else(|| "—".into()),
            impact: r.impact.clone(),
            visual_cost: r.visual_cost.clone(),
            why: r.why.clone(),
        })
        .collect()
}

fn concrete_why(u: &str) -> &'static str {
    match u {
        "dlss" => "Enable DLSS Quality — the biggest single FPS win on your RTX GPU, with minimal visual cost.",
        "xess" => "Enable XeSS Quality — a big FPS win with minimal visual cost; it's native/best on Intel Arc and also runs on your GPU.",
        "fsr" => "Enable FSR Quality — a big FPS win that works on your GPU, with a small visual cost.",
        "tsr" => "Enable TSR at Quality — Unreal's built-in upscaler, a solid FPS win with minimal visual cost.",
        _ => "Enable your GPU's upscaler at Quality for a big FPS win.",
    }
}

fn display_name(u: &str) -> &'static str {
    match u {
        "dlss" => "DLSS",
        "xess" => "XeSS",
        "fsr" => "FSR",
        "tsr" => "TSR",
        _ => "Upscaler",
    }
}

/// Preset path: recommend the best upscaler the GAME supports that the GPU also
/// supports (GPU list is best-first). None when the game has no upscaler at all
/// (many competitive titles don't — we stay honest rather than invent one).
pub fn upscaler_advice_preset(gpu_upscalers: &[String], game_upscalers: &[String]) -> Option<UpscalerAdvice> {
    if game_upscalers.is_empty() {
        return None;
    }
    let game_supports = |u: &str| game_upscalers.iter().any(|g| g.eq_ignore_ascii_case(u));
    // Walk the GPU's preference order; recommend the first the game supports.
    for u in gpu_upscalers {
        if game_supports(u) {
            return Some(UpscalerAdvice {
                upscaler: display_name(u).into(),
                quality: "Quality".into(),
                impact: "high".into(),
                why: concrete_why(u).into(),
            });
        }
    }
    // The game has upscalers, but none our GPU lists first-class (e.g. a
    // DLSS-only title on a non-RTX GPU) — suggest TSR/FSR generically if listed.
    if game_supports("tsr") {
        return Some(UpscalerAdvice {
            upscaler: "TSR".into(),
            quality: "Quality".into(),
            impact: "high".into(),
            why: concrete_why("tsr").into(),
        });
    }
    None
}

/// Engine/universal path: game support is unknown, so suggest the GPU's best
/// upscaler with an explicitly conditional "if this game has one" framing.
fn upscaler_advice_generic(gpu_upscalers: &[String], game_name: &str) -> Option<UpscalerAdvice> {
    let u = gpu_upscalers.first()?;
    Some(UpscalerAdvice {
        upscaler: display_name(u).into(),
        quality: "Quality".into(),
        impact: "high".into(),
        why: format!(
            "If {game_name} offers an upscaler (DLSS/XeSS/FSR), enable {} at Quality — the biggest single FPS win available on your GPU, with minimal visual cost.",
            display_name(u)
        ),
    })
}

/// Build advice from a game name + optional install path + a hardware tier.
/// Split from the command so it's testable with a synthetic tier and no machine.
pub fn build_advice(game_name: &str, install_path: Option<&str>, hw: &HardwareTier) -> SettingsAdvice {
    let db: SettingsDb = serde_json::from_str(DB_JSON).expect("game_settings_db.json must parse");
    let lname = game_name.to_lowercase();

    // 1. Tuned per-game preset.
    if let Some(g) = db
        .games
        .iter()
        .find(|g| g.match_names.iter().any(|m| lname.contains(&m.to_lowercase())))
    {
        let reason = if hw.gpu_known {
            format!(
                "Tuned settings for {} on your {} GPU. Change these in the game's own menu, then run a Before/After to measure your real gain.",
                g.name,
                tier_word(&hw.gpu_tier)
            )
        } else {
            format!(
                "Tuned settings for {} — we don't recognize your GPU yet, so these use conservative (entry-tier) values. Change them in the game's own menu, then run a Before/After.",
                g.name
            )
        };
        return SettingsAdvice {
            source: "preset".into(),
            reason,
            game_name: g.name.clone(),
            recommendations: resolve(&g.recommendations, &hw.gpu_tier),
            upscaler: upscaler_advice_preset(&hw.upscalers, &g.upscalers),
            hardware: hw.clone(),
        };
    }

    // 2. Engine fallback — detect the engine from the install folder.
    if let Some(path) = install_path {
        if let Some(engine) = super::game_profiler::detect_engine(Path::new(path)) {
            let key = engine.name.to_lowercase();
            if let Some(recs) = db.engines.get(&key) {
                return SettingsAdvice {
                    source: "engine".into(),
                    reason: format!(
                        "Detected the {} engine — these settings apply to most {} games on your {} GPU.",
                        engine.name,
                        engine.name,
                        tier_word(&hw.gpu_tier)
                    ),
                    game_name: game_name.to_string(),
                    recommendations: resolve(recs, &hw.gpu_tier),
                    upscaler: upscaler_advice_generic(&hw.upscalers, game_name),
                    hardware: hw.clone(),
                };
            }
        }
    }

    // 3. Universal fallback.
    SettingsAdvice {
        source: "universal".into(),
        reason: "No tuned preset for this game yet — here's safe, universal graphics advice for your hardware. Change these in the game's own menu, then run a Before/After.".into(),
        game_name: game_name.to_string(),
        recommendations: resolve(&db.universal, &hw.gpu_tier),
        upscaler: upscaler_advice_generic(&hw.upscalers, game_name),
        hardware: hw.clone(),
    }
}

/// Tauri command — settings advice for a game on this machine. Read-only.
#[tauri::command]
pub fn get_settings_advice(game_name: String, install_path: Option<String>) -> SettingsAdvice {
    let hw = hardware_tier::get_hardware_tier();
    build_advice(&game_name, install_path.as_deref(), &hw)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::hardware_profiler::HardwareProfile;

    fn hw(gpu: &str, cpu: &str, cores: u32) -> HardwareTier {
        let mut p = HardwareProfile::default();
        p.gpu_name = gpu.into();
        p.gpu_vendor = "Test".into();
        p.cpu_name = cpu.into();
        p.cpu_cores = cores;
        p.ram_total_gb = 16.0;
        hardware_tier::tier_from(&p, None)
    }

    #[test]
    fn database_parses_and_tier_maps_are_complete() {
        let db: SettingsDb = serde_json::from_str(DB_JSON).expect("db parses");
        assert!(db.games.len() >= 12, "expected >= 12 games, got {}", db.games.len());
        let tiers = ["integrated", "entry", "mid", "high", "ultra"];
        let check = |recs: &[SettingRec], ctx: &str| {
            assert!(!recs.is_empty(), "{ctx} has no recommendations");
            for r in recs {
                for t in tiers {
                    assert!(r.by_tier.contains_key(t), "{ctx}/{} missing tier '{t}'", r.setting);
                }
            }
        };
        for g in &db.games {
            assert!(!g.match_names.is_empty(), "{} has no match names", g.name);
            check(&g.recommendations, &g.name);
        }
        for (name, recs) in &db.engines {
            check(recs, name);
        }
        check(&db.universal, "universal");
    }

    #[test]
    fn preset_match_resolves_values_for_tier() {
        let a = build_advice("Fortnite", None, &hw("Intel Arc 140V", "Intel Core Ultra 7 258V", 8));
        assert_eq!(a.source, "preset");
        assert_eq!(a.game_name, "Fortnite");
        assert!(!a.recommendations.is_empty());
        // The "integrated" column must be the one resolved for an iGPU.
        let shadows = a.recommendations.iter().find(|r| r.setting == "Shadows").unwrap();
        assert_eq!(shadows.value, "Off");
    }

    #[test]
    fn ultra_gpu_gets_higher_values_than_integrated() {
        let lo = build_advice("Fortnite", None, &hw("Intel Arc 140V", "cpu", 8));
        let hi = build_advice("Fortnite", None, &hw("NVIDIA GeForce RTX 4090", "cpu", 16));
        let lo_sh = lo.recommendations.iter().find(|r| r.setting == "Shadows").unwrap();
        let hi_sh = hi.recommendations.iter().find(|r| r.setting == "Shadows").unwrap();
        assert_eq!(lo_sh.value, "Off");
        assert_eq!(hi_sh.value, "Epic");
    }

    #[test]
    fn unknown_game_falls_back_to_universal() {
        let a = build_advice("Totally Unknown Game 9000", None, &hw("NVIDIA GeForce RTX 4070", "cpu", 8));
        assert_eq!(a.source, "universal");
        assert!(!a.recommendations.is_empty());
    }

    #[test]
    fn upscaler_advisor_is_vendor_and_game_aware() {
        // Arc + Fortnite (supports xess) → XeSS.
        let arc = build_advice("Fortnite", None, &hw("Intel Arc 140V", "cpu", 8));
        assert_eq!(arc.upscaler.as_ref().unwrap().upscaler, "XeSS");
        // RTX + Fortnite (supports dlss) → DLSS.
        let rtx = build_advice("Fortnite", None, &hw("NVIDIA GeForce RTX 4070", "cpu", 8));
        assert_eq!(rtx.upscaler.as_ref().unwrap().upscaler, "DLSS");
        // Valorant has no upscaler at all → none recommended (never invented).
        let val = build_advice("Valorant", None, &hw("NVIDIA GeForce RTX 4070", "cpu", 8));
        assert!(val.upscaler.is_none());
    }

    #[test]
    fn amd_prefers_fsr_over_xess_when_game_supports_both() {
        // Cyberpunk supports dlss/fsr/xess; on AMD we should pick FSR (not DLSS/XeSS).
        let amd = build_advice("Cyberpunk 2077", None, &hw("AMD Radeon RX 6700 XT", "cpu", 8));
        assert_eq!(amd.upscaler.as_ref().unwrap().upscaler, "FSR");
    }
}
