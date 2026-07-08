//! Per-game recommended tweak database (read-only).
//!
//! Maps a detected/selected game to a curated set of recommended (and
//! not-recommended) tweak ids, bundled from resources/game_profiles.json. This
//! only returns advice — selecting/applying still goes through the normal
//! confirm-gated TweaksEngine path. Nothing here changes the system.

use serde::{Deserialize, Serialize};

const GAME_PROFILES_JSON: &str = include_str!("../../resources/game_profiles.json");

#[derive(Deserialize)]
struct ProfileDb {
    games: Vec<GameProfileDef>,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GameProfileDef {
    /// Lowercase name substrings used to identify the game.
    #[serde(rename = "match", default)]
    match_names: Vec<String>,
    pub name: String,
    pub impact: String,
    pub recommended: Vec<TweakRec>,
    #[serde(default)]
    pub not_recommended: Vec<TweakRec>,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct TweakRec {
    pub id: String,
    pub why: String,
}

/// Return the recommended-tweak profile whose match substrings appear in
/// `game_name`, or None if the game isn't in the database.
#[tauri::command]
pub fn get_recommended_tweaks(game_name: String) -> Option<GameProfileDef> {
    let db: ProfileDb = serde_json::from_str(GAME_PROFILES_JSON).ok()?;
    let lname = game_name.to_lowercase();
    db.games
        .into_iter()
        .find(|g| g.match_names.iter().any(|m| lname.contains(&m.to_lowercase())))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn database_is_valid_and_ids_exist_in_catalog() {
        let db: ProfileDb =
            serde_json::from_str(GAME_PROFILES_JSON).expect("game profiles must parse");
        assert!(db.games.len() >= 12, "expected at least 12 games");
        for g in &db.games {
            assert!(!g.match_names.is_empty(), "{} has no match names", g.name);
            assert!(!g.recommended.is_empty(), "{} has no recommendations", g.name);
            // Every referenced tweak id must be a real catalog tweak.
            for r in g.recommended.iter().chain(g.not_recommended.iter()) {
                assert!(
                    super::super::tweak_catalog::info_for(&r.id).is_some(),
                    "unknown tweak id '{}' in {}",
                    r.id,
                    g.name
                );
            }
        }
    }

    #[test]
    fn matches_a_known_game_by_substring() {
        let p = get_recommended_tweaks("VALORANT".into()).expect("valorant matches");
        assert_eq!(p.name, "Valorant");
        assert!(get_recommended_tweaks("Some Unknown Game 9000".into()).is_none());
    }
}
