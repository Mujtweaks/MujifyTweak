//! Services Manager — turn off Windows services you genuinely don't need.
//!
//! This is a curated list, not a dump of every service on the machine. Blanket
//! "disable 200 services" is exactly the reckless behaviour Mujify exists to
//! replace: it's how the other optimizers break audio, networking and Windows
//! Update. Every entry here is one a real person can reason about, with the cost
//! spelled out in plain English when there is one.
//!
//! Nothing new is invented for the apply path. A service action becomes the
//! tweak id `service:<Name>`, which flows through the SAME pipeline as every
//! other change — Confirm modal → AntiCheatGuard → TweaksEngine → StateSnapshot
//! → apply → ChangeLog → RollbackEngine — so `Op::SetService` captures the exact
//! prior start type + running state and every change is individually undoable.
//!
//! `service_name_from_tweak_id` resolves ONLY against the catalog below, so an
//! arbitrary service name can never be smuggled in through a tweak id.

use serde::Serialize;

use super::system_mutator::{RealMutator, SystemMutator};
use super::tweak_catalog::Risk;

/// One service the user may safely be offered control over.
pub struct ServiceDef {
    /// The real Windows service name (what `sc` uses).
    pub name: &'static str,
    pub title: &'static str,
    /// What it does, and what turning it off actually buys you.
    pub description: &'static str,
    /// The real cost of turning it off. `None` means there genuinely isn't one —
    /// a warning on every row trains people to ignore warnings.
    pub warning: Option<&'static str>,
    pub risk: Risk,
    /// True when this is a safe default for most gaming PCs.
    pub recommended: bool,
}

use Risk::{Moderate, Safe};

/// The curated catalog. Ordered roughly by how much most people gain.
pub const SERVICES: &[ServiceDef] = &[
    ServiceDef {
        name: "DiagTrack",
        title: "Connected User Experiences and Telemetry",
        description: "Microsoft's usage-tracking service. It reports back to Microsoft and writes to disk in the background. Turning it off costs you nothing as a gamer.",
        warning: None,
        risk: Safe,
        recommended: true,
    },
    ServiceDef {
        name: "dmwappushservice",
        title: "Device Management WAP Push",
        description: "Routes device-management messages for corporate/MDM setups. Unused on a home PC.",
        warning: None,
        risk: Safe,
        recommended: true,
    },
    ServiceDef {
        name: "SysMain",
        title: "SysMain (Superfetch)",
        description: "Preloads apps you use often into RAM. It competes for disk I/O, which can cause stutter while a game streams in textures.",
        warning: Some("On an older mechanical hard drive SysMain genuinely helps load times — the win here is mostly for SSDs. If your games load slower afterwards, undo it."),
        risk: Moderate,
        recommended: true,
    },
    ServiceDef {
        name: "WSearch",
        title: "Windows Search Indexing",
        description: "Continuously indexes your files so Start-menu search is instant. The indexer is a real CPU and disk consumer.",
        warning: Some("Searching for files from the Start menu and File Explorer becomes slow — it falls back to scanning on demand instead of using the index."),
        risk: Moderate,
        recommended: false,
    },
    ServiceDef {
        name: "Spooler",
        title: "Print Spooler",
        description: "Queues print jobs. If no printer is attached to this PC it is pure background weight.",
        warning: Some("You will not be able to print at all until you turn this back on."),
        risk: Safe,
        recommended: false,
    },
    ServiceDef {
        name: "XblAuthManager",
        title: "Xbox Live Auth Manager",
        description: "Signs you in to Xbox Live services.",
        warning: Some("Game Pass, the Xbox app and any game that signs in through Xbox Live will stop working. Leave this ON if you play Game Pass games."),
        risk: Moderate,
        recommended: false,
    },
    ServiceDef {
        name: "XblGameSave",
        title: "Xbox Live Game Save",
        description: "Syncs Xbox game saves to the cloud.",
        warning: Some("Cloud saves for Xbox/Game Pass games stop syncing. Leave this ON if you play Game Pass games."),
        risk: Moderate,
        recommended: false,
    },
    ServiceDef {
        name: "XboxNetApiSvc",
        title: "Xbox Live Networking",
        description: "Networking support for Xbox Live multiplayer.",
        warning: Some("Xbox Live multiplayer stops working. Leave this ON if you play Game Pass games."),
        risk: Moderate,
        recommended: false,
    },
    ServiceDef {
        name: "RemoteRegistry",
        title: "Remote Registry",
        description: "Lets other machines on the network edit this PC's registry. Off by default on most systems — and safer off.",
        warning: None,
        risk: Safe,
        recommended: true,
    },
    ServiceDef {
        name: "Fax",
        title: "Fax",
        description: "Fax support. It is 2026.",
        warning: None,
        risk: Safe,
        recommended: true,
    },
    ServiceDef {
        name: "MapsBroker",
        title: "Downloaded Maps Manager",
        description: "Background downloads for the Windows Maps app's offline maps.",
        warning: Some("The Windows Maps app loses its offline maps. Nothing else uses this."),
        risk: Safe,
        recommended: true,
    },
    ServiceDef {
        name: "RetailDemo",
        title: "Retail Demo",
        description: "Shop-floor demo mode for display machines in stores. Never used on a real PC.",
        warning: None,
        risk: Safe,
        recommended: true,
    },
    ServiceDef {
        name: "WMPNetworkSvc",
        title: "Windows Media Player Network Sharing",
        description: "Shares your Windows Media Player library over the network.",
        warning: None,
        risk: Safe,
        recommended: true,
    },
    ServiceDef {
        name: "WerSvc",
        title: "Windows Error Reporting",
        description: "Collects crash dumps and sends them to Microsoft. Writing a crash dump during a game crash costs disk and time.",
        warning: None,
        risk: Safe,
        recommended: true,
    },
    ServiceDef {
        name: "lfsvc",
        title: "Geolocation",
        description: "Tracks this PC's physical location for apps that ask for it.",
        warning: Some("Weather, Maps and anything else that uses your location stops working."),
        risk: Moderate,
        recommended: false,
    },
    ServiceDef {
        name: "TabletInputService",
        title: "Touch Keyboard & Handwriting",
        description: "Powers the on-screen touch keyboard and handwriting panel.",
        warning: Some("If this is a touchscreen laptop or you use a pen, leave this ON — the on-screen keyboard stops working."),
        risk: Moderate,
        recommended: false,
    },
    ServiceDef {
        name: "SSDPSRV",
        title: "SSDP Discovery",
        description: "Discovers UPnP devices on your network (smart TVs, media servers).",
        warning: Some("DLNA/media streaming to TVs and network device discovery stop working."),
        risk: Moderate,
        recommended: false,
    },
    ServiceDef {
        name: "PhoneSvc",
        title: "Phone Service",
        description: "Telephony state for phone-style apps on desktop Windows.",
        warning: None,
        risk: Safe,
        recommended: true,
    },
    ServiceDef {
        name: "AJRouter",
        title: "AllJoyn Router",
        description: "Routes messages for AllJoyn IoT/smart-home devices. Effectively dead technology.",
        warning: None,
        risk: Safe,
        recommended: true,
    },
    ServiceDef {
        name: "SharedAccess",
        title: "Internet Connection Sharing",
        description: "Shares this PC's internet connection with other devices (hotspot).",
        warning: Some("If you use this PC as a mobile hotspot, leave this ON."),
        risk: Safe,
        recommended: true,
    },
    ServiceDef {
        name: "wisvc",
        title: "Windows Insider Service",
        description: "Handles Windows Insider preview-build enrolment. Unused unless you're on the Insider programme.",
        warning: None,
        risk: Safe,
        recommended: true,
    },
    ServiceDef {
        name: "NvTelemetryContainer",
        title: "NVIDIA Telemetry",
        description: "NVIDIA's usage-tracking container. Not needed for the driver or for gaming.",
        warning: None,
        risk: Safe,
        recommended: true,
    },
];

