//! Checkpoint 8 (scan half) — the real tweak catalog + read-only scanner.
//!
//! Defines every optimization Mujify offers, grouped into the six categories the
//! Optimizer UI shows, each carrying a real risk level. `scan_tweaks` READS the
//! current system (power plan, registry values, mouse params) to report which
//! tweaks are already applied vs. available — it applies NOTHING. The apply path
//! is deliberately not built in this pass: no tweak is executed on the machine.

use serde::Serialize;

#[derive(Serialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Risk {
    Safe,
    Moderate,
    Advanced,
}

#[derive(Serialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum Category {
    SystemPerformance,
    GraphicsDisplay,
    NetworkOptimization,
    WindowsServices,
    StorageOptimization,
    GameInput,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TweakInfo {
    pub id: String,
    pub title: String,
    pub description: String,
    pub category: Category,
    pub risk: Risk,
    /// True when the system is already in the optimized state (read live).
    pub applied: bool,
    /// False when this tweak can't run here (e.g. laptop-only guard).
    pub available: bool,
    /// True when a real, tested apply/undo path exists for this tweak. The UI
    /// shows scan-only tweaks without an apply control (never a fake button).
    pub appliable: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CategorySummary {
    pub category: Category,
    pub total: usize,
    pub applied: usize,
    pub available: usize,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub tweaks: Vec<TweakInfo>,
    pub categories: Vec<CategorySummary>,
    pub total: usize,
    pub applied: usize,
}

struct TweakDef {
    id: &'static str,
    title: &'static str,
    description: &'static str,
    category: Category,
    risk: Risk,
}

/// Lightweight catalog lookup used by TweaksEngine for description + risk.
pub struct TweakMeta {
    pub title: String,
    pub risk: Risk,
}

pub fn info_for(id: &str) -> Option<TweakMeta> {
    CATALOG.iter().find(|d| d.id == id).map(|d| TweakMeta {
        title: d.title.to_string(),
        risk: d.risk,
    })
}

/// The catalog. This is the source of truth for the Optimizer's category counts.
const CATALOG: &[TweakDef] = &[
    // ---- System Performance ----
    TweakDef { id: "power_high_perf", title: "High Performance power plan", description: "Prevents CPU/GPU frequency dips during play. Reverts on reboot anyway.", category: Category::SystemPerformance, risk: Risk::Safe },
    TweakDef { id: "power_ultimate", title: "Ultimate Performance power plan", description: "Disables CPU idle states for max responsiveness. More heat/power draw.", category: Category::SystemPerformance, risk: Risk::Moderate },
    TweakDef { id: "game_priority", title: "Above-normal game priority", description: "Gives the running game's threads scheduler preference.", category: Category::SystemPerformance, risk: Risk::Safe },
    TweakDef { id: "clear_standby", title: "Clear standby memory", description: "Frees cached standby memory back to the game.", category: Category::SystemPerformance, risk: Risk::Safe },
    TweakDef { id: "timer_resolution", title: "1 ms timer resolution", description: "Tightens the system timer for smoother frame pacing. Auto-reverts on exit.", category: Category::SystemPerformance, risk: Risk::Moderate },
    TweakDef { id: "cpu_affinity", title: "Performance-core affinity", description: "Pins the game to performance cores. Skipped on hybrid CPUs by default.", category: Category::SystemPerformance, risk: Risk::Advanced },

    // ---- Graphics & Display ----
    TweakDef { id: "gpu_low_latency", title: "GPU low-latency mode", description: "Enables the driver's low-latency render queue (NVIDIA/AMD).", category: Category::GraphicsDisplay, risk: Risk::Safe },
    TweakDef { id: "hags", title: "Hardware-accelerated GPU scheduling", description: "Lets the GPU manage its own memory scheduling on supported cards.", category: Category::GraphicsDisplay, risk: Risk::Moderate },
    TweakDef { id: "disable_game_bar", title: "Disable Xbox Game Bar", description: "Removes the DVR capture hook overhead.", category: Category::GraphicsDisplay, risk: Risk::Safe },
    TweakDef { id: "disable_gamedvr", title: "Disable background recording (GameDVR)", description: "Stops background frame capture that can cost FPS.", category: Category::GraphicsDisplay, risk: Risk::Safe },
    TweakDef { id: "fso_disable", title: "Disable fullscreen optimizations", description: "Forces true exclusive fullscreen for lower latency.", category: Category::GraphicsDisplay, risk: Risk::Moderate },

    // ---- Network Optimization ----
    TweakDef { id: "disable_nagle", title: "Disable Nagle's algorithm", description: "Sends small game packets immediately instead of batching them.", category: Category::NetworkOptimization, risk: Risk::Moderate },
    TweakDef { id: "network_qos", title: "QoS DSCP priority for game traffic", description: "Tags the active game's packets as high-priority (DSCP 46).", category: Category::NetworkOptimization, risk: Risk::Safe },
    TweakDef { id: "flush_dns", title: "Flush DNS cache", description: "Clears stale routing entries before an online session.", category: Category::NetworkOptimization, risk: Risk::Safe },
    TweakDef { id: "tcp_optimize", title: "TCP throughput tuning", description: "Tunes TCP autotuning/window scaling for gaming traffic.", category: Category::NetworkOptimization, risk: Risk::Moderate },

    // ---- Windows Services ----
    TweakDef { id: "svc_sysmain", title: "Pause SysMain (Superfetch)", description: "Stops background prefetching that competes for disk during play.", category: Category::WindowsServices, risk: Risk::Moderate },
    TweakDef { id: "svc_search", title: "Pause Windows Search indexing", description: "Halts indexing while gaming to free CPU and disk.", category: Category::WindowsServices, risk: Risk::Moderate },
    TweakDef { id: "svc_print", title: "Pause Print Spooler", description: "Stops an unused service if you don't print.", category: Category::WindowsServices, risk: Risk::Safe },
    TweakDef { id: "kill_bloat", title: "Close known background apps", description: "Ends user-selected background apps freeing RAM/CPU.", category: Category::WindowsServices, risk: Risk::Safe },

    // ---- Storage Optimization ----
    TweakDef { id: "clear_temp", title: "Clear temp files", description: "Deletes %TEMP% junk. Never touches game or user files.", category: Category::StorageOptimization, risk: Risk::Safe },
    TweakDef { id: "clear_shadercache", title: "Clear stale shader caches", description: "Removes old DirectX/NVIDIA/AMD shader cache.", category: Category::StorageOptimization, risk: Risk::Safe },
    TweakDef { id: "trim_ssd", title: "Run SSD TRIM", description: "Issues TRIM so the SSD keeps write performance up.", category: Category::StorageOptimization, risk: Risk::Safe },

    // ---- Game & Input ----
    TweakDef { id: "mouse_accel_off", title: "Disable mouse acceleration", description: "Makes cursor/aim movement 1:1 for consistent aim.", category: Category::GameInput, risk: Risk::Safe },
    TweakDef { id: "keyboard_delay", title: "Minimize keyboard repeat delay", description: "Sets the fastest keyboard repeat/response for input.", category: Category::GameInput, risk: Risk::Safe },
    TweakDef { id: "fps_cap", title: "Smart FPS cap", description: "Caps FPS just under refresh to reduce latency with sync on.", category: Category::GameInput, risk: Risk::Safe },
];

/// Read-only: is the active power plan already High/Ultimate Performance?
/// Uses powercfg (works unelevated).
fn high_perf_active() -> bool {
    super::power_util::active_power_plan_name()
        .map(|n| {
            let n = n.to_lowercase();
            n.contains("high performance") || n.contains("ultimate")
        })
        .unwrap_or(false)
}

/// Read-only: is Xbox Game Bar capture already disabled?
fn game_bar_disabled() -> bool {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\Microsoft\GameBar")
        .and_then(|k| k.get_value::<u32, _>("AppCaptureEnabled"))
        .map(|v| v == 0)
        .unwrap_or(false)
}

/// Read-only: is mouse acceleration already off? (MouseSpeed = "0")
fn mouse_accel_off() -> bool {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Control Panel\Mouse")
        .and_then(|k| k.get_value::<String, _>("MouseSpeed"))
        .map(|v| v.trim() == "0")
        .unwrap_or(false)
}

fn category_of(c: Category) -> Category {
    c
}

/// Scan current state and report per-tweak applied/available + category rollups.
/// Reads only — nothing is changed on the system.
#[tauri::command]
pub fn scan_tweaks(is_laptop: Option<bool>) -> ScanResult {
    let hp = high_perf_active();
    let gb = game_bar_disabled();
    let ma = mouse_accel_off();

    let tweaks: Vec<TweakInfo> = CATALOG
        .iter()
        .map(|d| {
            let applied = match d.id {
                "power_high_perf" | "power_ultimate" => hp,
                "disable_game_bar" | "disable_gamedvr" => gb,
                "mouse_accel_off" => ma,
                _ => false,
            };
            // Ultimate plan is unsafe on battery-powered laptops → mark unavailable.
            let available = !(d.id == "power_ultimate" && is_laptop == Some(true));
            TweakInfo {
                id: d.id.to_string(),
                title: d.title.to_string(),
                description: d.description.to_string(),
                category: category_of(d.category),
                risk: d.risk,
                applied,
                available,
                appliable: super::tweak_ops::is_appliable(d.id),
            }
        })
        .collect();

    let cats = [
        Category::SystemPerformance,
        Category::GraphicsDisplay,
        Category::NetworkOptimization,
        Category::WindowsServices,
        Category::StorageOptimization,
        Category::GameInput,
    ];
    let categories: Vec<CategorySummary> = cats
        .iter()
        .map(|&c| {
            let members: Vec<&TweakInfo> =
                tweaks.iter().filter(|t| t.category == c).collect();
            CategorySummary {
                category: c,
                total: members.len(),
                applied: members.iter().filter(|t| t.applied).count(),
                available: members.iter().filter(|t| t.available).count(),
            }
        })
        .collect();

    let applied = tweaks.iter().filter(|t| t.applied).count();
    let total = tweaks.len();
    ScanResult {
        tweaks,
        categories,
        total,
        applied,
    }
}
