//! Hardware tier classifier — the foundation of the Game Settings Advisor.
//!
//! Registry/service tweaks cap out at a few % FPS. In-game graphics settings are
//! worth 30–200%, but the *right* setting depends entirely on the hardware. So we
//! classify the GPU into entry / mid / high / ultra (or integrated), read VRAM +
//! RAM, tier the CPU, and detect upscaler support (XeSS / DLSS / FSR). The
//! per-game advisor (see `game_settings`) then recommends real values per tier.
//!
//! The classifiers are pure and substring-based (tolerant of driver naming) and
//! fully unit-tested. An unrecognized GPU returns `Unknown` — the UI says so
//! honestly and falls back to conservative advice rather than guessing a tier.

use serde::Serialize;

use super::hardware_profiler::{get_hardware_profile, HardwareProfile};

#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum GpuTier {
    Integrated,
    Entry,
    Mid,
    High,
    Ultra,
    Unknown,
}

impl GpuTier {
    fn as_str(self) -> &'static str {
        match self {
            GpuTier::Integrated => "integrated",
            GpuTier::Entry => "entry",
            GpuTier::Mid => "mid",
            GpuTier::High => "high",
            GpuTier::Ultra => "ultra",
            GpuTier::Unknown => "unknown",
        }
    }
}

#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum CpuTier {
    Entry,
    Mid,
    High,
    Unknown,
}

