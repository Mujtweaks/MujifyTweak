//! FPS Drop Detective — layer 1a (session recorder) + 1c (regression detective).
//!
//! "My FPS was fine yesterday, why is it bad now?" — the most common gamer
//! complaint, and nothing on the market answers it. We do, 100% locally:
//!   1a. On game exit, record a compact per-game session summary (real measured
//!       data only — null where a value wasn't captured, never an estimate).
//!   1c. When a new session is meaningfully below that game's baseline (median of
//!       prior sessions, noise-aware so normal variation is never flagged), build
//!       a plain-English report of what CHANGED on the PC since it last ran
//!       (the journal, see change_journal.rs) — correlation, never causation.
//!
//! Everything here is local and read-only; no network, ever.

use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use super::change_journal::{self, JournalEntry};

const SCHEMA_VERSION: u32 = 1;
const MAX_SESSIONS_PER_GAME: usize = 50;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GameSession {
    pub schema_version: u32,
    pub game: String,
    pub date: i64, // epoch ms at session end
    pub duration_secs: u64,
    pub avg_fps: Option<f32>,
    pub one_percent_low: Option<f32>,
    pub stability_ms: Option<f32>,
    pub bottleneck: Option<String>,
    pub avg_cpu_temp_c: Option<f32>,
    pub avg_gpu_temp_c: Option<f32>,
    /// Plain-English descriptions of Mujify tweaks active during the session.
    pub active_tweaks: Vec<String>,
}

/// The Detective's report card when a regression is found.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DetectiveReport {
    pub game: String,
    pub drop_pct: f32,
    pub baseline_fps: f32,
    pub current_fps: f32,
    /// What changed on the PC since the game last ran (may be empty → we say so).
    pub changes: Vec<JournalEntry>,
    pub generated_at: i64,
}

// ---- Storage ------------------------------------------------------------------

fn sessions_dir() -> PathBuf {
    let base = std::env::var("APPDATA").unwrap_or_default();
    PathBuf::from(base).join("MujifyTweaks").join("sessions")
}

/// Filesystem-safe slug for a game name.
fn slug(game: &str) -> String {
    let s: String = game
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '_' })
        .collect();
    let s = s.trim_matches('_').to_string();
    if s.is_empty() { "game".into() } else { s }
}

pub fn load_sessions(game: &str) -> Vec<GameSession> {
    let path = sessions_dir().join(format!("{}.json", slug(game)));
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|t| serde_json::from_str::<Vec<GameSession>>(&t).ok())
        .unwrap_or_default()
}

fn save_sessions(game: &str, list: &[GameSession]) {
    let dir = sessions_dir();
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join(format!("{}.json", slug(game)));
    if let Ok(json) = serde_json::to_string_pretty(list) {
        let _ = std::fs::write(path, json);
    }
}

/// Append a session (rolling, capped) and return the full history AFTER it.
fn append_session(session: GameSession) -> Vec<GameSession> {
    let mut list = load_sessions(&session.game);
    list.push(session.clone());
    if list.len() > MAX_SESSIONS_PER_GAME {
        let excess = list.len() - MAX_SESSIONS_PER_GAME;
        list.drain(0..excess); // drop the oldest
    }
    save_sessions(&session.game, &list);
    list
}

// ---- 1c: regression detection (pure, unit-tested) -----------------------------

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RegressionVerdict {
    pub drop_pct: f32,
    pub baseline_fps: f32,
    pub current_fps: f32,
}

fn median(xs: &[f32]) -> f32 {
    let mut v: Vec<f32> = xs.to_vec();
    v.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let n = v.len();
    if n == 0 {
        0.0
    } else if n % 2 == 1 {
        v[n / 2]
    } else {
        (v[n / 2 - 1] + v[n / 2]) / 2.0
    }
}

fn stddev(xs: &[f32]) -> f32 {
    if xs.len() < 2 {
        return 0.0;
    }
    let mean = xs.iter().sum::<f32>() / xs.len() as f32;
    let var = xs.iter().map(|x| (x - mean).powi(2)).sum::<f32>() / (xs.len() as f32 - 1.0);
    var.sqrt()
}