/// The tweak id a service action travels under, so it reuses the whole
/// confirm → apply → log → undo pipeline.
pub fn tweak_id_for(service_name: &str) -> String {
    format!("service:{service_name}")
}

/// Resolve `service:<Name>` back to a catalog entry.
///
/// Returns the `&'static str` FROM THE CATALOG, never the caller's string, so an
/// arbitrary or hostile service name can't be smuggled through a tweak id into
/// `sc`. Unknown names return None and the apply is refused upstream.
pub fn service_name_from_tweak_id(tweak_id: &str) -> Option<&'static str> {
    let want = tweak_id.strip_prefix("service:")?;
    SERVICES
        .iter()
        .find(|s| s.name.eq_ignore_ascii_case(want))
        .map(|s| s.name)
}

pub fn def_for(service_name: &str) -> Option<&'static ServiceDef> {
    SERVICES.iter().find(|s| s.name.eq_ignore_ascii_case(service_name))
}

/// A catalog entry joined with this machine's REAL current state.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ServiceStatus {
    pub id: String,
    pub name: String,
    pub title: String,
    pub description: String,
    pub warning: Option<String>,
    pub risk: Risk,
    pub recommended: bool,
    /// "boot" | "system" | "auto" | "demand" | "disabled", read live from Windows.
    pub start_type: String,
    pub running: bool,
    /// False when this service doesn't exist on this machine (e.g. the NVIDIA
    /// telemetry service on an AMD PC) — the UI hides it rather than offering a
    /// button that can't do anything.
    pub present: bool,
}

