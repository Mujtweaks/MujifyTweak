//! FPS Drop Detective — layer 1b (system change journal).
//!
//! On app start (and once a day while running) we snapshot cheap-to-read system
//! facts and diff them against the previous snapshot, appending a plain-English
//! journal of what changed ("GPU driver X → Y", "New startup app: OneDrive",
//! "Windows update KB… installed"). The Detective (sessions.rs) then correlates
//! an FPS regression with the journal entries in the relevant window.
//!
//! Read-only, bounded size, 100% local. It never claims a change CAUSED anything
//! — it only records what changed and when.

use std::path::PathBuf;
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::wmi_util;

const MAX_JOURNAL: usize = 200;

#[derive(Serialize, Deserialize, Clone, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SystemSnapshot {
    pub gpu_driver: Option<String>,
    pub hotfixes: Vec<String>,
    pub startup_apps: Vec<String>,
    pub power_plan: Option<String>,
    pub mem_total_mb: Option<u64>,
    pub refresh_hz: Option<u32>,
    pub windows_build: Option<String>,
    pub taken_at: i64,
}

#[derive(Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    pub timestamp: i64,
    /// "driver" | "windows_update" | "startup" | "power_plan" | "refresh" | "memory" | "windows_build"
    pub kind: String,
    pub summary: String,
    /// A suggested-action key the UI can turn into a button, or None.
    /// "driver_rollback" | "health_scan" | "power_high_perf" | "max_refresh_rate"
    pub action: Option<String>,
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn entry(now: i64, kind: &str, summary: String, action: Option<&str>) -> JournalEntry {
    JournalEntry { timestamp: now, kind: kind.into(), summary, action: action.map(|s| s.into()) }
}

// ---- Pure diff (unit-tested) --------------------------------------------------

/// Diff two snapshots into plain-English journal entries. Pure + tested; the
/// real gathering below feeds it. "Here's what changed" — never causation.
pub fn diff_snapshots(prev: &SystemSnapshot, new: &SystemSnapshot, now: i64) -> Vec<JournalEntry> {
    let mut out = Vec::new();

    if let (Some(a), Some(b)) = (&prev.gpu_driver, &new.gpu_driver) {
        if a != b {
            out.push(entry(now, "driver", format!("GPU driver {a} → {b}"), Some("driver_rollback")));
        }
    }
    for kb in &new.hotfixes {
        if !prev.hotfixes.contains(kb) {
            out.push(entry(now, "windows_update", format!("Windows update {kb} installed"), None));
        }
    }
    for app in &new.startup_apps {
        if !prev.startup_apps.contains(app) {
            out.push(entry(now, "startup", format!("New startup app: {app}"), Some("health_scan")));
        }
    }
    if let (Some(a), Some(b)) = (&prev.power_plan, &new.power_plan) {
        if a != b {
            out.push(entry(now, "power_plan", format!("Power plan changed: {a} → {b}"), Some("power_high_perf")));
        }
    }
    if let (Some(a), Some(b)) = (prev.refresh_hz, new.refresh_hz) {
        if a != b {
            let action = if b < a { Some("max_refresh_rate") } else { None };
            out.push(entry(now, "refresh", format!("Monitor refresh {a}Hz → {b}Hz"), action));
        }
    }
    if let (Some(a), Some(b)) = (prev.mem_total_mb, new.mem_total_mb) {
        if (a as i64 - b as i64).abs() > 256 {
            out.push(entry(
                now,
                "memory",
                format!("Installed RAM: {:.1}GB → {:.1}GB", a as f32 / 1024.0, b as f32 / 1024.0),
                None,
            ));
        }
    }
    if let (Some(a), Some(b)) = (&prev.windows_build, &new.windows_build) {
        if a != b {
            out.push(entry(now, "windows_build", format!("Windows build {a} → {b}"), None));
        }
    }
    out
}

// ---- Storage ------------------------------------------------------------------