/// Is `current` meaningfully below the game's baseline? `priors` are the avg-FPS
/// values of earlier sessions. Noise-aware (same spirit as the benchmark verdict):
/// the drop must clearly exceed the game's normal session-to-session spread
/// (~2x its std-dev, expressed as a %) AND an 8% floor, so ordinary variation is
/// never flagged. Returns None when there isn't enough history to be sure.
pub fn detect_regression(current_fps: Option<f32>, priors: &[f32]) -> Option<RegressionVerdict> {
    let cur = current_fps?;
    if priors.len() < 3 {
        return None; // need a real baseline first
    }
    let baseline = median(priors);
    if baseline <= 0.0 {
        return None;
    }
    let drop_pct = (baseline - cur) / baseline * 100.0;
    if drop_pct <= 0.0 {
        return None; // at or above baseline — not a regression
    }
    let spread_pct = stddev(priors) / baseline * 100.0;
    let threshold = (2.0 * spread_pct).max(8.0);
    if drop_pct >= threshold {
        Some(RegressionVerdict { drop_pct, baseline_fps: baseline, current_fps: cur })
    } else {
        None
    }
}

// ---- 1a: live session accumulation --------------------------------------------

struct Accum {
    game: String,
    start_ms: i64,
    fps: Vec<f32>,
    one_low: Vec<f32>,
    stability: Vec<f32>,
    cpu_temp: Vec<f32>,
    gpu_temp: Vec<f32>,
    last_bottleneck: Option<String>,
}

static ACCUM: Mutex<Option<Accum>> = Mutex::new(None);
static LATEST_REPORT: Mutex<Option<DetectiveReport>> = Mutex::new(None);

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn mean_opt(xs: &[f32]) -> Option<f32> {
    if xs.is_empty() {
        None
    } else {
        Some(xs.iter().sum::<f32>() / xs.len() as f32)
    }
}

/// Finalize the current accumulator into a saved session, then run the Detective.
/// Returns a report only when a real regression is detected.
fn finalize(accum: Accum) -> Option<DetectiveReport> {
    let priors: Vec<f32> = load_sessions(&accum.game)
        .iter()
        .filter_map(|s| s.avg_fps)
        .collect();
    let last_session_date = load_sessions(&accum.game).last().map(|s| s.date);

    let avg_fps = mean_opt(&accum.fps);
    let session = GameSession {
        schema_version: SCHEMA_VERSION,
        game: accum.game.clone(),
        date: now_ms(),
        duration_secs: ((now_ms() - accum.start_ms).max(0) / 1000) as u64,
        avg_fps,
        one_percent_low: mean_opt(&accum.one_low),
        stability_ms: mean_opt(&accum.stability),
        bottleneck: accum.last_bottleneck.clone(),
        avg_cpu_temp_c: mean_opt(&accum.cpu_temp),
        avg_gpu_temp_c: mean_opt(&accum.gpu_temp),
        active_tweaks: super::change_log::active_entries()
            .into_iter()
            .map(|e| e.description)
            .collect(),
    };
    append_session(session);

    // Detective: is this run meaningfully below the game's baseline?
    let verdict = detect_regression(avg_fps, &priors)?;
    // What changed since it last ran normally? (journal entries in the window)
    let window_start = last_session_date.unwrap_or(0);
    let changes = change_journal::entries_since(window_start);
    let report = DetectiveReport {
        game: accum.game,
        drop_pct: verdict.drop_pct,
        baseline_fps: verdict.baseline_fps,
        current_fps: verdict.current_fps,
        changes,
        generated_at: now_ms(),
    };
    *LATEST_REPORT.lock().unwrap() = Some(report.clone());
    Some(report)
}