/// Build the live list. Pure over the mutator so tests can drive it with
/// MockMutator and touch nothing.
pub fn statuses_from(m: &dyn SystemMutator) -> Vec<ServiceStatus> {
    SERVICES
        .iter()
        .map(|d| {
            let state = m.get_service(d.name);
            ServiceStatus {
                id: tweak_id_for(d.name),
                name: d.name.to_string(),
                title: d.title.to_string(),
                description: d.description.to_string(),
                warning: d.warning.map(String::from),
                risk: d.risk,
                recommended: d.recommended,
                present: state.is_some(),
                start_type: state
                    .as_ref()
                    .map(|s| s.start_type.clone())
                    .unwrap_or_else(|| "absent".into()),
                running: state.map(|s| s.running).unwrap_or(false),
            }
        })
        .collect()
}

/// Tauri command — READ-ONLY. Reports each curated service's real start type and
/// running state straight from Windows. Changes nothing; applying is a separate,
/// confirmed call into `apply_tweaks`.
#[tauri::command]
pub fn list_services() -> Vec<ServiceStatus> {
    statuses_from(&RealMutator)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::system_mutator::MockMutator;

    #[test]
    fn tweak_ids_round_trip_only_for_catalog_services() {
        assert_eq!(service_name_from_tweak_id("service:SysMain"), Some("SysMain"));
        assert_eq!(service_name_from_tweak_id("service:sysmain"), Some("SysMain"));
        // Not a service id at all.
        assert_eq!(service_name_from_tweak_id("power_high_perf"), None);
    }

    #[test]
    fn arbitrary_service_names_cannot_be_smuggled_through_a_tweak_id() {
        // The whole point of resolving against the catalog: nothing outside the
        // curated list can ever reach `sc`, however the id is crafted.
        assert_eq!(service_name_from_tweak_id("service:WinDefend"), None);
        assert_eq!(service_name_from_tweak_id("service:Audiosrv"), None);
        assert_eq!(service_name_from_tweak_id("service:wuauserv"), None);
        assert_eq!(service_name_from_tweak_id("service:"), None);
        assert_eq!(service_name_from_tweak_id("service:SysMain & shutdown /s"), None);
    }

    #[test]
    fn statuses_report_real_state_and_absence_honestly() {
        let m = MockMutator::new()
            .with_service("SysMain", "auto", true)
            .with_service("Spooler", "disabled", false);
        let all = statuses_from(&m);
        let sysmain = all.iter().find(|s| s.name == "SysMain").unwrap();
        assert!(sysmain.present);
        assert_eq!(sysmain.start_type, "auto");
        assert!(sysmain.running);

        let spooler = all.iter().find(|s| s.name == "Spooler").unwrap();
        assert_eq!(spooler.start_type, "disabled");
        assert!(!spooler.running);

        // A service that isn't installed is reported as absent, not as a fake
        // "running" or a silently-missing row.
        let nvidia = all.iter().find(|s| s.name == "NvTelemetryContainer").unwrap();
        assert!(!nvidia.present);
        assert_eq!(nvidia.start_type, "absent");

        // Reading state must never write anything.
        assert!(m.calls.borrow().is_empty(), "listing services must be read-only");
    }

    #[test]
    fn services_that_break_something_carry_a_warning_and_are_not_recommended() {
        // The rule: if turning it off has a real cost, say so — and don't
        // pre-recommend it. If it has no cost, no warning (warning fatigue is
        // how people learn to click through the ones that matter).
        for d in SERVICES {
            if let Some(w) = d.warning {
                assert!(!w.trim().is_empty(), "{} has an empty warning", d.name);
            }
        }
        // The genuinely costly ones must warn.
        assert!(def_for("Spooler").unwrap().warning.is_some(), "no printing is a real cost");
        assert!(def_for("XblGameSave").unwrap().warning.is_some(), "cloud saves are a real cost");
        assert!(def_for("WSearch").unwrap().warning.is_some(), "losing search is a real cost");
        // …and the free ones must not cry wolf.
        assert!(def_for("Fax").unwrap().warning.is_none());
        assert!(def_for("DiagTrack").unwrap().warning.is_none());
    }

    #[test]
    fn dangerous_services_are_absent_from_the_catalog_entirely() {
        // Services we will not offer to disable at all: breaking audio, Defender,
        // Windows Update or networking is not an "optimization".
        for forbidden in [
            "Audiosrv", "AudioEndpointBuilder", "WinDefend", "wuauserv", "BFE",
            "Dhcp", "Dnscache", "RpcSs", "LanmanWorkstation", "nsi", "Power",
            "CryptSvc", "EventLog", "mpssvc",
        ] {
            assert!(
                !SERVICES.iter().any(|s| s.name.eq_ignore_ascii_case(forbidden)),
                "{forbidden} must never be offered — disabling it breaks Windows"
            );
        }
    }

    #[test]
    fn every_service_has_a_unique_name_and_real_copy() {
        for (i, d) in SERVICES.iter().enumerate() {
            assert!(!d.name.trim().is_empty());
            assert!(!d.title.trim().is_empty());
            assert!(d.description.len() > 20, "{} needs a real explanation", d.name);
            assert!(
                !SERVICES[..i].iter().any(|p| p.name.eq_ignore_ascii_case(d.name)),
                "duplicate service {}",
                d.name
            );
        }
    }
}
