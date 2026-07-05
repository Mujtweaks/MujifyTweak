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

use super::system_mutator::{RegHive, ServiceState, SystemMutator};

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

        // ---- Services ----
        "disable_sysmain" => vec![Op::DisableService { name: "SysMain" }],
        "disable_search_index" => vec![Op::DisableService { name: "WSearch" }],
        "disable_print_spooler" => vec![Op::DisableService { name: "Spooler" }],

        // ---- Network (registry) ----
        "network_throttling_index" => vec![dw(Hklm, MMCSS_PROFILE, "NetworkThrottlingIndex", 0xffff_ffff)],
        "flush_dns" => vec![Op::FlushDns],

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
        "disable_telemetry" => vec![dw(Hklm, r"SOFTWARE\Policies\Microsoft\Windows\DataCollection", "AllowTelemetry", 0)],
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
    fn most_catalog_tweaks_are_now_appliable() {
        // Sanity: the effective tweaks resolved to real ops.
        for id in [
            "disable_telemetry", "hags", "disable_gamedvr", "disable_fso", "mmcss_gaming",
            "win32_priority", "network_throttling_index", "disable_power_throttling",
            "disable_sysmain", "keyboard_delay", "disable_location",
        ] {
            assert!(is_appliable(id), "{id} should be appliable");
        }
    }
}