fn data_dir() -> PathBuf {
    let base = std::env::var("APPDATA").unwrap_or_default();
    PathBuf::from(base).join("MujifyTweaks")
}
fn journal_path() -> PathBuf {
    data_dir().join("journal.json")
}
fn snapshot_path() -> PathBuf {
    data_dir().join("last_snapshot.json")
}

fn load_journal() -> Vec<JournalEntry> {
    std::fs::read_to_string(journal_path())
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn append_journal(mut entries: Vec<JournalEntry>) {
    if entries.is_empty() {
        return;
    }
    let mut list = load_journal();
    list.append(&mut entries);
    if list.len() > MAX_JOURNAL {
        let excess = list.len() - MAX_JOURNAL;
        list.drain(0..excess);
    }
    let _ = std::fs::create_dir_all(data_dir());
    if let Ok(json) = serde_json::to_string_pretty(&list) {
        let _ = std::fs::write(journal_path(), json);
    }
}

fn load_last_snapshot() -> Option<SystemSnapshot> {
    std::fs::read_to_string(snapshot_path())
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
}

fn save_last_snapshot(s: &SystemSnapshot) {
    let _ = std::fs::create_dir_all(data_dir());
    if let Ok(json) = serde_json::to_string_pretty(s) {
        let _ = std::fs::write(snapshot_path(), json);
    }
}

/// Journal entries at or after `since` (epoch ms) — feeds the Detective window.
pub fn entries_since(since: i64) -> Vec<JournalEntry> {
    load_journal().into_iter().filter(|e| e.timestamp >= since).collect()
}

/// Full journal (newest last), for a "what changed on my PC" view.
#[tauri::command]
pub fn get_change_journal() -> Vec<JournalEntry> {
    let mut list = load_journal();
    list.reverse(); // newest first for display
    list
}

// ---- Real gathering (read-only) ----------------------------------------------

fn gather_snapshot() -> SystemSnapshot {
    let mut s = SystemSnapshot { taken_at: now_ms(), ..Default::default() };

    if let Some(conn) = wmi_util::connect() {
        // GPU driver + refresh from the first real video controller.
        for row in wmi_util::query(
            &conn,
            "SELECT Name, DriverVersion, CurrentRefreshRate FROM Win32_VideoController",
        ) {
            let name = wmi_util::get_string(&row, "Name").unwrap_or_default().to_lowercase();
            if name.is_empty() || name.contains("virtual") || name.contains("parsec") || name.contains("basic display") {
                continue;
            }
            if s.gpu_driver.is_none() {
                s.gpu_driver = wmi_util::get_string(&row, "DriverVersion");
            }
            if s.refresh_hz.is_none() {
                s.refresh_hz = wmi_util::get_u64(&row, "CurrentRefreshRate").map(|v| v as u32);
            }
        }
        // Installed Windows updates (hotfix ids).
        let mut kbs: Vec<String> = wmi_util::query(&conn, "SELECT HotFixID FROM Win32_QuickFixEngineering")
            .iter()
            .filter_map(|r| wmi_util::get_string(r, "HotFixID"))
            .filter(|k| k.starts_with("KB"))
            .collect();
        kbs.sort();
        kbs.dedup();
        s.hotfixes = kbs;
    }

    s.power_plan = super::power_util::active_power_plan_name();
    s.mem_total_mb = Some(sysinfo_total_mb());
    s.startup_apps = gather_startup_apps();
    s.windows_build = gather_windows_build();
    s
}

fn sysinfo_total_mb() -> u64 {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_memory();
    sys.total_memory() / 1_048_576
}

/// Startup entries from the Run keys (value names). Read-only.
fn gather_startup_apps() -> Vec<String> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;
    const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
    let mut out = Vec::new();
    for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        if let Ok(key) = RegKey::predef(root).open_subkey(RUN) {
            for name in key.enum_values().filter_map(|r| r.ok().map(|(n, _)| n)) {
                if !name.is_empty() {
                    out.push(name);
                }
            }
        }
    }
    out.sort();
    out.dedup();
    out
}

