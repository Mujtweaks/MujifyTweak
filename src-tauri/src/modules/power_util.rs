//! Active power plan lookup via `powercfg` — works unelevated (unlike the
//! `Win32_PowerPlan` WMI class, which needs admin). Shared by SystemMonitor and
//! the tweak scanner. The eventual PowerManager (apply side) will grow here too.

use std::os::windows::process::CommandExt;
use std::process::Command;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// e.g. "Power Scheme GUID: 381b4222-… (Balanced)" → "Balanced".
pub fn active_power_plan_name() -> Option<String> {
    let output = Command::new("powercfg")
        .arg("/getactivescheme")
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let start = text.rfind('(')?;
    let end = text.rfind(')')?;
    if end > start + 1 {
        Some(text[start + 1..end].trim().to_string())
    } else {
        None
    }
}
