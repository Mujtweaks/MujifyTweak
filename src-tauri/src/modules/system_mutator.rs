//! The apply/rollback execution boundary.
//!
//! Every system-state change goes through the `SystemMutator` trait. Two impls:
//!   - `RealMutator`  — actually calls Windows (winreg / powercfg / ipconfig).
//!                      Only ever reached when the USER explicitly confirms an
//!                      apply in the UI. Never invoked by tests or by tooling.
//!   - `MockMutator`  — records calls and simulates state in memory. Touches
//!                      nothing. This is what `cargo test` exercises, so the
//!                      apply→log→rollback logic is proven without ever changing
//!                      the real machine.
//!
//! This split is what lets the engine be genuinely real *and* never run a tweak
//! on the user's laptop during development.

use std::cell::RefCell;
use std::collections::HashMap;
use std::os::windows::process::CommandExt;
use std::process::Command;

use serde::{Deserialize, Serialize};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
pub enum RegHive {
    Hkcu,
    Hklm,
}

/// A Windows service's start type + running state — enough to precisely restore.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct ServiceState {
    /// "boot" | "system" | "auto" | "demand" | "disabled"
    pub start_type: String,
    pub running: bool,
}

pub trait SystemMutator {
    fn active_power_plan_guid(&self) -> Option<String>;
    fn set_power_plan(&self, guid: &str) -> Result<(), String>;
    fn get_dword(&self, hive: RegHive, path: &str, name: &str) -> Option<u32>;
    fn set_dword(&self, hive: RegHive, path: &str, name: &str, val: u32) -> Result<(), String>;
    fn delete_value(&self, hive: RegHive, path: &str, name: &str) -> Result<(), String>;
    fn get_sz(&self, hive: RegHive, path: &str, name: &str) -> Option<String>;
    fn set_sz(&self, hive: RegHive, path: &str, name: &str, val: &str) -> Result<(), String>;
    fn flush_dns(&self) -> Result<(), String>;
    fn get_service(&self, name: &str) -> Option<ServiceState>;
    fn set_service(&self, name: &str, state: &ServiceState) -> Result<(), String>;
    /// Immediate child key names under `path` (used to fan a tweak across every
    /// network interface subkey). Empty if the key is missing.
    fn list_subkeys(&self, hive: RegHive, path: &str) -> Vec<String>;
    /// Create (if needed) and activate the hidden Ultimate Performance plan.
    /// Reversal is the ordinary power-plan restore (captured separately).
    fn activate_ultimate_plan(&self) -> Result<(), String>;
    fn get_memory_compression(&self) -> Option<bool>;
    fn set_memory_compression(&self, enabled: bool) -> Result<(), String>;
    /// Processor "core parking" minimum-cores percentage for the active scheme.
    fn get_core_parking_min(&self) -> Option<u32>;
    fn set_core_parking_min(&self, percent: u32) -> Result<(), String>;
    /// Fire-and-forget a one-shot repair command (used by the Fixes hub).
    fn run_command(&self, program: &str, args: &[&str]) -> Result<(), String>;
}

// ---- RealMutator ------------------------------------------------------------

pub struct RealMutator;

impl RealMutator {
    fn root(hive: RegHive) -> winreg::RegKey {
        use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
        use winreg::RegKey;
        match hive {
            RegHive::Hkcu => RegKey::predef(HKEY_CURRENT_USER),
            RegHive::Hklm => RegKey::predef(HKEY_LOCAL_MACHINE),
        }
    }
}