/// The current Windows version/build string (for the support report).
pub fn windows_build() -> Option<String> {
    gather_windows_build()
}

fn gather_windows_build() -> Option<String> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;
    let key = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion")
        .ok()?;
    let build: String = key.get_value("CurrentBuildNumber").ok()?;
    let display: String = key.get_value("DisplayVersion").unwrap_or_default();
    Some(if display.is_empty() { build } else { format!("{display} ({build})") })
}

/// Snapshot now and journal any changes vs. the previous snapshot.
pub fn snapshot_and_diff() {
    let new = gather_snapshot();
    if let Some(prev) = load_last_snapshot() {
        let entries = diff_snapshots(&prev, &new, new.taken_at);
        append_journal(entries);
    }
    // Always update the baseline (first run just stores it, no entries).
    save_last_snapshot(&new);
}

/// Start the journal: snapshot at launch, then re-snapshot once a day while
/// running. Cheap reads; never blocks the UI.
pub fn start() {
    thread::spawn(|| loop {
        snapshot_and_diff();
        thread::sleep(Duration::from_secs(24 * 60 * 60));
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snap() -> SystemSnapshot {
        SystemSnapshot {
            gpu_driver: Some("32.0.101.5768".into()),
            hotfixes: vec!["KB5044030".into()],
            startup_apps: vec!["Steam".into()],
            power_plan: Some("High performance".into()),
            mem_total_mb: Some(32768),
            refresh_hz: Some(144),
            windows_build: Some("23H2 (22631)".into()),
            taken_at: 0,
        }
    }

    #[test]
    fn no_changes_yields_no_entries() {
        assert!(diff_snapshots(&snap(), &snap(), 100).is_empty());
    }

    #[test]
    fn detects_driver_update_with_rollback_action() {
        let mut new = snap();
        new.gpu_driver = Some("32.0.101.5990".into());
        let d = diff_snapshots(&snap(), &new, 100);
        assert_eq!(d.len(), 1);
        assert_eq!(d[0].kind, "driver");
        assert!(d[0].summary.contains("5768 → 32.0.101.5990"));
        assert_eq!(d[0].action.as_deref(), Some("driver_rollback"));
    }

    #[test]
    fn detects_new_windows_update_and_new_startup_app() {
        let mut new = snap();
        new.hotfixes.push("KB5050000".into());
        new.startup_apps.push("OneDrive".into());
        let d = diff_snapshots(&snap(), &new, 100);
        assert!(d.iter().any(|e| e.kind == "windows_update" && e.summary.contains("KB5050000")));
        assert!(d.iter().any(|e| e.kind == "startup" && e.summary.contains("OneDrive") && e.action.as_deref() == Some("health_scan")));
    }

    #[test]
    fn detects_power_plan_and_refresh_downgrade() {
        let mut new = snap();
        new.power_plan = Some("Balanced".into());
        new.refresh_hz = Some(60);
        let d = diff_snapshots(&snap(), &new, 100);
        assert!(d.iter().any(|e| e.kind == "power_plan" && e.action.as_deref() == Some("power_high_perf")));
        // Refresh dropped 144→60 → offer the max-refresh fix.
        assert!(d.iter().any(|e| e.kind == "refresh" && e.action.as_deref() == Some("max_refresh_rate")));
    }

    #[test]
    fn ignores_tiny_ram_fluctuation_but_flags_real_change() {
        let mut same = snap();
        same.mem_total_mb = Some(32768 - 100); // reporting jitter
        assert!(diff_snapshots(&snap(), &same, 100).iter().all(|e| e.kind != "memory"));
        let mut more = snap();
        more.mem_total_mb = Some(65536); // real upgrade
        assert!(diff_snapshots(&snap(), &more, 100).iter().any(|e| e.kind == "memory"));
    }
}
