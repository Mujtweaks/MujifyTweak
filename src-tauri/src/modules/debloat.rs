//! Debloat — list and remove preinstalled Microsoft Store (Appx) bloat.
//!
//! Read-only scan: `Get-AppxPackage` for the current user, cross-referenced with
//! a curated ALLOWLIST of genuinely-removable consumer apps. We NEVER offer
//! anything system-critical (no Store, no shell, no security, no runtimes) — the
//! allowlist is the safety boundary.
//!
//! Removal is honest: an Appx package can't be "restored to a captured value" —
//! it's reinstallable from the Microsoft Store, so it's labelled removable, not
//! reversible. Removal requires explicit confirmation and is logged.

use std::os::windows::process::CommandExt;
use std::process::Command;

use serde::Serialize;

use super::change_log::{self, ChangeLogEntry};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Curated allowlist: (appx-name substring, friendly name, category). Only these
/// are ever offered for removal — everything else is left alone. None of these
/// are required by Windows; all reinstall from the Store.
const KNOWN_BLOAT: &[(&str, &str, &str)] = &[
    ("Microsoft.BingNews", "Microsoft News", "News & Feeds"),
    ("Microsoft.BingWeather", "MSN Weather", "News & Feeds"),
    ("Microsoft.BingSearch", "Web Search", "News & Feeds"),
    ("Microsoft.GamingApp", "Xbox App", "Xbox"),
    ("Microsoft.XboxGamingOverlay", "Xbox Game Bar", "Xbox"),
    ("Microsoft.XboxGameOverlay", "Xbox Game Overlay", "Xbox"),
    ("Microsoft.XboxSpeechToTextOverlay", "Xbox Speech-to-Text", "Xbox"),
    ("Microsoft.Xbox.TCUI", "Xbox TCUI", "Xbox"),
    ("Microsoft.XboxIdentityProvider", "Xbox Identity Provider", "Xbox"),
    ("Microsoft.ZuneMusic", "Media Player (Groove)", "Media"),
    ("Microsoft.ZuneVideo", "Films & TV", "Media"),
    ("Clipchamp.Clipchamp", "Clipchamp", "Media"),
    ("Microsoft.MicrosoftSolitaireCollection", "Solitaire Collection", "Games"),
    ("Microsoft.People", "People", "Productivity"),
    ("Microsoft.windowscommunicationsapps", "Mail & Calendar", "Productivity"),
    ("Microsoft.MicrosoftOfficeHub", "Office Hub", "Productivity"),
    ("Microsoft.MicrosoftStickyNotes", "Sticky Notes", "Productivity"),
    ("Microsoft.Todos", "Microsoft To Do", "Productivity"),
    ("MicrosoftTeams", "Teams (personal)", "Communication"),
    ("MicrosoftCorporationII.QuickAssist", "Quick Assist", "Utilities"),
    ("Microsoft.Getstarted", "Get Started / Tips", "Utilities"),
    ("Microsoft.WindowsFeedbackHub", "Feedback Hub", "Utilities"),
    ("Microsoft.YourPhone", "Phone Link", "Utilities"),
    ("Microsoft.PowerAutomateDesktop", "Power Automate", "Utilities"),
    ("Microsoft.WindowsMaps", "Maps", "Utilities"),
    ("Microsoft.549981C3F5F10", "Cortana", "Utilities"),
];

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BloatApp {
    pub name: String,
    pub category: String,
    pub package_full_name: String,
    /// Always true — removable via Store reinstall (never a captured-state revert).
    pub reinstallable: bool,
}

/// Friendly name + category for an installed package name, if it's on the
/// allowlist. Pure — unit-tested without touching the system.
fn classify(pkg_name: &str) -> Option<(&'static str, &'static str)> {
    KNOWN_BLOAT
        .iter()
        .find(|(needle, _, _)| pkg_name.contains(needle))
        .map(|(_, friendly, category)| (*friendly, *category))
}

/// Read-only: installed Appx packages that are on the removable allowlist.
#[tauri::command]
pub fn scan_bloatware() -> Vec<BloatApp> {
    // One line per package: "<Name>|<PackageFullName>".
    let out = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Get-AppxPackage | ForEach-Object { \"$($_.Name)|$($_.PackageFullName)\" }",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    let Ok(out) = out else {
        return Vec::new();
    };
    let text = String::from_utf8_lossy(&out.stdout);
    let mut apps = Vec::new();
    for line in text.lines() {
        let mut parts = line.splitn(2, '|');
        let (Some(name), Some(pfn)) = (parts.next(), parts.next()) else {
            continue;
        };
        let (name, pfn) = (name.trim(), pfn.trim());
        if name.is_empty() || pfn.is_empty() {
            continue;
        }
        if let Some((friendly, category)) = classify(name) {
            if !apps.iter().any(|a: &BloatApp| a.name == friendly) {
                apps.push(BloatApp {
                    name: friendly.to_string(),
                    category: category.to_string(),
                    package_full_name: pfn.to_string(),
                    reinstallable: true,
                });
            }
        }
    }
    apps.sort_by(|a, b| a.category.cmp(&b.category).then(a.name.cmp(&b.name)));
    apps
}

/// Remove one allowlisted Appx package. `confirm` MUST be true. Refuses anything
/// not on the allowlist (defence in depth). Non-reversible (reinstall from the
/// Store); logged so it shows in the Change Log.
#[tauri::command]
pub fn remove_bloatware(
    app: tauri::AppHandle,
    friendly: String,
    package_full_name: String,
    confirm: bool,
) -> Result<(), String> {
    use tauri::Emitter;
    if !confirm {
        return Err("Refused: removal requires explicit confirmation.".into());
    }
    // Defence in depth: only ever remove a package whose short name maps to the
    // allowlist. The PackageFullName starts with the package name.
    if classify(&package_full_name).is_none() {
        return Err("Refused: this package is not on the removable allowlist.".into());
    }
    let status = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            &format!("Remove-AppxPackage -Package '{package_full_name}'"),
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!("Removing {friendly} failed."));
    }
    let entry = ChangeLogEntry {
        id: uuid::Uuid::new_v4().to_string(),
        timestamp: chrono::Utc::now().timestamp_millis(),
        tweak_id: format!("debloat:{friendly}"),
        description: format!("Removed bloatware: {friendly} (reinstallable from the Microsoft Store)"),
        risk_level: "safe".into(),
        reversible: false,
        undone: false,
        undo_ops: Vec::new(),
    };
    change_log::push(entry.clone());
    let _ = app.emit("change_log_update", &entry);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowlist_matches_known_bloat_only() {
        assert!(classify("Microsoft.BingNews").is_some());
        assert!(classify("Microsoft.GamingApp").is_some());
        // System-critical packages must NEVER classify as removable bloat.
        assert!(classify("Microsoft.WindowsStore").is_none());
        assert!(classify("Microsoft.Windows.ShellExperienceHost").is_none());
        assert!(classify("Microsoft.VCLibs.140.00").is_none());
        assert!(classify("Microsoft.SecHealthUI").is_none());
    }
}
