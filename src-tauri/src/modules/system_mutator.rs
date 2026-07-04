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

pub trait SystemMutator {
    fn active_power_plan_guid(&self) -> Option<String>;
    fn set_power_plan(&self, guid: &str) -> Result<(), String>;
    fn get_dword(&self, hive: RegHive, path: &str, name: &str) -> Option<u32>;
    fn set_dword(&self, hive: RegHive, path: &str, name: &str, val: u32) -> Result<(), String>;
    fn delete_value(&self, hive: RegHive, path: &str, name: &str) -> Result<(), String>;
    fn get_sz(&self, hive: RegHive, path: &str, name: &str) -> Option<String>;
    fn set_sz(&self, hive: RegHive, path: &str, name: &str, val: &str) -> Result<(), String>;
    fn flush_dns(&self) -> Result<(), String>;
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
}

// ---- MockMutator (tests only — touches nothing real) ------------------------

#[allow(dead_code)]
pub struct MockMutator {
    power_plan: RefCell<String>,
    regs: RefCell<HashMap<String, String>>,
    pub calls: RefCell<Vec<String>>,
}

#[allow(dead_code)]
impl MockMutator {
    pub fn new() -> Self {
        MockMutator {
            power_plan: RefCell::new("BALANCED-GUID".into()),
            regs: RefCell::new(HashMap::new()),
            calls: RefCell::new(Vec::new()),
        }
    }

    pub fn with_dword(self, hive: RegHive, path: &str, name: &str, val: u32) -> Self {
        self.regs
            .borrow_mut()
            .insert(key_of(hive, path, name), val.to_string());
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
}
