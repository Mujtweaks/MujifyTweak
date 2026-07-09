//! Checkpoint 11 (storage half) — ProfileStore.
//!
//! Per-game profiles persisted as JSON under
//! `%AppData%\Roaming\MujifyTweaks\profiles\*.json`, each carrying a
//! `schema_version` from day one (so the v2.0 community-import path can migrate
//! old files). Pure storage: create/list/update/delete. No auto-apply here.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

const SCHEMA_VERSION: u32 = 1;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub schema_version: u32,
    pub id: String,
    pub game_name: String,
    pub game_exe: Option<String>,
    pub launcher: Option<String>,
    pub preset: String,
    pub launch_options: Option<String>,
    pub enabled_tweaks: Vec<String>,
    /// Opt-in: auto-apply this profile's tweaks when the game launches (and
    /// revert on exit). Only ever acts when the global master switch is ALSO on.
    /// `default` keeps older profile JSON loading fine.
    #[serde(default)]
    pub auto_apply: bool,
    pub created_at: String,
    pub last_played: Option<String>,
    /// Populated only from real measured sessions (Checkpoints 13–15). Never faked.
    pub avg_fps_before: Option<f32>,
    pub avg_fps_after: Option<f32>,
}

fn profiles_dir() -> Option<PathBuf> {
    let base = std::env::var("APPDATA").ok()?;
    let dir = PathBuf::from(base).join("MujifyTweaks").join("profiles");
    fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

fn slugify(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect()
}

#[tauri::command]
pub fn list_profiles() -> Vec<Profile> {
    let Some(dir) = profiles_dir() else {
        return Vec::new();
    };
    let mut out = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            if entry.path().extension().map(|e| e == "json").unwrap_or(false) {
                if let Ok(text) = fs::read_to_string(entry.path()) {
                    if let Ok(p) = serde_json::from_str::<Profile>(&text) {
                        out.push(p);
                    }
                }
            }
        }
    }
    out.sort_by(|a, b| a.game_name.to_lowercase().cmp(&b.game_name.to_lowercase()));
    out
}

#[tauri::command]
pub fn save_profile(mut profile: Profile) -> Result<Profile, String> {
    let dir = profiles_dir().ok_or("Could not resolve AppData profiles directory")?;
    profile.schema_version = SCHEMA_VERSION;
    if profile.id.is_empty() {
        profile.id = slugify(&profile.game_name);
    }
    let path = dir.join(format!("{}.json", slugify(&profile.id)));
    let json = serde_json::to_string_pretty(&profile).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(profile)
}

#[tauri::command]
pub fn delete_profile(id: String) -> Result<(), String> {
    let dir = profiles_dir().ok_or("Could not resolve AppData profiles directory")?;
    let path = dir.join(format!("{}.json", slugify(&id)));
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
