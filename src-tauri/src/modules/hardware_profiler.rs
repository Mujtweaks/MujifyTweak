//! Checkpoint 2 — HardwareProfiler.
//!
//! Real CPU/GPU/RAM/storage/motherboard fingerprint via WMI + sysinfo. No value
//! here is invented — if a field can't be read it comes back `null` and the UI
//! shows "—". Cached after first read (specs don't change between launches).

use std::sync::Mutex;

use serde::Serialize;
use sysinfo::System;

use super::wmi_util::{connect, get_f64, get_string, get_u16_array, get_u64, query, query_ns};

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct HardwareProfile {
    pub cpu_name: String,
    pub cpu_cores: u32,
    pub cpu_threads: u32,
    pub cpu_base_clock_mhz: Option<u32>,
    pub gpu_name: String,
    pub gpu_vendor: String,
    pub gpu_driver_version: Option<String>,
    pub ram_total_gb: f32,
    pub ram_speed_mhz: Option<u32>,
    pub ram_type: Option<String>,
    pub storage_summary: String,
    pub storage_kind: Option<String>,
    pub motherboard: Option<String>,
    pub is_laptop: Option<bool>,
}

static CACHE: Mutex<Option<HardwareProfile>> = Mutex::new(None);

fn is_virtual_gpu(name: &str) -> bool {
    let n = name.to_lowercase();
    n.contains("virtual")
        || n.contains("parsec")
        || n.contains("deskin")
        || n.contains("remote")
        || n.contains("meta")
        || n.contains("basic display")
}

fn vendor_of(name: &str) -> String {
    let n = name.to_lowercase();
    if n.contains("nvidia") || n.contains("geforce") || n.contains("rtx") || n.contains("gtx") {
        "NVIDIA".into()
    } else if n.contains("radeon") || n.contains("amd") {
        "AMD".into()
    } else if n.contains("intel") || n.contains("arc") {
        "Intel".into()
    } else {
        "Unknown".into()
    }
}

fn smbios_ram_type(code: u64) -> Option<&'static str> {
    match code {
        20 => Some("DDR"),
        21 => Some("DDR2"),
        24 => Some("DDR3"),
        26 => Some("DDR4"),
        34 => Some("DDR5"),
        35 => Some("LPDDR5"),
        _ => None,
    }
}

