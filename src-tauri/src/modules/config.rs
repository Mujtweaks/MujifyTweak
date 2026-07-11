//! Local app config (API keys) at %AppData%\Roaming\MujifyTweaks\config.json.
//!
//! Keys are read/written here through Tauri commands rather than embedded in the
//! React bundle, so they can't be lifted out of the installed app's WebView
//! source. Owner-provided defaults are compiled into the binary so the AI works
//! out of the box; a user override saved via `set_api_key` takes precedence.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

// Owner defaults come from BUILD-TIME env vars (a local .env sourced by the dev
// shell, or GitHub Actions secrets) — NEVER hardcoded in source, so they can't
// leak from a public repo. Same discipline as the STATS_TOKEN. If unset at build
// time these compile to "" and the app requires the user to bring their own key
// (BYOK) in Settings. A value saved in config.json still overrides these.
//   Build with:  MUJIFY_NVIDIA_KEY=...  MUJIFY_TAVILY_KEY=...
const DEFAULT_NVIDIA: &str = match option_env!("MUJIFY_NVIDIA_KEY") {
    Some(k) => k,
    None => "",
};
const DEFAULT_TAVILY: &str = match option_env!("MUJIFY_TAVILY_KEY") {
    Some(k) => k,
    None => "",
};

fn config_path() -> Option<PathBuf> {
    let base = std::env::var("APPDATA").ok()?;
    let dir = PathBuf::from(base).join("MujifyTweaks");
    fs::create_dir_all(&dir).ok()?;
    Some(dir.join("config.json"))
}

fn load() -> HashMap<String, String> {
    config_path()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn save(map: &HashMap<String, String>) {
    if let Some(p) = config_path() {
        if let Ok(j) = serde_json::to_string_pretty(map) {
            let _ = fs::write(p, j);
        }
    }
}

fn default_for(key: &str) -> Option<String> {
    let v = match key {
        "nvidia" => DEFAULT_NVIDIA,
        "tavily" => DEFAULT_TAVILY,
        _ => return None,
    };
    if v.is_empty() {
        None
    } else {
        Some(v.to_string())
    }
}

/// Saved override if present, else the compiled-in owner default, else null.
#[tauri::command]
pub fn get_api_key(key: String) -> Option<String> {
    let map = load();
    if let Some(v) = map.get(&key) {
        if !v.trim().is_empty() {
            return Some(v.clone());
        }
    }
    default_for(&key)
}

/// Persist (or clear, if empty) a user-provided key override.
#[tauri::command]
pub fn set_api_key(key: String, value: String) {
    let mut map = load();
    if value.trim().is_empty() {
        map.remove(&key);
    } else {
        map.insert(key, value.trim().to_string());
    }
    save(&map);
}
