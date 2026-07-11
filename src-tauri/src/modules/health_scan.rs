//! Bottleneck / Health Scan — read-only detection of real misconfigurations.
//!
//! This is the diagnosis layer: software tweaks cap out at a few % on a healthy
//! PC, but ONE bad setting (RAM at half its rated speed, a game on the iGPU,
//! Memory Integrity on) can quietly cost 30–60%. We detect what we can read
//! reliably, honestly label the rest "check manually / BIOS", and NEVER claim a
//! measured number here — the only real % lives in the before/after report.
//!
//! Detection is read-only. The registry checks go through the SystemMutator so
//! MockMutator can prove them; the pure classifiers are unit-tested with
//! synthetic inputs. Nothing here mutates the system.

use serde::Serialize;

use super::system_mutator::{RealMutator, RegHive, SystemMutator};
use super::{power_util, system_monitor, wmi_util};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HealthFinding {
    pub id: String,
    /// What's wrong, in plain English.
    pub title: String,
    /// The specifics — current vs expected.
    pub detail: String,
    /// "critical" | "warning" | "info".
    pub severity: String,
    /// Honest, ranged estimate — never a measured number.
    pub fps_cost: String,
    /// "one-click" | "bios" | "manual" | "detection-only".
    pub fixable: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SystemHealthReport {
    pub findings: Vec<HealthFinding>,
    pub scanned_at: i64,
    pub problems: usize,
}

/// Real data gathered from WMI/sysinfo/registry, passed to `build_report` so the
/// report logic is testable without a real machine.
#[derive(Default, Clone)]
pub struct HealthInputs {
    pub ram_current_mhz: Option<u32>,
    pub ram_rated_mhz: Option<u32>,
    pub refresh_current_hz: Option<u32>,
    pub refresh_max_hz: Option<u32>,
    pub gpu_driver_age_days: Option<i64>,
    pub power_plan: Option<String>,
    pub top_process: Option<(String, f32)>,
    pub game_name: Option<String>,
    pub game_free_pct: Option<f32>,
    pub has_discrete_gpu: bool,
    pub cpu_temp_c: Option<f32>,
}

fn finding(id: &str, title: &str, detail: &str, severity: &str, fps_cost: &str, fixable: &str) -> HealthFinding {
    HealthFinding {
        id: id.into(),
        title: title.into(),
        detail: detail.into(),
        severity: severity.into(),
        fps_cost: fps_cost.into(),
        fixable: fixable.into(),
    }
}

// ---- Pure classifiers (unit-tested) ----

fn classify_ram(i: &HealthInputs) -> Option<HealthFinding> {
    let (cur, rated) = (i.ram_current_mhz?, i.ram_rated_mhz?);
    if rated > 0 && cur > 0 && (cur as f32) < (rated as f32) * 0.95 {
        Some(finding(
            "ram_xmp",
            "RAM is running below its rated speed",
            &format!("Running at {cur} MHz but rated for {rated} MHz — XMP/EXPO is almost certainly off in BIOS."),
            "critical",
            "10-30% (RAM-sensitive games)",
            "bios",
        ))
    } else {
        None
    }
}

fn classify_refresh(i: &HealthInputs) -> Option<HealthFinding> {
    let (cur, max) = (i.refresh_current_hz?, i.refresh_max_hz?);
    if max > cur + 2 {
        Some(finding(
            "refresh_rate",
            "Monitor isn't at its highest refresh rate",
            &format!("Running at {cur} Hz but the panel supports {max} Hz — set it in Display settings → Advanced display."),
            "warning",
            "much smoother motion (not raw FPS)",
            "one-click",
        ))
    } else {
        None
    }
}

fn classify_power_plan(i: &HealthInputs) -> Option<HealthFinding> {
    let name = i.power_plan.as_deref()?.to_lowercase();
    if name.contains("power saver") || name.contains("power saving") {
        Some(finding(
            "power_plan",
            "Power plan is set to Power Saver",
            "Power Saver caps CPU/GPU clocks. High Performance keeps them from down-clocking during games.",
            "critical",
            "10-30%",
            "one-click",
        ))
    } else if name.contains("balanced") {
        Some(finding(
            "power_plan",
            "Power plan is Balanced (allows core parking / down-clocking)",
            "Balanced parks idle cores and down-clocks. High Performance avoids that during gameplay.",
            "warning",
            "3-10%",
            "one-click",
        ))
    } else {
        None
    }
}

fn classify_process_hog(i: &HealthInputs) -> Option<HealthFinding> {
    let (name, cpu) = i.top_process.as_ref()?;
    if *cpu >= 15.0 {
        Some(finding(
            "bg_process",
            &format!("'{name}' is using {:.0}% CPU in the background", cpu),
            "A single background app is taking a meaningful slice of your CPU. Close it before gaming (we name it — we don't blanket-kill).",
            "warning",
            "varies with how CPU-bound your game is",
            "manual",
        ))
    } else {
        None
    }
}

fn classify_driver_age(i: &HealthInputs) -> Option<HealthFinding> {
    let days = i.gpu_driver_age_days?;
    if days > 270 {
        Some(finding(
            "driver_age",
            "GPU driver looks old",
            &format!("Your GPU driver is about {} months old. Newer drivers often add game-specific optimizations.", days / 30),
            "warning",
            "varies (game-specific)",
            "manual",
        ))
    } else {
        None
    }
}

fn classify_disk(i: &HealthInputs) -> Option<HealthFinding> {
    let free = i.game_free_pct?;
    if free < 10.0 {
        let game = i.game_name.as_deref().unwrap_or("your game");
        Some(finding(
            "game_disk",
            &format!("{game}'s drive is nearly full"),
            &format!("The drive is only {free:.0}% free. A near-full drive causes stutter and long load times; free up space."),
            "warning",
            "stutter / long loads",
            "manual",
        ))
    } else {
        None
    }
}

fn classify_thermal(i: &HealthInputs) -> Option<HealthFinding> {
    let t = i.cpu_temp_c?;
    if t >= 90.0 {
        Some(finding(
            "thermal",
            "CPU is running very hot",
            &format!("CPU at {t:.0}°C — that's the thermal-throttling range under load. Check cooling, airflow and dust."),
            "critical",
            "10-40% under sustained load",
            "manual",
        ))
    } else {
        None
    }
}

fn classify_igpu(i: &HealthInputs) -> Option<HealthFinding> {
    if i.has_discrete_gpu {
        Some(finding(
            "igpu_preference",
            "You have a discrete GPU — make sure games use it",
            "This PC has both integrated and discrete graphics. In Windows Graphics settings, set each game to 'High performance' so it doesn't run on the slower integrated GPU.",
            "info",
            "up to ~50% if a game is stuck on the iGPU",
            "one-click",
        ))
    } else {
        None
    }
}

/// Registry check via the mutator (MockMutator-testable): Memory Integrity.
fn classify_vbs(m: &dyn SystemMutator) -> Option<HealthFinding> {
    let hvci = m.get_dword(
        RegHive::Hklm,
        r"SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity",
        "Enabled",
    );
    if hvci == Some(1) {
        Some(finding(
            "hvci",
            "Core Isolation / Memory Integrity is ON",
            "Memory Integrity (HVCI/VBS) virtualizes the kernel for security but costs gaming performance. Toggle it in Windows Security → Device Security → Core Isolation.",
            "warning",
            "5-10%",
            "manual",
        ))
    } else {
        None
    }
}

/// Build the report from real inputs + registry (via the mutator). Testable.
pub fn build_report(m: &dyn SystemMutator, inp: &HealthInputs) -> Vec<HealthFinding> {
    let mut f = Vec::new();
    for c in [
        classify_ram(inp),
        classify_refresh(inp),
        classify_power_plan(inp),
        classify_process_hog(inp),
        classify_driver_age(inp),
        classify_disk(inp),
        classify_thermal(inp),
        classify_igpu(inp),
        classify_vbs(m),
    ]
    .into_iter()
    .flatten()
    {
        f.push(c);
    }

    // Detection-only advisories — things Windows won't let us read reliably, so
    // we point the user at them honestly rather than guess a state.
    f.push(finding(
        "rebar",
        "Resizable BAR / SAM — check your BIOS",
        "Windows can't reliably report ReBAR state. In BIOS enable 'Above 4G Decoding' + 'Re-Size BAR Support' if your GPU supports it.",
        "info",
        "5-15% on supported GPUs",
        "bios",
    ));
    f.push(finding(
        "gpu_power_mode",
        "GPU driver power mode — set to maximum performance",
        "We can't read the NVIDIA/AMD control-panel power mode. Set it to 'Prefer maximum performance' for consistent clocks.",
        "info",
        "3-8%",
        "manual",
    ));
    f
}

// ---- Real data gathering (read-only) ----

fn gather_ram(conn: &wmi::WMIConnection) -> (Option<u32>, Option<u32>) {
    let rows = wmi_util::query(conn, "SELECT Speed, ConfiguredClockSpeed FROM Win32_PhysicalMemory");
    let mut rated = 0u32;
    let mut current = 0u32;
    for r in &rows {
        if let Some(s) = wmi_util::get_u64(r, "Speed") {
            rated = rated.max(s as u32);
        }
        if let Some(c) = wmi_util::get_u64(r, "ConfiguredClockSpeed") {
            current = current.max(c as u32);
        }
    }
    (
        if current > 0 { Some(current) } else { None },
        if rated > 0 { Some(rated) } else { None },
    )
}

fn is_virtual_gpu(name: &str) -> bool {
    let n = name.to_lowercase();
    n.contains("parsec")
        || n.contains("deskin")
        || n.contains("meta")
        || n.contains("virtual")
        || n.contains("basic display")
        || n.contains("remote")
}

fn parse_wmi_date_age_days(date: &str) -> Option<i64> {
    // CIM datetime looks like "20240115000000.000000-000" → yyyymmdd prefix.
    if date.len() < 8 {
        return None;
    }
    let y: i32 = date.get(0..4)?.parse().ok()?;
    let m: u32 = date.get(4..6)?.parse().ok()?;
    let d: u32 = date.get(6..8)?.parse().ok()?;
    let then = chrono::NaiveDate::from_ymd_opt(y, m, d)?;
    let today = chrono::Utc::now().date_naive();
    Some((today - then).num_days())
}

fn gather_gpu(conn: &wmi::WMIConnection) -> (Option<u32>, Option<u32>, Option<i64>, bool) {
    let rows = wmi_util::query(
        conn,
        "SELECT Name, CurrentRefreshRate, MaxRefreshRate, DriverDate FROM Win32_VideoController",
    );
    let mut cur_refresh = 0u32;
    let mut max_refresh = 0u32;
    let mut driver_age: Option<i64> = None;
    let mut physical_gpus = 0;
    for r in &rows {
        let name = wmi_util::get_string(r, "Name").unwrap_or_default();
        if name.is_empty() || is_virtual_gpu(&name) {
            continue;
        }
        physical_gpus += 1;
        if let Some(c) = wmi_util::get_u64(r, "CurrentRefreshRate") {
            cur_refresh = cur_refresh.max(c as u32);
        }
        if let Some(m) = wmi_util::get_u64(r, "MaxRefreshRate") {
            max_refresh = max_refresh.max(m as u32);
        }
        if driver_age.is_none() {
            if let Some(d) = wmi_util::get_string(r, "DriverDate") {
                driver_age = parse_wmi_date_age_days(&d);
            }
        }
    }
    (
        if cur_refresh > 0 { Some(cur_refresh) } else { None },
        if max_refresh > 0 { Some(max_refresh) } else { None },
        driver_age,
        physical_gpus >= 2,
    )
}

fn gather_top_process() -> Option<(String, f32)> {
    use sysinfo::{ProcessesToUpdate, System};
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    std::thread::sleep(std::time::Duration::from_millis(400));
    sys.refresh_processes(ProcessesToUpdate::All, true);
    let cores = sys.cpus().len().max(1) as f32;

    let mut best: Option<(String, f32)> = None;
    for p in sys.processes().values() {
        let name = p.name().to_string_lossy().to_string();
        let low = name.to_lowercase();
        // Skip the kernel/idle, ourselves, and the dev shells.
        if low.is_empty()
            || low.contains("system")
            || low == "idle"
            || low.starts_with("mujify-tweaks")
            || low == "node.exe"
        {
            continue;
        }
        let pct = p.cpu_usage() / cores; // normalise to a system-wide %
        if best.as_ref().map(|(_, c)| pct > *c).unwrap_or(true) {
            best = Some((name, pct));
        }
    }
    best
}

fn gather_game_free_pct(install_path: &str) -> Option<f32> {
    use sysinfo::Disks;
    let drive = install_path.get(0..3)?; // "C:\"
    let disks = Disks::new_with_refreshed_list();
    for d in disks.list() {
        let mount = d.mount_point().to_string_lossy();
        if mount.to_uppercase().starts_with(&drive.to_uppercase()) {
            let total = d.total_space();
            if total > 0 {
                return Some((d.available_space() as f32 / total as f32) * 100.0);
            }
        }
    }
    None
}

/// Read-only system health scan. `game_name`/`game_install_path` come from the
/// active game (frontend) so disk/GPU findings can be game-specific.
#[tauri::command]
pub fn scan_system_health(
    game_name: Option<String>,
    game_install_path: Option<String>,
) -> SystemHealthReport {
    let mut inp = HealthInputs::default();

    if let Some(conn) = wmi_util::connect() {
        let (ram_cur, ram_rated) = gather_ram(&conn);
        inp.ram_current_mhz = ram_cur;
        inp.ram_rated_mhz = ram_rated;
        let (cur_r, max_r, age, discrete) = gather_gpu(&conn);
        inp.refresh_current_hz = cur_r;
        inp.refresh_max_hz = max_r;
        inp.gpu_driver_age_days = age;
        inp.has_discrete_gpu = discrete;
    }
    inp.power_plan = power_util::active_power_plan_name();
    inp.top_process = gather_top_process();
    inp.cpu_temp_c = system_monitor::latest().and_then(|s| s.cpu_temp_c);
    inp.game_name = game_name;
    if let Some(path) = game_install_path.as_deref() {
        inp.game_free_pct = gather_game_free_pct(path);
    }

    let findings = build_report(&RealMutator, &inp);
    let problems = findings.iter().filter(|f| f.severity != "info").count();
    SystemHealthReport {
        findings,
        scanned_at: chrono::Utc::now().timestamp_millis(),
        problems,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::system_mutator::MockMutator;

    #[test]
    fn ram_below_rated_is_flagged_but_at_rated_is_not() {
        let mut i = HealthInputs {
            ram_current_mhz: Some(2133),
            ram_rated_mhz: Some(3200),
            ..Default::default()
        };
        assert!(classify_ram(&i).is_some());
        i.ram_current_mhz = Some(3200);
        assert!(classify_ram(&i).is_none());
    }

    #[test]
    fn refresh_below_max_is_flagged() {
        let mut i = HealthInputs {
            refresh_current_hz: Some(60),
            refresh_max_hz: Some(144),
            ..Default::default()
        };
        assert!(classify_refresh(&i).is_some());
        i.refresh_current_hz = Some(144);
        assert!(classify_refresh(&i).is_none());
    }

    #[test]
    fn power_plan_severity_matches_plan() {
        let mut i = HealthInputs {
            power_plan: Some("Power saver".into()),
            ..Default::default()
        };
        assert_eq!(classify_power_plan(&i).unwrap().severity, "critical");
        i.power_plan = Some("Balanced".into());
        assert_eq!(classify_power_plan(&i).unwrap().severity, "warning");
        i.power_plan = Some("High performance".into());
        assert!(classify_power_plan(&i).is_none());
    }

    #[test]
    fn memory_integrity_detected_via_registry() {
        let m = MockMutator::new().with_dword(
            RegHive::Hklm,
            r"SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity",
            "Enabled",
            1,
        );
        assert!(classify_vbs(&m).is_some());
        // Off / absent → no finding.
        assert!(classify_vbs(&MockMutator::new()).is_none());
    }

    #[test]
    fn build_report_always_includes_detection_only_advisories() {
        let ids: Vec<String> = build_report(&MockMutator::new(), &HealthInputs::default())
            .into_iter()
            .map(|f| f.id)
            .collect();
        assert!(ids.contains(&"rebar".to_string()));
        assert!(ids.contains(&"gpu_power_mode".to_string()));
    }

    #[test]
    fn wmi_date_parses_to_age() {
        // A date well in the past yields a positive age; garbage yields None.
        assert!(parse_wmi_date_age_days("20200101000000.000000-000").unwrap() > 1000);
        assert!(parse_wmi_date_age_days("nope").is_none());
    }
}