fn build_profile() -> HardwareProfile {
    let mut p = HardwareProfile::default();

    // sysinfo — reliable core counts + CPU brand.
    let sys = System::new_all();
    if let Some(cpu) = sys.cpus().first() {
        p.cpu_name = cpu.brand().trim().to_string();
    }
    p.cpu_threads = sys.cpus().len() as u32;
    p.cpu_cores = System::physical_core_count().unwrap_or(sys.cpus().len()) as u32;
    p.ram_total_gb = sys.total_memory() as f32 / 1_073_741_824.0;

    let conn = match connect() {
        Some(c) => c,
        None => return p, // sysinfo-only fallback; still real data
    };

    // CPU extras
    for row in query(&conn, "SELECT Name, MaxClockSpeed FROM Win32_Processor") {
        if p.cpu_name.is_empty() {
            if let Some(name) = get_string(&row, "Name") {
                p.cpu_name = name;
            }
        }
        p.cpu_base_clock_mhz = get_u64(&row, "MaxClockSpeed").map(|v| v as u32);
        break;
    }

    // GPU — skip virtual display adapters (Parsec/DeskIn/etc), keep the real one.
    let gpus = query(
        &conn,
        "SELECT Name, DriverVersion FROM Win32_VideoController",
    );
    let real = gpus
        .iter()
        .filter_map(|r| get_string(r, "Name").map(|n| (r, n)))
        .find(|(_, n)| !is_virtual_gpu(n))
        .or_else(|| {
            gpus.iter()
                .filter_map(|r| get_string(r, "Name").map(|n| (r, n)))
                .next()
        });
    if let Some((row, name)) = real {
        p.gpu_vendor = vendor_of(&name);
        p.gpu_name = name;
        p.gpu_driver_version = get_string(row, "DriverVersion");
    }

    // RAM speed/type from the first populated module.
    let mut total_capacity: u64 = 0;
    for row in query(
        &conn,
        "SELECT Capacity, Speed, SMBIOSMemoryType FROM Win32_PhysicalMemory",
    ) {
        if let Some(cap) = get_u64(&row, "Capacity") {
            total_capacity += cap;
        }
        if p.ram_speed_mhz.is_none() {
            p.ram_speed_mhz = get_u64(&row, "Speed").map(|v| v as u32);
        }
        if p.ram_type.is_none() {
            p.ram_type = get_f64(&row, "SMBIOSMemoryType")
                .and_then(|c| smbios_ram_type(c as u64))
                .map(|s| s.to_string());
        }
    }
    if total_capacity > 0 {
        p.ram_total_gb = total_capacity as f32 / 1_073_741_824.0;
    }

    // Storage — prefer MSFT_PhysicalDisk (reliable SSD/HDD), fall back to Win32_DiskDrive.
    let disks = query_ns(
        "ROOT\\Microsoft\\Windows\\Storage",
        "SELECT FriendlyName, MediaType, Size FROM MSFT_PhysicalDisk",
    );
    if let Some(row) = disks.first() {
        let kind = match get_f64(row, "MediaType").map(|f| f as u64) {
            Some(3) => "HDD",
            Some(4) => "SSD",
            Some(5) => "SCM",
            _ => "Drive",
        };
        let size_gb = get_u64(row, "Size").unwrap_or(0) as f32 / 1_073_741_824.0;
        p.storage_kind = Some(kind.to_string());
        p.storage_summary = if size_gb >= 1000.0 {
            format!("{:.1}TB {}", size_gb / 1024.0, kind)
        } else if size_gb > 0.0 {
            format!("{:.0}GB {}", size_gb, kind)
        } else {
            get_string(row, "FriendlyName").unwrap_or_else(|| "Drive".into())
        };
    } else {
        for row in query(&conn, "SELECT Model, Size FROM Win32_DiskDrive") {
            let size_gb = get_u64(&row, "Size").unwrap_or(0) as f32 / 1_073_741_824.0;
            p.storage_summary = get_string(&row, "Model")
                .map(|m| {
                    if size_gb >= 1000.0 {
                        format!("{} · {:.1}TB", m, size_gb / 1024.0)
                    } else {
                        m
                    }
                })
                .unwrap_or_else(|| "Drive".into());
            break;
        }
    }

    // Motherboard
    for row in query(&conn, "SELECT Manufacturer, Product FROM Win32_BaseBoard") {
        let mfr = get_string(&row, "Manufacturer").unwrap_or_default();
        let prod = get_string(&row, "Product").unwrap_or_default();
        let combined = format!("{} {}", mfr, prod).trim().to_string();
        if !combined.is_empty() {
            p.motherboard = Some(combined);
        }
        break;
    }

    // Laptop vs desktop via chassis type (9/10/14 = portable/notebook/sub-notebook).
    for row in query(&conn, "SELECT ChassisTypes FROM Win32_SystemEnclosure") {
        let types = get_u16_array(&row, "ChassisTypes");
        if !types.is_empty() {
            p.is_laptop = Some(types.iter().any(|t| matches!(t, 8..=14 | 30 | 31 | 32)));
        }
        break;
    }

    p
}

/// Tauri command — cached full hardware profile.
#[tauri::command]
pub fn get_hardware_profile() -> HardwareProfile {
    let mut cache = CACHE.lock().unwrap();
    if let Some(p) = cache.as_ref() {
        return p.clone();
    }
    let profile = build_profile();
    *cache = Some(profile.clone());
    profile
}
