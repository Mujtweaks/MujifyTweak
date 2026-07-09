//! Concrete, reversible operations behind each tweak.
//!
//! A tweak is a list of `Op`s. Applying an Op first CAPTURES the current value
//! (producing an `UndoOp`), then writes the new value. Rollback replays the
//! `UndoOp`s in reverse. This is what makes "one-click Revert All" restore the
//! exact pre-tweak state rather than a generic default.
//!
//! All logic here is written against the `SystemMutator` trait, so it is fully
//! exercised by `MockMutator` in tests without touching the real system. The
//! effective tweaks below are real, well-known, reversible Windows optimizations
//! (registry values, the MMCSS games profile, network throttling, power
//! throttling, and a few services) — no injection, no driver hooks.

use serde::{Deserialize, Serialize};

use super::system_mutator::{DisplayMode, RegHive, ServiceState, SystemMutator};

/// Windows "High performance" power scheme — a well-known fixed GUID.
pub const HIGH_PERF_GUID: &str = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c";

use RegHive::{Hkcu, Hklm};

#[derive(Clone)]
pub enum Op {
    PowerPlan { guid: &'static str },
    Dword { hive: RegHive, path: &'static str, name: &'static str, value: u32 },
    Sz { hive: RegHive, path: &'static str, name: &'static str, value: &'static str },
    /// Disable a Windows service (stop + set start type to disabled).
    DisableService { name: &'static str },
    FlushDns,
    /// Write a DWORD to every network-interface subkey (per-NIC TCP tuning).
    DwordAllInterfaces { name: &'static str, value: u32 },
    /// Write an SZ to every network-interface subkey (e.g. a custom DNS server).
    SzAllInterfaces { name: &'static str, value: &'static str },
    /// Create + activate the hidden Ultimate Performance power plan.
    UltimatePlan,
    /// Toggle Windows memory (RAM) compression via MMAgent.
    MemoryCompression { enable: bool },
    /// Set the processor core-parking minimum-cores percent (100 = no parking).
    CoreParking { min_percent: u32 },
    /// Run a one-shot repair command, fire-and-forget (Fixes hub). No undo.
    Command { program: &'static str, args: &'static [&'static str] },
    /// Set a service's start type + running state, capturing prior for revert.
    SetService { name: &'static str, start_type: &'static str, running: bool },
    /// Raise the primary display to its highest refresh at the current
    /// resolution, capturing the prior mode for an exact revert.
    MaxRefreshRate,
    /// Byte-for-byte replace a file's contents, capturing the exact prior bytes
    /// (or absence) for a perfect revert. FOUNDATION ONLY — the future
    /// auto-apply-game-settings phase will use this; no tweak/fix references it
    /// yet, so `ops_for`/`fix_ops` never produce it.
    FileEdit { path: String, content: Vec<u8> },
}

/// Captured before-state, enough to precisely reverse one Op.
#[derive(Serialize, Deserialize, Clone)]
#[serde(tag = "kind")]
pub enum UndoOp {
    PowerPlan { guid: String },
    Dword { hive: RegHive, path: String, name: String, prev: Option<u32> },
    Sz { hive: RegHive, path: String, name: String, prev: Option<String> },
    Service { name: String, prev: Option<ServiceState> },
    None,
    /// Per-interface DWORD writes, each with its own captured prior value.
    DwordMulti { hive: RegHive, name: String, entries: Vec<(String, Option<u32>)> },
    /// Per-interface SZ writes, each with its own captured prior value.
    SzMulti { hive: RegHive, name: String, entries: Vec<(String, Option<String>)> },
    MemoryCompression { prev: Option<bool> },
    CoreParking { prev: Option<u32> },
    /// Prior display mode, restored exactly on undo (None → leave as-is).
    DisplayMode { prev: Option<DisplayMode> },
    /// Prior file bytes (None → the file didn't exist, so undo deletes it).
    File { path: String, prev: Option<Vec<u8>> },
}

/// Capture + apply one Op. Returns the UndoOp needed to reverse it.
pub fn apply_op(m: &dyn SystemMutator, op: &Op) -> Result<UndoOp, String> {
    match op {
        Op::PowerPlan { guid } => {
            let prev = m.active_power_plan_guid().unwrap_or_default();
            m.set_power_plan(guid)?;
            Ok(UndoOp::PowerPlan { guid: prev })
        }
        Op::Dword { hive, path, name, value } => {
            let prev = m.get_dword(*hive, path, name);
            m.set_dword(*hive, path, name, *value)?;
            Ok(UndoOp::Dword { hive: *hive, path: path.to_string(), name: name.to_string(), prev })
        }
        Op::Sz { hive, path, name, value } => {
            let prev = m.get_sz(*hive, path, name);
            m.set_sz(*hive, path, name, value)?;
            Ok(UndoOp::Sz { hive: *hive, path: path.to_string(), name: name.to_string(), prev })
        }
        Op::DisableService { name } => {
            let prev = m.get_service(name);
            m.set_service(name, &ServiceState { start_type: "disabled".into(), running: false })?;
            Ok(UndoOp::Service { name: name.to_string(), prev })
        }
        Op::FlushDns => {
            m.flush_dns()?;
            Ok(UndoOp::None) // transient cache; nothing to restore
        }
        Op::DwordAllInterfaces { name, value } => {
            let mut entries = Vec::new();
            for sub in m.list_subkeys(Hklm, TCP_INTERFACES) {
                let path = format!("{TCP_INTERFACES}\\{sub}");
                let prev = m.get_dword(Hklm, &path, name);
                m.set_dword(Hklm, &path, name, *value)?;
                entries.push((path, prev));
            }
            Ok(UndoOp::DwordMulti { hive: Hklm, name: name.to_string(), entries })
        }
        Op::SzAllInterfaces { name, value } => {
            let mut entries = Vec::new();
            for sub in m.list_subkeys(Hklm, TCP_INTERFACES) {
                let path = format!("{TCP_INTERFACES}\\{sub}");
                let prev = m.get_sz(Hklm, &path, name);
                m.set_sz(Hklm, &path, name, value)?;
                entries.push((path, prev));
            }
            Ok(UndoOp::SzMulti { hive: Hklm, name: name.to_string(), entries })
        }
        Op::UltimatePlan => {
            let prev = m.active_power_plan_guid().unwrap_or_default();
            m.activate_ultimate_plan()?;
            Ok(UndoOp::PowerPlan { guid: prev })
        }
        Op::MemoryCompression { enable } => {
            let prev = m.get_memory_compression();
            m.set_memory_compression(*enable)?;
            Ok(UndoOp::MemoryCompression { prev })
        }
        Op::CoreParking { min_percent } => {
            let prev = m.get_core_parking_min();
            m.set_core_parking_min(*min_percent)?;
            Ok(UndoOp::CoreParking { prev })
        }
        Op::Command { program, args } => {
            m.run_command(program, args)?;
            Ok(UndoOp::None)
        }
        Op::SetService { name, start_type, running } => {
            let prev = m.get_service(name);
            m.set_service(
                name,
                &ServiceState { start_type: start_type.to_string(), running: *running },
            )?;
            Ok(UndoOp::Service { name: name.to_string(), prev })
        }
        Op::MaxRefreshRate => {
            let prev = m.current_display_mode();
            // Only change the mode if a higher refresh is actually available at
            // the current resolution — otherwise it's a captured no-op.
            if let (Some(cur), Some(max_hz)) = (prev, m.max_refresh_for_current_mode()) {
                if max_hz > cur.refresh_hz {
                    m.set_display_mode(DisplayMode { refresh_hz: max_hz, ..cur })?;
                }
            }
            Ok(UndoOp::DisplayMode { prev })
        }
        Op::FileEdit { path, content } => {
            let prev = m.read_file(path);
            m.write_file(path, content)?;
            Ok(UndoOp::File { path: path.clone(), prev })
        }
    }
}

/// Reverse one previously-applied Op from its captured UndoOp.
pub fn undo_op(m: &dyn SystemMutator, undo: &UndoOp) -> Result<(), String> {
    match undo {
        UndoOp::PowerPlan { guid } => {
            if !guid.is_empty() {
                m.set_power_plan(guid)?;
            }
            Ok(())
        }
        UndoOp::Dword { hive, path, name, prev } => match prev {
            Some(v) => m.set_dword(*hive, path, name, *v),
            None => m.delete_value(*hive, path, name),
        },
        UndoOp::Sz { hive, path, name, prev } => match prev {
            Some(v) => m.set_sz(*hive, path, name, v),
            None => m.delete_value(*hive, path, name),
        },
        UndoOp::Service { name, prev } => match prev {
            Some(s) => m.set_service(name, s),
            None => Ok(()),
        },
        UndoOp::DwordMulti { hive, name, entries } => {
            for (path, prev) in entries {
                match prev {
                    Some(v) => m.set_dword(*hive, path, name, *v)?,
                    None => m.delete_value(*hive, path, name)?,
                }
            }
            Ok(())
        }
        UndoOp::SzMulti { hive, name, entries } => {
            for (path, prev) in entries {
                match prev {
                    Some(v) => m.set_sz(*hive, path, name, v)?,
                    None => m.delete_value(*hive, path, name)?,
                }
            }
            Ok(())
        }
        UndoOp::MemoryCompression { prev } => match prev {
            Some(v) => m.set_memory_compression(*v),
            None => Ok(()),
        },
        UndoOp::CoreParking { prev } => match prev {
            Some(v) => m.set_core_parking_min(*v),
            None => Ok(()),
        },
        UndoOp::DisplayMode { prev } => match prev {
            Some(mode) => m.set_display_mode(*mode),
            None => Ok(()),
        },
        UndoOp::File { path, prev } => match prev {
            Some(bytes) => m.write_file(path, bytes),
            None => m.delete_file(path),
        },
        UndoOp::None => Ok(()),
    }
}

// Shorthands for readability in the catalog below.
fn dw(hive: RegHive, path: &'static str, name: &'static str, value: u32) -> Op {
    Op::Dword { hive, path, name, value }
}
fn sz(hive: RegHive, path: &'static str, name: &'static str, value: &'static str) -> Op {
    Op::Sz { hive, path, name, value }
}

const MMCSS_GAMES: &str =
    r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games";
const MMCSS_PROFILE: &str = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile";
const TCP_INTERFACES: &str = r"SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces";

/// The concrete op list for a tweak id. Unknown ids return empty (nothing runs).
/// Every op here is fully reversible via its captured UndoOp.
pub fn ops_for(tweak_id: &str) -> Vec<Op> {
    match tweak_id {
        // ---- System / performance (registry) ----
        "power_high_perf" => vec![Op::PowerPlan { guid: HIGH_PERF_GUID }],
        "disable_power_throttling" => vec![dw(Hklm, r"SYSTEM\CurrentControlSet\Control\Power\PowerThrottling", "PowerThrottlingOff", 1)],
        "win32_priority" => vec![dw(Hklm, r"SYSTEM\CurrentControlSet\Control\PriorityControl", "Win32PrioritySeparation", 38)],
        "large_system_cache" => vec![dw(Hklm, MMCSS_PROFILE, "SystemResponsiveness", 0)],
        "mmcss_gaming" => vec![
            dw(Hklm, MMCSS_GAMES, "GPU Priority", 8),
            dw(Hklm, MMCSS_GAMES, "Priority", 6),
            sz(Hklm, MMCSS_GAMES, "Scheduling Category", "High"),
            sz(Hklm, MMCSS_GAMES, "SFIO Priority", "High"),
        ],
        "gpu_priority" => vec![dw(Hklm, MMCSS_GAMES, "GPU Priority", 8)],
        "disable_tips" => vec![dw(Hkcu, r"Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager", "SubscribedContent-338389Enabled", 0)],
        "disable_hibernation" => vec![dw(Hklm, r"SYSTEM\CurrentControlSet\Control\Power", "HibernateEnabled", 0)],
        "power_ultimate" => vec![Op::UltimatePlan],
        "disable_memory_compression" => vec![Op::MemoryCompression { enable: false }],
        "disable_core_parking" => vec![Op::CoreParking { min_percent: 100 }],
        // Health-scan one-click fixes (also selectable as tweaks):
        "max_refresh_rate" => vec![Op::MaxRefreshRate],
        "disable_hvci" => vec![dw(
            Hklm,
            r"SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity",
            "Enabled",
            0,
        )],

        // ---- Services ----
        "disable_sysmain" => vec![Op::DisableService { name: "SysMain" }],
        "disable_search_index" => vec![Op::DisableService { name: "WSearch" }],
        "disable_print_spooler" => vec![Op::DisableService { name: "Spooler" }],

        // ---- Network (registry) ----
        "network_throttling_index" => vec![dw(Hklm, MMCSS_PROFILE, "NetworkThrottlingIndex", 0xffff_ffff)],
        "flush_dns" => vec![Op::FlushDns],
        "disable_nagle" => vec![Op::DwordAllInterfaces { name: "TCPNoDelay", value: 1 }],
        "tcp_ack_frequency" => vec![Op::DwordAllInterfaces { name: "TcpAckFrequency", value: 1 }],
        "network_qos" => vec![dw(Hklm, r"SOFTWARE\Policies\Microsoft\Windows\Psched", "NonBestEffortLimit", 0)],
        "tcp_optimize" => vec![dw(Hklm, r"SYSTEM\CurrentControlSet\Services\Tcpip\Parameters", "Tcp1323Opts", 1)],
        "dns_cloudflare" => vec![Op::SzAllInterfaces { name: "NameServer", value: "1.1.1.1,1.0.0.1" }],
        "disable_teredo" => vec![dw(Hklm, r"SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters", "DisabledComponents", 1)],

        // ---- Graphics ----
        "hags" => vec![dw(Hklm, r"SYSTEM\CurrentControlSet\Control\GraphicsDrivers", "HwSchMode", 2)],
        "disable_game_bar" => vec![
            dw(Hkcu, r"Software\Microsoft\GameBar", "AppCaptureEnabled", 0),
            dw(Hkcu, r"System\GameConfigStore", "GameDVR_Enabled", 0),
        ],
        "disable_gamedvr" => vec![
            dw(Hkcu, r"System\GameConfigStore", "GameDVR_Enabled", 0),
            dw(Hklm, r"SOFTWARE\Policies\Microsoft\Windows\GameDVR", "AllowGameDVR", 0),
        ],
        "disable_fso" => vec![
            dw(Hkcu, r"System\GameConfigStore", "GameDVR_FSEBehaviorMode", 2),
            dw(Hkcu, r"System\GameConfigStore", "GameDVR_HonorUserFSEBehaviorMode", 1),
            dw(Hkcu, r"System\GameConfigStore", "GameDVR_DXGIHonorFSEWindowsCompatible", 1),
        ],

        // ---- Privacy ----
        "disable_telemetry" => vec![
            dw(Hklm, r"SOFTWARE\Policies\Microsoft\Windows\DataCollection", "AllowTelemetry", 0),
            Op::DisableService { name: "DiagTrack" },
            Op::DisableService { name: "dmwappushservice" },
        ],
        "disable_cortana" => vec![dw(Hklm, r"SOFTWARE\Policies\Microsoft\Windows\Windows Search", "AllowCortana", 0)],
        "disable_ad_id" => vec![dw(Hkcu, r"Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo", "Enabled", 0)],
        "disable_activity_history" => vec![
            dw(Hklm, r"SOFTWARE\Policies\Microsoft\Windows\System", "EnableActivityFeed", 0),
            dw(Hklm, r"SOFTWARE\Policies\Microsoft\Windows\System", "PublishUserActivities", 0),
            dw(Hklm, r"SOFTWARE\Policies\Microsoft\Windows\System", "UploadUserActivities", 0),
        ],
        "disable_location" => vec![sz(Hklm, r"SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\location", "Value", "Deny")],
        "disable_feedback" => vec![dw(Hkcu, r"Software\Microsoft\Siuf\Rules", "NumberOfSIUFInPeriod", 0)],

        // ---- Gaming / input ----
        "mouse_accel_off" => vec![
            sz(Hkcu, r"Control Panel\Mouse", "MouseSpeed", "0"),
            sz(Hkcu, r"Control Panel\Mouse", "MouseThreshold1", "0"),
            sz(Hkcu, r"Control Panel\Mouse", "MouseThreshold2", "0"),
        ],
        "keyboard_delay" => vec![
            sz(Hkcu, r"Control Panel\Keyboard", "KeyboardDelay", "0"),
            sz(Hkcu, r"Control Panel\Keyboard", "KeyboardSpeed", "31"),
        ],
        "disable_sticky_keys" => vec![sz(Hkcu, r"Control Panel\Accessibility\StickyKeys", "Flags", "506")],

        _ => Vec::new(),
    }
}

/// Whether an apply path exists for this tweak id yet (UI shows others as
/// scan-only, never as a fake "apply" button that does nothing).
pub fn is_appliable(tweak_id: &str) -> bool {
    !ops_for(tweak_id).is_empty()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::system_mutator::MockMutator;

    fn apply_all(m: &MockMutator, id: &str) -> Vec<UndoOp> {
        ops_for(id).iter().map(|op| apply_op(m, op).unwrap()).collect()
    }
    fn undo_all(m: &MockMutator, undos: &[UndoOp]) {
        for u in undos.iter().rev() {
            undo_op(m, u).unwrap();
        }
    }

    #[test]
    fn power_plan_applies_and_reverts_exactly() {
        let m = MockMutator::new();
        let undos = apply_all(&m, "power_high_perf");
        assert_eq!(m.active_power_plan_guid().unwrap(), HIGH_PERF_GUID);
        undo_all(&m, &undos);
        assert_eq!(m.active_power_plan_guid().unwrap(), "BALANCED-GUID");
    }

    #[test]
    fn dword_tweak_undo_deletes_values_that_did_not_exist() {
        let m = MockMutator::new();
        let undos = apply_all(&m, "network_throttling_index");
        assert_eq!(m.get_dword(Hklm, MMCSS_PROFILE, "NetworkThrottlingIndex"), Some(0xffff_ffff));
        undo_all(&m, &undos);
        assert_eq!(m.get_dword(Hklm, MMCSS_PROFILE, "NetworkThrottlingIndex"), None);
    }

    #[test]
    fn dword_tweak_undo_restores_prior_value() {
        // Win32PrioritySeparation already 2 → undo must put back 2, not delete.
        let m = MockMutator::new().with_dword(Hklm, r"SYSTEM\CurrentControlSet\Control\PriorityControl", "Win32PrioritySeparation", 2);
        let undos = apply_all(&m, "win32_priority");
        assert_eq!(m.get_dword(Hklm, r"SYSTEM\CurrentControlSet\Control\PriorityControl", "Win32PrioritySeparation"), Some(38));
        undo_all(&m, &undos);
        assert_eq!(m.get_dword(Hklm, r"SYSTEM\CurrentControlSet\Control\PriorityControl", "Win32PrioritySeparation"), Some(2));
    }

    #[test]
    fn mmcss_multi_op_fully_reverts() {
        let m = MockMutator::new();
        let undos = apply_all(&m, "mmcss_gaming");
        assert_eq!(m.get_dword(Hklm, MMCSS_GAMES, "GPU Priority"), Some(8));
        assert_eq!(m.get_sz(Hklm, MMCSS_GAMES, "Scheduling Category").as_deref(), Some("High"));
        undo_all(&m, &undos);
        assert_eq!(m.get_dword(Hklm, MMCSS_GAMES, "GPU Priority"), None);
        assert_eq!(m.get_sz(Hklm, MMCSS_GAMES, "Scheduling Category"), None);
    }

    #[test]
    fn service_disable_reverts_to_exact_prior_state() {
        // SysMain was auto + running → disable, then undo restores auto + running.
        let m = MockMutator::new().with_service("SysMain", "auto", true);
        let undos = apply_all(&m, "disable_sysmain");
        let now = m.get_service("SysMain").unwrap();
        assert_eq!(now.start_type, "disabled");
        assert!(!now.running);
        undo_all(&m, &undos);
        let restored = m.get_service("SysMain").unwrap();
        assert_eq!(restored.start_type, "auto");
        assert!(restored.running);
    }

    #[test]
    fn per_interface_nagle_applies_to_all_nics_and_reverts() {
        let base = r"SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces";
        let m = MockMutator::new()
            .with_dword(Hklm, &format!(r"{base}\IF-A"), "Seed", 1)
            .with_dword(Hklm, &format!(r"{base}\IF-B"), "Seed", 1);
        let undos = apply_all(&m, "disable_nagle");
        assert_eq!(m.get_dword(Hklm, &format!(r"{base}\IF-A"), "TCPNoDelay"), Some(1));
        assert_eq!(m.get_dword(Hklm, &format!(r"{base}\IF-B"), "TCPNoDelay"), Some(1));
        undo_all(&m, &undos);
        // Values didn't exist before → undo removes them from every interface.
        assert_eq!(m.get_dword(Hklm, &format!(r"{base}\IF-A"), "TCPNoDelay"), None);
        assert_eq!(m.get_dword(Hklm, &format!(r"{base}\IF-B"), "TCPNoDelay"), None);
    }

    #[test]
    fn per_interface_dns_applies_and_restores_prior_value() {
        let base = r"SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces";
        let m = MockMutator::new().with_dword(Hklm, &format!(r"{base}\IF-A"), "Seed", 1);
        m.set_sz(Hklm, &format!(r"{base}\IF-A"), "NameServer", "9.9.9.9").unwrap();
        let undos = apply_all(&m, "dns_cloudflare");
        assert_eq!(m.get_sz(Hklm, &format!(r"{base}\IF-A"), "NameServer").as_deref(), Some("1.1.1.1,1.0.0.1"));
        undo_all(&m, &undos);
        assert_eq!(m.get_sz(Hklm, &format!(r"{base}\IF-A"), "NameServer").as_deref(), Some("9.9.9.9"));
    }

    #[test]
    fn ultimate_plan_activates_and_restores_prior() {
        let m = MockMutator::new(); // starts at BALANCED-GUID
        let undos = apply_all(&m, "power_ultimate");
        assert_eq!(m.active_power_plan_guid().unwrap(), "ULTIMATE-GUID");
        undo_all(&m, &undos);
        assert_eq!(m.active_power_plan_guid().unwrap(), "BALANCED-GUID");
    }

    #[test]
    fn memory_compression_disables_and_reverts() {
        let m = MockMutator::new(); // compression defaults on
        let undos = apply_all(&m, "disable_memory_compression");
        assert_eq!(m.get_memory_compression(), Some(false));
        undo_all(&m, &undos);
        assert_eq!(m.get_memory_compression(), Some(true));
    }

    #[test]
    fn core_parking_maxes_and_reverts_to_prior() {
        let m = MockMutator::new(); // min-cores defaults to 5
        let undos = apply_all(&m, "disable_core_parking");
        assert_eq!(m.get_core_parking_min(), Some(100));
        undo_all(&m, &undos);
        assert_eq!(m.get_core_parking_min(), Some(5));
    }

    #[test]
    fn telemetry_tweak_now_disables_tracking_services() {
        let m = MockMutator::new()
            .with_service("DiagTrack", "auto", true)
            .with_service("dmwappushservice", "demand", true);
        let undos = apply_all(&m, "disable_telemetry");
        assert_eq!(m.get_service("DiagTrack").unwrap().start_type, "disabled");
        assert_eq!(m.get_service("dmwappushservice").unwrap().start_type, "disabled");
        undo_all(&m, &undos);
        assert_eq!(m.get_service("DiagTrack").unwrap().start_type, "auto");
        assert!(m.get_service("dmwappushservice").unwrap().running);
    }

    #[test]
    fn max_refresh_maxes_and_reverts_exactly() {
        // 1440p panel stuck at 60 Hz but capable of 144 → apply raises it, undo
        // restores the exact prior mode.
        let m = MockMutator::new().with_display(2560, 1440, 60, 144);
        let undos = apply_all(&m, "max_refresh_rate");
        let now = m.current_display_mode().unwrap();
        assert_eq!(now.refresh_hz, 144);
        assert_eq!((now.width, now.height), (2560, 1440));
        undo_all(&m, &undos);
        assert_eq!(m.current_display_mode().unwrap().refresh_hz, 60);
    }

    #[test]
    fn max_refresh_is_a_noop_when_already_maxed() {
        // Already at the panel max → nothing is written, nothing to restore.
        let m = MockMutator::new().with_display(1920, 1080, 144, 144);
        let undos = apply_all(&m, "max_refresh_rate");
        assert!(m.calls.borrow().iter().all(|c| !c.starts_with("set_display_mode")));
        undo_all(&m, &undos);
        assert_eq!(m.current_display_mode().unwrap().refresh_hz, 144);
    }

    #[test]
    fn hvci_disables_and_reverts_to_prior() {
        let path = r"SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity";
        let m = MockMutator::new().with_dword(Hklm, path, "Enabled", 1);
        let undos = apply_all(&m, "disable_hvci");
        assert_eq!(m.get_dword(Hklm, path, "Enabled"), Some(0));
        undo_all(&m, &undos);
        assert_eq!(m.get_dword(Hklm, path, "Enabled"), Some(1));
    }

    #[test]
    fn file_edit_restores_exact_prior_bytes() {
        // A file that existed → apply overwrites → undo restores byte-identical.
        let m = MockMutator::new().with_file("cfg.ini", b"Shadows=Epic\r\n");
        let op = Op::FileEdit { path: "cfg.ini".into(), content: b"Shadows=Low\r\n".to_vec() };
        let undo = apply_op(&m, &op).unwrap();
        assert_eq!(m.read_file("cfg.ini").unwrap(), b"Shadows=Low\r\n");
        undo_op(&m, &undo).unwrap();
        assert_eq!(m.read_file("cfg.ini").unwrap(), b"Shadows=Epic\r\n"); // exact bytes
    }

    #[test]
    fn file_edit_undo_deletes_a_file_that_did_not_exist() {
        // No prior file → apply creates it → undo removes it entirely.
        let m = MockMutator::new();
        let op = Op::FileEdit { path: "new.cfg".into(), content: b"x=1".to_vec() };
        let undo = apply_op(&m, &op).unwrap();
        assert_eq!(m.read_file("new.cfg").unwrap(), b"x=1");
        undo_op(&m, &undo).unwrap();
        assert!(m.read_file("new.cfg").is_none());
    }

    #[test]
    fn no_catalog_tweak_or_fix_uses_file_edit_yet() {
        // FOUNDATION ONLY: nothing may wire FileEdit until the auto-apply phase.
        for id in super::super::tweak_catalog::all_ids() {
            assert!(
                !ops_for(id).iter().any(|o| matches!(o, Op::FileEdit { .. })),
                "tweak '{id}' must not use FileEdit yet"
            );
        }
    }

    #[test]
    fn most_catalog_tweaks_are_now_appliable() {
        // Sanity: the effective tweaks resolved to real ops.
        for id in [
            "disable_telemetry", "hags", "disable_gamedvr", "disable_fso", "mmcss_gaming",
            "win32_priority", "network_throttling_index", "disable_power_throttling",
            "disable_sysmain", "keyboard_delay", "disable_location",
            // newly wired this session:
            "disable_hibernation", "power_ultimate", "disable_memory_compression",
            "disable_core_parking", "disable_nagle", "tcp_ack_frequency", "network_qos",
            "tcp_optimize", "dns_cloudflare", "disable_teredo",
        ] {
            assert!(is_appliable(id), "{id} should be appliable");
        }
    }
}