impl CpuTier {
    fn as_str(self) -> &'static str {
        match self {
            CpuTier::Entry => "entry",
            CpuTier::Mid => "mid",
            CpuTier::High => "high",
            CpuTier::Unknown => "unknown",
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HardwareTier {
    pub gpu_tier: String,
    pub gpu_model: String,
    pub gpu_vendor: String,
    /// True when we recognized the GPU family (drives an honest "unknown GPU" note).
    pub gpu_known: bool,
    pub vram_gb: Option<f32>,
    pub cpu_tier: String,
    pub cpu_name: String,
    pub cpu_cores: u32,
    pub ram_gb: f32,
    /// Supported upscalers, best-first for this GPU: subset of xess/dlss/fsr.
    pub upscalers: Vec<String>,
}

// ---- Pure classifiers (unit-tested) ----

/// Integrated graphics — Intel iGPUs (UHD/Iris Xe, Lunar Lake Arc 130V/140V) and
/// AMD APUs (Vega, Radeon 6xxM/7xxM, generic "Radeon Graphics").
fn is_integrated(n: &str) -> bool {
    n.contains("uhd")
        || n.contains("iris")
        || n.contains("hd graphics")
        || n.contains("vega")
        || n.contains("radeon graphics")
        || n.contains("radeon(tm) graphics")
        // AMD mobile APU iGPUs
        || n.contains("780m")
        || n.contains("760m")
        || n.contains("680m")
        || n.contains("660m")
        // Intel Lunar Lake / Meteor Lake Arc iGPUs
        || n.contains("140v")
        || n.contains("130v")
        || n.contains("arc graphics")
}

/// First matching tier from an ordered (tier, tokens) table. Tokens include the
/// vendor prefix ("rtx 4070", "rx 6700") so "570" can't match inside "5700".
fn match_tokens(n: &str, table: &[(GpuTier, &[&str])]) -> Option<GpuTier> {
    for (tier, tokens) in table {
        if tokens.iter().any(|t| n.contains(*t)) {
            return Some(*tier);
        }
    }
    None
}

fn classify_nvidia(n: &str) -> GpuTier {
    // Checked ultra→entry; a "Ti"/"Super" name still contains the base token.
    let table: &[(GpuTier, &[&str])] = &[
        (GpuTier::Ultra, &["rtx 5090", "rtx 5080", "rtx 4090", "rtx 4080", "rtx 3090", "titan"]),
        (GpuTier::High, &["rtx 5070", "rtx 4070", "rtx 3080", "rtx 3070 ti", "rtx 2080 ti"]),
        (
            GpuTier::Mid,
            &["rtx 5060", "rtx 4060", "rtx 3070", "rtx 3060", "rtx 2070", "rtx 2080", "rtx 2060", "gtx 1660", "gtx 1080", "gtx 1070"],
        ),
        (GpuTier::Entry, &["rtx 3050", "rtx 2050", "gtx 1650", "gtx 1630", "gtx 1060", "gtx 1050", "mx"]),
    ];
    match_tokens(n, table).unwrap_or(GpuTier::Unknown)
}

fn classify_amd(n: &str) -> GpuTier {
    let table: &[(GpuTier, &[&str])] = &[
        (GpuTier::Ultra, &["rx 7900 xtx", "rx 7900 xt", "rx 6950", "rx 6900"]),
        (GpuTier::High, &["rx 7800", "rx 7900 gre", "rx 6800", "rx 7700"]),
        (GpuTier::Mid, &["rx 7600", "rx 6700", "rx 6650", "rx 6600", "rx 5700", "rx 5600"]),
        (
            GpuTier::Entry,
            &["rx 6500", "rx 6400", "rx 5500", "rx 5300", "rx 550", "rx 560", "rx 570", "rx 580", "rx 590"],
        ),
    ];
    match_tokens(n, table).unwrap_or(GpuTier::Unknown)
}

fn classify_arc(n: &str) -> GpuTier {
    let table: &[(GpuTier, &[&str])] = &[
        (GpuTier::Mid, &["arc a770", "arc a750", "arc a580", "arc b580", "arc b570"]),
        (GpuTier::Entry, &["arc a380", "arc a350", "arc a310"]),
    ];
    match_tokens(n, table).unwrap_or(GpuTier::Unknown)
}

/// Classify a GPU by name substring. Integrated checked first (iGPU names still
/// contain vendor tokens). Unknown discrete GPU → Unknown (never a guessed tier).
pub fn classify_gpu(raw: &str) -> GpuTier {
    let n = raw.to_lowercase();
    if is_integrated(&n) {
        return GpuTier::Integrated;
    }
    if n.contains("rtx") || n.contains("gtx") {
        return classify_nvidia(&n);
    }
    if n.contains("radeon") || n.contains("rx ") {
        return classify_amd(&n);
    }
    if n.contains("arc") {
        return classify_arc(&n);
    }
    GpuTier::Unknown
}

/// Tier a CPU from name + physical core count. 8+ cores or an i9/Ryzen 9/Ultra 9
/// → high; 4 or fewer / i3-class → entry; the 6-core i5/Ryzen 5 middle → mid.
pub fn classify_cpu(name: &str, cores: u32) -> CpuTier {
    let n = name.to_lowercase();
    if n.trim().is_empty() && cores == 0 {
        return CpuTier::Unknown;
    }
    let high_name = n.contains("i9")
        || n.contains("ryzen 9")
        || n.contains("threadripper")
        || n.contains("ultra 9")
        || n.contains("xeon");
    let entry_name = n.contains("i3")
        || n.contains("ryzen 3")
        || n.contains("pentium")
        || n.contains("celeron")
        || n.contains("athlon")
        || n.contains("atom");
    if high_name || cores >= 8 {
        CpuTier::High
    } else if entry_name || cores <= 4 {
        CpuTier::Entry
    } else {
        CpuTier::Mid
    }
}

/// Supported upscalers, best-first for this GPU. FSR runs on everything; DLSS is
/// RTX-only; XeSS is cross-vendor (DP4a) but native/best on Intel Arc — so on
/// Intel we list XeSS first, on RTX we list DLSS first.
pub fn upscalers_for(name: &str) -> Vec<String> {
    let n = name.to_lowercase();
    let intel = n.contains("intel") || n.contains("arc") || n.contains("iris") || n.contains("uhd");
    if n.contains("rtx") {
        // DLSS is the top pick on RTX; XeSS/FSR also work.
        vec!["dlss".into(), "xess".into(), "fsr".into()]
    } else if intel {
        // XeSS is native/best on Intel Arc; FSR as the universal fallback.
        vec!["xess".into(), "fsr".into()]
    } else {
        // AMD, older NVIDIA (GTX), or unknown — FSR is the safe first pick;
        // XeSS still runs via its DP4a path.
        vec!["fsr".into(), "xess".into()]
    }
}

// ---- Real gathering (read-only) ----

/// Best-effort dedicated-VRAM read from the display-adapter registry key
/// (`HardwareInformation.qwMemorySize`, a true 64-bit value unlike WMI's
/// 4GB-capped AdapterRAM). None if unreadable → the UI shows "—", never a guess.
fn read_vram_gb() -> Option<f32> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let class = hklm
        .open_subkey(r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}")
        .ok()?;
    let mut best: u64 = 0;
    for sub in class.enum_keys().flatten() {
        if let Ok(k) = class.open_subkey(&sub) {
            if let Ok(v) = k.get_value::<u64, _>("HardwareInformation.qwMemorySize") {
                best = best.max(v);
            }
        }
    }
    if best > 0 {
        Some((best as f32 / 1_073_741_824.0 * 10.0).round() / 10.0)
    } else {
        None
    }
}

/// Build the tier from a hardware profile + a VRAM reading. Split out so the
/// mapping is testable with a synthetic profile (no machine required).
pub fn tier_from(profile: &HardwareProfile, vram_gb: Option<f32>) -> HardwareTier {
    let gpu_tier = classify_gpu(&profile.gpu_name);
    let cpu_tier = classify_cpu(&profile.cpu_name, profile.cpu_cores);
    HardwareTier {
        gpu_tier: gpu_tier.as_str().to_string(),
        gpu_model: profile.gpu_name.clone(),
        gpu_vendor: profile.gpu_vendor.clone(),
        gpu_known: gpu_tier != GpuTier::Unknown,
        vram_gb,
        cpu_tier: cpu_tier.as_str().to_string(),
        cpu_name: profile.cpu_name.clone(),
        cpu_cores: profile.cpu_cores,
        ram_gb: (profile.ram_total_gb * 10.0).round() / 10.0,
        upscalers: upscalers_for(&profile.gpu_name),
    }
}

/// Tauri command — classify this machine's hardware for the Settings Advisor.
#[tauri::command]
pub fn get_hardware_tier() -> HardwareTier {
    tier_from(&get_hardware_profile(), read_vram_gb())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gpu_tiers_match_known_families() {
        assert_eq!(classify_gpu("NVIDIA GeForce RTX 4090"), GpuTier::Ultra);
        assert_eq!(classify_gpu("NVIDIA GeForce RTX 4070 Ti SUPER"), GpuTier::High);
        assert_eq!(classify_gpu("NVIDIA GeForce RTX 3060"), GpuTier::Mid);
        assert_eq!(classify_gpu("NVIDIA GeForce GTX 1650"), GpuTier::Entry);
        assert_eq!(classify_gpu("AMD Radeon RX 7900 XTX"), GpuTier::Ultra);
        assert_eq!(classify_gpu("AMD Radeon RX 6700 XT"), GpuTier::Mid);
        assert_eq!(classify_gpu("AMD Radeon RX 580"), GpuTier::Entry);
        assert_eq!(classify_gpu("Intel Arc A770"), GpuTier::Mid);
        assert_eq!(classify_gpu("Intel Arc B580"), GpuTier::Mid);
    }

    #[test]
    fn integrated_gpus_are_detected() {
        assert_eq!(classify_gpu("Intel Arc 140V"), GpuTier::Integrated);
        assert_eq!(classify_gpu("Intel Iris Xe Graphics"), GpuTier::Integrated);
        assert_eq!(classify_gpu("Intel UHD Graphics 770"), GpuTier::Integrated);
        assert_eq!(classify_gpu("AMD Radeon 780M Graphics"), GpuTier::Integrated);
        assert_eq!(classify_gpu("AMD Radeon(TM) Graphics"), GpuTier::Integrated);
    }

    #[test]
    fn rx570_is_not_confused_with_rx5700() {
        assert_eq!(classify_gpu("AMD Radeon RX 570"), GpuTier::Entry);
        assert_eq!(classify_gpu("AMD Radeon RX 5700 XT"), GpuTier::Mid);
    }

    #[test]
    fn unknown_gpu_is_honestly_unknown() {
        assert_eq!(classify_gpu("Some Future GPU 9999"), GpuTier::Unknown);
        assert_eq!(classify_gpu(""), GpuTier::Unknown);
    }

    #[test]
    fn cpu_tiers_from_name_and_cores() {
        assert_eq!(classify_cpu("Intel Core Ultra 7 258V", 8), CpuTier::High);
        assert_eq!(classify_cpu("AMD Ryzen 9 5900X", 12), CpuTier::High);
        assert_eq!(classify_cpu("Intel Core i5-12400", 6), CpuTier::Mid);
        assert_eq!(classify_cpu("AMD Ryzen 5 5600", 6), CpuTier::Mid);
        assert_eq!(classify_cpu("Intel Core i3-10100", 4), CpuTier::Entry);
        assert_eq!(classify_cpu("Intel Pentium Gold", 2), CpuTier::Entry);
        assert_eq!(classify_cpu("", 0), CpuTier::Unknown);
    }

    #[test]
    fn upscalers_are_vendor_correct() {
        // RTX: DLSS available and listed first.
        let rtx = upscalers_for("NVIDIA GeForce RTX 4070");
        assert_eq!(rtx.first().unwrap(), "dlss");
        assert!(rtx.contains(&"fsr".to_string()));
        // Intel Arc: XeSS first, never DLSS.
        let arc = upscalers_for("Intel Arc 140V");
        assert_eq!(arc.first().unwrap(), "xess");
        assert!(!arc.contains(&"dlss".to_string()));
        // AMD: FSR + XeSS(DP4a), never DLSS.
        let amd = upscalers_for("AMD Radeon RX 6700 XT");
        assert!(!amd.contains(&"dlss".to_string()));
        assert!(amd.contains(&"fsr".to_string()));
    }

    #[test]
    fn tier_from_maps_a_synthetic_profile() {
        let p = HardwareProfile {
            gpu_name: "Intel Arc 140V".into(),
            gpu_vendor: "Intel".into(),
            cpu_name: "Intel Core Ultra 7 258V".into(),
            cpu_cores: 8,
            ram_total_gb: 31.5,
            ..Default::default()
        };
        let t = tier_from(&p, Some(16.0));
        assert_eq!(t.gpu_tier, "integrated");
        assert_eq!(t.cpu_tier, "high");
        assert!(t.gpu_known);
        assert_eq!(t.upscalers.first().unwrap(), "xess");
    }
}