/// Called from the GameDetector loop each tick with the active game name (or
/// None on exit). Accumulates live PresentMon/temp samples while a game runs; on
/// exit, finalizes + saves a session and returns a Detective report if the run
/// regressed. Records only real measured samples — nulls where unmeasured.
pub fn on_tick(active_game: Option<&str>) -> Option<DetectiveReport> {
    let mut guard = ACCUM.lock().unwrap();
    match (active_game, guard.as_ref().map(|a| a.game.clone())) {
        // Same game still running → accumulate a sample.
        (Some(g), Some(cur)) if cur == g => {
            let a = guard.as_mut().unwrap();
            if let Some(f) = super::frame_time_monitor::latest_frame() {
                a.fps.push(f.avg_fps);
                a.one_low.push(f.one_percent_low);
                a.stability.push(f.frame_time_stability);
                a.last_bottleneck = f.bottleneck.clone();
            }
            if let Some(s) = super::system_monitor::latest() {
                if let Some(t) = s.cpu_temp_c {
                    a.cpu_temp.push(t);
                }
                if let Some(t) = s.gpu_temp_c {
                    a.gpu_temp.push(t);
                }
            }
            None
        }
        // A different game started → finalize the old one, start fresh.
        (Some(g), Some(_)) => {
            let old = guard.take().unwrap();
            let report = finalize(old);
            *guard = Some(new_accum(g));
            report
        }
        // First game of the session → start accumulating.
        (Some(g), None) => {
            *guard = Some(new_accum(g));
            None
        }
        // Game exited → finalize + save + detect.
        (None, Some(_)) => {
            let old = guard.take().unwrap();
            finalize(old)
        }
        (None, None) => None,
    }
}

fn new_accum(game: &str) -> Accum {
    Accum {
        game: game.to_string(),
        start_ms: now_ms(),
        fps: Vec::new(),
        one_low: Vec::new(),
        stability: Vec::new(),
        cpu_temp: Vec::new(),
        gpu_temp: Vec::new(),
        last_bottleneck: None,
    }
}

// ---- Tauri commands (read-only) ----------------------------------------------

/// Per-game session history (oldest→newest) for the History chart.
#[tauri::command]
pub fn get_game_sessions(game: String) -> Vec<GameSession> {
    load_sessions(&game)
}

/// The latest Detective report, if a regression was flagged (Dashboard card).
#[tauri::command]
pub fn get_detective_report() -> Option<DetectiveReport> {
    LATEST_REPORT.lock().unwrap().clone()
}

/// Dismiss the current Detective report (user acknowledged it).
#[tauri::command]
pub fn dismiss_detective_report() {
    *LATEST_REPORT.lock().unwrap() = None;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_regression_without_enough_history() {
        // Fewer than 3 priors → we don't guess.
        assert!(detect_regression(Some(50.0), &[120.0, 118.0]).is_none());
    }

    #[test]
    fn flags_a_clear_drop_below_a_stable_baseline() {
        // Steady ~120fps history, now 95 → ~21% drop, well beyond noise.
        let priors = [120.0, 118.0, 121.0, 119.0, 122.0];
        let v = detect_regression(Some(95.0), &priors).expect("should flag");
        assert!(v.drop_pct > 15.0 && v.drop_pct < 25.0);
        assert!((v.baseline_fps - 120.0).abs() < 2.0);
    }

    #[test]
    fn does_not_flag_normal_variation() {
        // Same steady history, now 116 → ~3% below median = within noise.
        let priors = [120.0, 118.0, 121.0, 119.0, 122.0];
        assert!(detect_regression(Some(116.0), &priors).is_none());
    }

    #[test]
    fn noisy_history_needs_a_bigger_drop_to_flag() {
        // A game that already swings a lot (90..140) shouldn't flag a modest dip.
        let noisy = [140.0, 90.0, 130.0, 95.0, 135.0, 100.0];
        // ~12% below the ~115 median, but the spread is huge → not flagged.
        assert!(detect_regression(Some(101.0), &noisy).is_none());
        // A big, obvious collapse still flags.
        assert!(detect_regression(Some(45.0), &noisy).is_some());
    }

    #[test]
    fn above_baseline_is_never_a_regression() {
        let priors = [100.0, 102.0, 98.0, 101.0];
        assert!(detect_regression(Some(140.0), &priors).is_none());
    }

    #[test]
    fn slug_is_filesystem_safe() {
        assert_eq!(slug("Counter-Strike 2"), "counter_strike_2");
        assert_eq!(slug("VALORANT"), "valorant");
        assert!(!slug("???").is_empty());
    }
}
