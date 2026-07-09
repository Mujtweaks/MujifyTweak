//! Support hub backend — a shareable plain-text system report.
//!
//! Hardware specs + current state only, for pasting into the Discord so a real
//! person can help. It NEVER includes API keys or the user's name — just the
//! technical facts needed to diagnose a problem.

use super::{change_journal, change_log, hardware_profiler, logger, sessions};

/// Build the "Copy System Report" block. `active_game` comes from the frontend.
#[tauri::command]
pub fn get_support_report(active_game: Option<String>) -> String {
    let mut s = String::new();
    s.push_str("=== Mujify Tweaks — System Report ===\n");
    s.push_str(&format!("App: Mujify Tweaks v{}\n", env!("CARGO_PKG_VERSION")));
    s.push_str(&format!(
        "Windows: {}\n",
        change_journal::windows_build().unwrap_or_else(|| "unknown".into())
    ));

    let hw = hardware_profiler::get_hardware_profile();
    s.push_str(&format!(
        "CPU: {}\n",
        if hw.cpu_name.is_empty() { "unknown".into() } else { hw.cpu_name }
    ));
    s.push_str(&format!(
        "GPU: {} (driver {})\n",
        if hw.gpu_name.is_empty() { "unknown".into() } else { hw.gpu_name },
        hw.gpu_driver_version.unwrap_or_else(|| "?".into())
    ));
    s.push_str(&format!(
        "RAM: {:.0} GB{}\n",
        hw.ram_total_gb,
        hw.ram_speed_mhz.map(|m| format!(" @ {m}MHz")).unwrap_or_default()
    ));
    s.push_str(&format!("Storage: {}\n", hw.storage_summary));

    s.push_str(&format!(
        "Active game: {}\n",
        active_game.clone().unwrap_or_else(|| "none".into())
    ));

    // Last recorded session for the active game.
    if let Some(g) = active_game {
        if let Some(last) = sessions::load_sessions(&g).last() {
            let fps = last
                .avg_fps
                .map(|f| format!("{:.0} FPS avg", f))
                .unwrap_or_else(|| "FPS not measured".into());
            let bottleneck = last
                .bottleneck
                .as_ref()
                .map(|b| format!(", {b}-bound"))
                .unwrap_or_default();
            s.push_str(&format!("Last session: {fps}{bottleneck}\n"));
        }
    }

    // Currently applied tweaks (from the change log).
    let active = change_log::active_entries();
    s.push_str(&format!("Applied tweaks ({}):\n", active.len()));
    if active.is_empty() {
        s.push_str("  (none)\n");
    } else {
        for e in active.iter().take(20) {
            s.push_str(&format!("  - {}\n", e.description));
        }
    }

    // Recent local error lines (no keys/PII — these are sanitized log messages).
    let errs = logger::last_errors(5);
    if !errs.is_empty() {
        s.push_str("Recent log entries:\n");
        for e in errs {
            s.push_str(&format!("  {e}\n"));
        }
    }

    s.push_str("=== end ===");
    s
}