impl SystemMutator for RealMutator {
    fn active_power_plan_guid(&self) -> Option<String> {
        let out = Command::new("powercfg")
            .arg("/getactivescheme")
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&out.stdout);
        // "Power Scheme GUID: 381b4222-...  (Balanced)"
        let after = text.split("GUID:").nth(1)?;
        let guid = after.split_whitespace().next()?;
        Some(guid.to_string())
    }

    fn set_power_plan(&self, guid: &str) -> Result<(), String> {
        let status = Command::new("powercfg")
            .args(["/setactive", guid])
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("powercfg /setactive {guid} failed"))
        }
    }

    fn get_dword(&self, hive: RegHive, path: &str, name: &str) -> Option<u32> {
        Self::root(hive)
            .open_subkey(path)
            .ok()?
            .get_value::<u32, _>(name)
            .ok()
    }

    fn set_dword(&self, hive: RegHive, path: &str, name: &str, val: u32) -> Result<(), String> {
        let (key, _) = Self::root(hive)
            .create_subkey(path)
            .map_err(|e| e.to_string())?;
        key.set_value(name, &val).map_err(|e| e.to_string())
    }

    fn delete_value(&self, hive: RegHive, path: &str, name: &str) -> Result<(), String> {
        match Self::root(hive).open_subkey_with_flags(path, winreg::enums::KEY_ALL_ACCESS) {
            Ok(key) => key.delete_value(name).map_err(|e| e.to_string()),
            Err(_) => Ok(()), // key gone already → nothing to delete
        }
    }

    fn get_sz(&self, hive: RegHive, path: &str, name: &str) -> Option<String> {
        Self::root(hive)
            .open_subkey(path)
            .ok()?
            .get_value::<String, _>(name)
            .ok()
    }

    fn set_sz(&self, hive: RegHive, path: &str, name: &str, val: &str) -> Result<(), String> {
        let (key, _) = Self::root(hive)
            .create_subkey(path)
            .map_err(|e| e.to_string())?;
        key.set_value(name, &val.to_string())
            .map_err(|e| e.to_string())
    }

    fn flush_dns(&self) -> Result<(), String> {
        Command::new("ipconfig")
            .arg("/flushdns")
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map_err(|e| e.to_string())
            .map(|_| ())
    }

    fn get_service(&self, name: &str) -> Option<ServiceState> {
        // START_TYPE code from `sc qc` (locale-independent numeric): 2 auto,
        // 3 demand, 4 disabled, 0 boot, 1 system.
        let qc = Command::new("sc")
            .args(["qc", name])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()?;
        let qc_txt = String::from_utf8_lossy(&qc.stdout);
        let start_code = qc_txt
            .lines()
            .find(|l| l.contains("START_TYPE"))
            .and_then(|l| l.split(':').nth(1))
            .and_then(|r| r.split_whitespace().next())
            .and_then(|n| n.parse::<u32>().ok())?;
        let start_type = match start_code {
            0 => "boot",
            1 => "system",
            2 => "auto",
            3 => "demand",
            4 => "disabled",
            _ => "demand",
        }
        .to_string();

        // STATE code from `sc query`: 4 = RUNNING.
        let q = Command::new("sc")
            .args(["query", name])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()?;
        let q_txt = String::from_utf8_lossy(&q.stdout);
        let running = q_txt
            .lines()
            .find(|l| l.contains("STATE"))
            .map(|l| l.contains(" 4 ") || l.contains("RUNNING"))
            .unwrap_or(false);

        Some(ServiceState { start_type, running })
    }

    fn set_service(&self, name: &str, state: &ServiceState) -> Result<(), String> {
        // Set start type first, then reconcile the running state.
        let _ = Command::new("sc")
            .args(["config", name, "start=", &state.start_type])
            .creation_flags(CREATE_NO_WINDOW)
            .status();
        let action = if state.running { "start" } else { "stop" };
        let _ = Command::new("sc")
            .args([action, name])
            .creation_flags(CREATE_NO_WINDOW)
            .status();
        Ok(())
    }

    fn list_subkeys(&self, hive: RegHive, path: &str) -> Vec<String> {
        Self::root(hive)
            .open_subkey(path)
            .map(|k| k.enum_keys().filter_map(|r| r.ok()).collect())
            .unwrap_or_default()
    }

    fn activate_ultimate_plan(&self) -> Result<(), String> {
        // Well-known Ultimate Performance source GUID → a fixed destination GUID
        // so re-applying is idempotent. Duplicating an existing scheme errors
        // harmlessly; the activate is what matters.
        const ULT_SRC: &str = "e9a42b02-d5df-448d-aa00-03f14749eb61";
        const ULT_DST: &str = "99999999-8888-7777-6666-555555555555";
        let _ = Command::new("powercfg")
            .args(["-duplicatescheme", ULT_SRC, ULT_DST])
            .creation_flags(CREATE_NO_WINDOW)
            .status();
        let status = Command::new("powercfg")
            .args(["/setactive", ULT_DST])
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err("powercfg /setactive (ultimate) failed".into())
        }
    }

    fn get_memory_compression(&self) -> Option<bool> {
        let out = Command::new("powershell")
            .args(["-NoProfile", "-Command", "(Get-MMAgent).MemoryCompression"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()?;
        let s = String::from_utf8_lossy(&out.stdout).trim().to_lowercase();
        if s.contains("true") {
            Some(true)
        } else if s.contains("false") {
            Some(false)
        } else {
            None
        }
    }

    fn set_memory_compression(&self, enabled: bool) -> Result<(), String> {
        let cmd = if enabled {
            "Enable-MMAgent -mc"
        } else {
            "Disable-MMAgent -mc"
        };
        let status = Command::new("powershell")
            .args(["-NoProfile", "-Command", cmd])
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("{cmd} failed"))
        }
    }

    fn get_core_parking_min(&self) -> Option<u32> {
        // Processor sub-group + "Processor performance core parking min cores".
        let out = Command::new("powercfg")
            .args([
                "/q",
                "SCHEME_CURRENT",
                "SUB_PROCESSOR",
                "0cc5b647-c1df-4637-891a-dec35c318583",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()?;
        let txt = String::from_utf8_lossy(&out.stdout);
        let line = txt
            .lines()
            .find(|l| l.contains("Current AC Power Setting Index"))?;
        let hex = line.split(':').nth(1)?.trim().trim_start_matches("0x");
        u32::from_str_radix(hex, 16).ok()
    }

    fn set_core_parking_min(&self, percent: u32) -> Result<(), String> {
        const SUB: &str = "0cc5b647-c1df-4637-891a-dec35c318583";
        let p = percent.to_string();
        let _ = Command::new("powercfg")
            .args(["-setacvalueindex", "SCHEME_CURRENT", "SUB_PROCESSOR", SUB, &p])
            .creation_flags(CREATE_NO_WINDOW)
            .status();
        let _ = Command::new("powercfg")
            .args(["-setdcvalueindex", "SCHEME_CURRENT", "SUB_PROCESSOR", SUB, &p])
            .creation_flags(CREATE_NO_WINDOW)
            .status();
        let status = Command::new("powercfg")
            .args(["-setactive", "SCHEME_CURRENT"])
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err("powercfg -setactive failed".into())
        }
    }

    fn run_command(&self, program: &str, args: &[&str]) -> Result<(), String> {
        // Spawn (don't block) — some repairs (SFC/DISM) run for minutes; they
        // complete in the background after the ChangeLog entry is written.
        Command::new(program)
            .args(args)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map(|_child| ())
            .map_err(|e| format!("failed to start {program}: {e}"))
    }
}

