//! Local, privacy-safe error logging — NO telemetry, nothing leaves the machine.
//!
//! Writes a small rotating log to `%AppData%\MujifyTweaks\logs\mujify.log` so a
//! user can report a bug without any tracking. We log panics plus warn/error on
//! RealMutator failures, sidecar spawn failures, updater failures and AI request
//! failures. We NEVER log API keys or personal data — callers pass short,
//! sanitized messages, and the panic hook only records the panic message +
//! source location.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

const MAX_BYTES: u64 = 1_000_000; // ~1 MB, then rotate to .1 (one backup kept)
static LOCK: Mutex<()> = Mutex::new(());

/// `%AppData%\MujifyTweaks\logs` (created on demand).
pub fn logs_dir() -> PathBuf {
    let base = std::env::var("APPDATA").unwrap_or_default();
    PathBuf::from(base).join("MujifyTweaks").join("logs")
}

fn write_line(level: &str, msg: &str) {
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let dir = logs_dir();
    let _ = fs::create_dir_all(&dir);
    let path = dir.join("mujify.log");
    // Rotate when the file gets large: mujify.log -> mujify.log.1 (overwrites the
    // previous backup). Two files max — bounded disk use, never grows forever.
    if let Ok(meta) = fs::metadata(&path) {
        if meta.len() > MAX_BYTES {
            let _ = fs::rename(&path, dir.join("mujify.log.1"));
        }
    }
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
        let ts = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
        // One line per event; the message is already sanitized by the caller.
        let _ = writeln!(f, "[{ts}] {level} {msg}");
    }
}

pub fn error(msg: impl AsRef<str>) {
    write_line("ERROR", msg.as_ref());
}
pub fn warn(msg: impl AsRef<str>) {
    write_line("WARN ", msg.as_ref());
}
pub fn info(msg: impl AsRef<str>) {
    write_line("INFO ", msg.as_ref());
}

/// Install a panic hook that records the panic (message + location) to the log,
/// then chains the default hook. Panics don't carry secrets, so this is safe.
pub fn install_panic_hook() {
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let loc = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "unknown".into());
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "panic".into());
        error(format!("PANIC at {loc}: {payload}"));
        default(info);
    }));
}

/// The last `n` WARN/ERROR lines from the log — for the Copy System Report so a
/// user can share what went wrong. Never contains keys or PII (callers sanitize).
pub fn last_errors(n: usize) -> Vec<String> {
    let content = std::fs::read_to_string(logs_dir().join("mujify.log")).unwrap_or_default();
    let mut lines: Vec<String> = content
        .lines()
        .filter(|l| l.contains("ERROR") || l.contains("WARN"))
        .map(|s| s.to_string())
        .collect();
    let start = lines.len().saturating_sub(n);
    lines.drain(0..start);
    lines
}

/// Tauri command — open the logs folder in the OS file manager (Settings → About).
#[tauri::command]
pub fn open_logs_folder() -> Result<(), String> {
    let dir = logs_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // explorer.exe returns a non-zero code on success in some cases, so we only
    // check that it launched — never block or error the UI for this.
    std::process::Command::new("explorer.exe")
        .arg(&dir)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Couldn't open the logs folder: {e}"))
}