// ---- MockMutator (tests only — touches nothing real) ------------------------

#[allow(dead_code)]
pub struct MockMutator {
    power_plan: RefCell<String>,
    regs: RefCell<HashMap<String, String>>,
    services: RefCell<HashMap<String, ServiceState>>,
    mem_compression: RefCell<Option<bool>>,
    core_parking_min: RefCell<Option<u32>>,
    pub calls: RefCell<Vec<String>>,
}

#[allow(dead_code)]
impl MockMutator {
    pub fn new() -> Self {
        MockMutator {
            power_plan: RefCell::new("BALANCED-GUID".into()),
            regs: RefCell::new(HashMap::new()),
            services: RefCell::new(HashMap::new()),
            mem_compression: RefCell::new(Some(true)),
            core_parking_min: RefCell::new(Some(5)),
            calls: RefCell::new(Vec::new()),
        }
    }

    pub fn with_dword(self, hive: RegHive, path: &str, name: &str, val: u32) -> Self {
        self.regs
            .borrow_mut()
            .insert(key_of(hive, path, name), val.to_string());
        self
    }

    pub fn with_service(self, name: &str, start_type: &str, running: bool) -> Self {
        self.services.borrow_mut().insert(
            name.to_string(),
            ServiceState { start_type: start_type.to_string(), running },
        );
        self
    }

    fn record(&self, s: String) {
        self.calls.borrow_mut().push(s);
    }
}

fn key_of(hive: RegHive, path: &str, name: &str) -> String {
    format!("{hive:?}|{path}|{name}")
}

impl SystemMutator for MockMutator {
    fn active_power_plan_guid(&self) -> Option<String> {
        Some(self.power_plan.borrow().clone())
    }
    fn set_power_plan(&self, guid: &str) -> Result<(), String> {
        self.record(format!("set_power_plan {guid}"));
        *self.power_plan.borrow_mut() = guid.to_string();
        Ok(())
    }
    fn get_dword(&self, hive: RegHive, path: &str, name: &str) -> Option<u32> {
        self.regs
            .borrow()
            .get(&key_of(hive, path, name))
            .and_then(|s| s.parse().ok())
    }
    fn set_dword(&self, hive: RegHive, path: &str, name: &str, val: u32) -> Result<(), String> {
        self.record(format!("set_dword {path}\\{name}={val}"));
        self.regs
            .borrow_mut()
            .insert(key_of(hive, path, name), val.to_string());
        Ok(())
    }
    fn delete_value(&self, hive: RegHive, path: &str, name: &str) -> Result<(), String> {
        self.record(format!("delete {path}\\{name}"));
        self.regs.borrow_mut().remove(&key_of(hive, path, name));
        Ok(())
    }
    fn get_sz(&self, hive: RegHive, path: &str, name: &str) -> Option<String> {
        self.regs.borrow().get(&key_of(hive, path, name)).cloned()
    }
    fn set_sz(&self, hive: RegHive, path: &str, name: &str, val: &str) -> Result<(), String> {
        self.record(format!("set_sz {path}\\{name}={val}"));
        self.regs
            .borrow_mut()
            .insert(key_of(hive, path, name), val.to_string());
        Ok(())
    }
    fn flush_dns(&self) -> Result<(), String> {
        self.record("flush_dns".into());
        Ok(())
    }
    fn get_service(&self, name: &str) -> Option<ServiceState> {
        self.services.borrow().get(name).cloned()
    }
    fn set_service(&self, name: &str, state: &ServiceState) -> Result<(), String> {
        self.record(format!("set_service {name} {}/{}", state.start_type, state.running));
        self.services.borrow_mut().insert(name.to_string(), state.clone());
        Ok(())
    }

    fn list_subkeys(&self, hive: RegHive, path: &str) -> Vec<String> {
        // Keys are stored as "{hive:?}|{path}|{name}"; return the distinct next
        // path segment under `path` (i.e. the immediate child key names).
        let hive_s = format!("{hive:?}");
        let want = format!("{path}\\");
        let mut set = std::collections::BTreeSet::new();
        for k in self.regs.borrow().keys() {
            let parts: Vec<&str> = k.splitn(3, '|').collect();
            if parts.len() == 3 && parts[0] == hive_s {
                if let Some(rest) = parts[1].strip_prefix(&want) {
                    if let Some(seg) = rest.split('\\').next() {
                        if !seg.is_empty() {
                            set.insert(seg.to_string());
                        }
                    }
                }
            }
        }
        set.into_iter().collect()
    }

    fn activate_ultimate_plan(&self) -> Result<(), String> {
        self.record("activate_ultimate_plan".into());
        *self.power_plan.borrow_mut() = "ULTIMATE-GUID".into();
        Ok(())
    }

    fn get_memory_compression(&self) -> Option<bool> {
        *self.mem_compression.borrow()
    }
    fn set_memory_compression(&self, enabled: bool) -> Result<(), String> {
        self.record(format!("set_memory_compression {enabled}"));
        *self.mem_compression.borrow_mut() = Some(enabled);
        Ok(())
    }

    fn get_core_parking_min(&self) -> Option<u32> {
        *self.core_parking_min.borrow()
    }
    fn set_core_parking_min(&self, percent: u32) -> Result<(), String> {
        self.record(format!("set_core_parking_min {percent}"));
        *self.core_parking_min.borrow_mut() = Some(percent);
        Ok(())
    }

    fn run_command(&self, program: &str, args: &[&str]) -> Result<(), String> {
        self.record(format!("run_command {program} {}", args.join(" ")));
        Ok(())
    }
}
