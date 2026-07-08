//! Checkpoint 8 (scan half) — the real tweak catalog + read-only scanner.
//!
//! Defines every optimization Mujify offers across the six user-facing
//! categories, each with a real risk level and a 1–5 impact rating. `scan_tweaks`
//! READS the current system (power plan, registry, mouse params) to report which
//! tweaks are already applied — it applies NOTHING. Only a handful have a tested
//! apply path today (see tweak_ops); the rest are shown scan-only, never a fake
//! button. All tweaks are free — there is no tier.

use serde::Serialize;

#[derive(Serialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Risk {
    Safe,
    Moderate,
    Advanced,
}

#[derive(Serialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Category {
    System,
    Performance,
    Network,
    Graphics,
    Privacy,
    Gaming,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TweakInfo {
    pub id: String,
    pub title: String,
    pub description: String,
    pub category: Category,
    pub risk: Risk,
    pub impact: u8, // 1–5
    pub applied: bool,
    pub available: bool,
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
    impact: u8,
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

use Category::*;
use Risk::*;

/// The full catalog. Source of truth for the Optimizer + Tweaks tabs.
const CATALOG: &[TweakDef] = &[
    // ---------- System ----------
    TweakDef { id: "power_high_perf", title: "High Performance Power Plan", description: "Switches Windows to the High Performance plan to prevent CPU/GPU frequency dips.", category: System, risk: Safe, impact: 4 },
    TweakDef { id: "power_ultimate", title: "Ultimate Performance Power Plan", description: "Enables the hidden Ultimate Performance plan — disables CPU idle states for max responsiveness.", category: System, risk: Moderate, impact: 5 },
    TweakDef { id: "disable_startup_apps", title: "Trim Startup Programs", description: "Disables non-essential apps that launch at boot to free RAM and speed up startup.", category: System, risk: Safe, impact: 3 },
    TweakDef { id: "disable_sysmain", title: "Disable SysMain (Superfetch)", description: "Stops background prefetching that competes for disk I/O during gameplay.", category: System, risk: Moderate, impact: 3 },
    TweakDef { id: "disable_search_index", title: "Disable Search Indexing", description: "Halts Windows Search indexing to free CPU and disk while gaming.", category: System, risk: Moderate, impact: 3 },
    TweakDef { id: "disable_print_spooler", title: "Disable Print Spooler", description: "Stops the print service if you don't print — one less background process.", category: System, risk: Safe, impact: 2 },
    TweakDef { id: "disable_tips", title: "Disable Windows Tips & Ads", description: "Turns off suggestion notifications and lock-screen tips.", category: System, risk: Safe, impact: 1 },
    TweakDef { id: "disable_hibernation", title: "Disable Hibernation", description: "Frees several GB of disk (hiberfil.sys) and removes hybrid-sleep overhead.", category: System, risk: Safe, impact: 2 },
    TweakDef { id: "clear_standby", title: "Clear Standby Memory", description: "Flushes the standby memory list back to the game when RAM runs low.", category: System, risk: Safe, impact: 3 },
    TweakDef { id: "disable_memory_compression", title: "Disable Memory Compression", description: "Reduces CPU overhead from compressing RAM pages on high-memory systems.", category: System, risk: Moderate, impact: 3 },

    // ---------- Performance ----------
    TweakDef { id: "disable_core_parking", title: "Disable CPU Core Parking", description: "Keeps all CPU cores active instead of parking idle ones — smoother frame pacing.", category: Performance, risk: Moderate, impact: 5 },
    TweakDef { id: "timer_resolution", title: "Timer Resolution Optimization", description: "Locks the system timer to 1 ms for smoother frames and lower input latency.", category: Performance, risk: Moderate, impact: 5 },
    TweakDef { id: "disable_dynamic_tick", title: "Disable Dynamic Tick", description: "Legacy timer tweak — modern Windows handles this well; often no gain and it can hurt. Experimental.", category: Performance, risk: Advanced, impact: 2 },
    TweakDef { id: "disable_hpet", title: "Disable HPET", description: "Legacy timer tweak — community consensus moved away years ago; can even hurt on modern CPUs. Experimental.", category: Performance, risk: Advanced, impact: 2 },
    TweakDef { id: "cpu_affinity_pcore", title: "Pin Games to Performance Cores", description: "Steers the game to P-cores on hybrid CPUs (auto-skips where it would hurt).", category: Performance, risk: Advanced, impact: 4 },
    TweakDef { id: "disable_power_throttling", title: "Disable Power Throttling", description: "Stops Windows from throttling foreground apps to save power.", category: Performance, risk: Moderate, impact: 4 },
    TweakDef { id: "win32_priority", title: "Optimize Win32 Priority Separation", description: "Tunes the scheduler quantum to favor foreground game threads.", category: Performance, risk: Moderate, impact: 3 },
    TweakDef { id: "game_priority", title: "Above-Normal Game Priority", description: "Raises the running game's process priority so it gets scheduler preference.", category: Performance, risk: Safe, impact: 3 },
    TweakDef { id: "mmcss_gaming", title: "MMCSS Gaming Profile", description: "Gives games a larger GPU/CPU scheduling share via the multimedia scheduler.", category: Performance, risk: Moderate, impact: 3 },
    TweakDef { id: "large_system_cache", title: "Optimize System Responsiveness", description: "Sets SystemResponsiveness to 0 so 100% of CPU can go to the game.", category: Performance, risk: Moderate, impact: 3 },

    // ---------- Network ----------
    TweakDef { id: "disable_nagle", title: "Disable Nagle's Algorithm", description: "Sends small game packets immediately instead of batching them — lower input lag.", category: Network, risk: Moderate, impact: 4 },
    TweakDef { id: "network_throttling_index", title: "Network Throttling Index", description: "Removes the multimedia network throttle for better bandwidth and throughput.", category: Network, risk: Moderate, impact: 4 },
    TweakDef { id: "network_qos", title: "QoS DSCP Priority", description: "Tags the active game's packets as high priority (DSCP 46) on your network.", category: Network, risk: Safe, impact: 3 },
    TweakDef { id: "tcp_optimize", title: "TCP Auto-Tuning", description: "Tunes TCP window auto-tuning and scaling for gaming traffic.", category: Network, risk: Moderate, impact: 3 },
    TweakDef { id: "tcp_ack_frequency", title: "TCP ACK Frequency", description: "Acknowledges packets immediately rather than delaying — pairs with Nagle off.", category: Network, risk: Moderate, impact: 3 },
    TweakDef { id: "flush_dns", title: "Flush DNS Cache", description: "Clears stale DNS entries before an online session.", category: Network, risk: Safe, impact: 2 },
    TweakDef { id: "dns_cloudflare", title: "Fast DNS (1.1.1.1)", description: "Points DNS at Cloudflare for faster, private name resolution.", category: Network, risk: Safe, impact: 2 },
    TweakDef { id: "disable_teredo", title: "Disable Teredo / ISATAP", description: "Removes legacy IPv6 tunneling that can add latency and instability.", category: Network, risk: Safe, impact: 2 },

    // ---------- Graphics ----------
    TweakDef { id: "gpu_low_latency", title: "GPU Low Latency Mode", description: "Enables the driver's low-latency render queue (NVIDIA Reflex / AMD Anti-Lag).", category: Graphics, risk: Safe, impact: 4 },
    TweakDef { id: "disable_fso", title: "Disable Fullscreen Optimizations", description: "Forces true exclusive fullscreen for lower input lag and better compatibility.", category: Graphics, risk: Moderate, impact: 4 },
    TweakDef { id: "hags", title: "Hardware-Accelerated GPU Scheduling", description: "Lets the GPU manage its own memory scheduling on supported cards.", category: Graphics, risk: Moderate, impact: 3 },
    TweakDef { id: "disable_game_bar", title: "Disable Xbox Game Bar", description: "Removes the DVR/overlay capture hook overhead.", category: Graphics, risk: Safe, impact: 3 },
    TweakDef { id: "disable_gamedvr", title: "Disable Background Game DVR", description: "Stops background frame capture that silently costs FPS.", category: Graphics, risk: Safe, impact: 3 },
    TweakDef { id: "gpu_priority", title: "GPU Scheduling Priority", description: "Raises the GPU priority of games via the multimedia scheduler tasks.", category: Graphics, risk: Moderate, impact: 3 },
    TweakDef { id: "shader_cache", title: "Increase Shader Cache Size", description: "Lets the driver keep more compiled shaders to reduce traversal stutter.", category: Graphics, risk: Safe, impact: 2 },
    TweakDef { id: "disable_vsync_hint", title: "Disable Windowed VSync Hint", description: "Removes the DWM VSync hint that can cap windowed frame rates.", category: Graphics, risk: Moderate, impact: 2 },

    // ---------- Privacy ----------
    TweakDef { id: "disable_telemetry", title: "Disable Windows Telemetry", description: "Turns off diagnostic data collection and its background uploads.", category: Privacy, risk: Safe, impact: 3 },
    TweakDef { id: "disable_cortana", title: "Disable Cortana", description: "Removes the Cortana background process and its indexing hooks.", category: Privacy, risk: Safe, impact: 2 },
    TweakDef { id: "disable_ad_id", title: "Disable Advertising ID", description: "Stops apps from tracking you with a per-device advertising identifier.", category: Privacy, risk: Safe, impact: 2 },
    TweakDef { id: "disable_activity_history", title: "Disable Activity History", description: "Stops Windows from recording and syncing your activity timeline.", category: Privacy, risk: Safe, impact: 2 },
    TweakDef { id: "disable_location", title: "Disable Location Tracking", description: "Turns off the system location service and its background polling.", category: Privacy, risk: Safe, impact: 2 },
    TweakDef { id: "disable_feedback", title: "Disable Feedback Requests", description: "Stops Windows from periodically asking for feedback.", category: Privacy, risk: Safe, impact: 1 },

    // ---------- Gaming ----------
    TweakDef { id: "mouse_accel_off", title: "Disable Mouse Acceleration", description: "Makes cursor and aim movement 1:1 for consistent aim.", category: Gaming, risk: Safe, impact: 4 },
    TweakDef { id: "raw_input", title: "Raw Input Priority", description: "Prioritizes raw mouse/keyboard input for lower input latency.", category: Gaming, risk: Moderate, impact: 3 },
    TweakDef { id: "fps_cap", title: "Smart FPS Cap", description: "Caps FPS just under your refresh to cut latency when sync is on.", category: Gaming, risk: Safe, impact: 3 },
    TweakDef { id: "keyboard_delay", title: "Minimize Keyboard Repeat Delay", description: "Sets the fastest keyboard repeat/response for input.", category: Gaming, risk: Safe, impact: 2 },
    TweakDef { id: "disable_sticky_keys", title: "Disable Sticky Keys", description: "Prevents the Sticky Keys prompt from interrupting games.", category: Gaming, risk: Safe, impact: 1 },
];

/// Read-only: is the active power plan already High/Ultimate Performance?
fn high_perf_active() -> bool {
    super::power_util::active_power_plan_name()
        .map(|n| {
            let n = n.to_lowercase();
            n.contains("high performance") || n.contains("ultimate")
        })
        .unwrap_or(false)
}

fn game_bar_disabled() -> bool {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\Microsoft\GameBar")
        .and_then(|k| k.get_value::<u32, _>("AppCaptureEnabled"))
        .map(|v| v == 0)
        .unwrap_or(false)
}

fn mouse_accel_off() -> bool {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    // Acceleration is only truly off when MouseSpeed AND both thresholds are 0.
    let Ok(key) = RegKey::predef(HKEY_CURRENT_USER).open_subkey(r"Control Panel\Mouse") else {
        return false;
    };
    let is_zero = |name: &str| {
        key.get_value::<String, _>(name)
            .map(|v| v.trim() == "0")
            .unwrap_or(false)
    };
    is_zero("MouseSpeed") && is_zero("MouseThreshold1") && is_zero("MouseThreshold2")
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
            let available = !(d.id == "power_ultimate" && is_laptop == Some(true));
            TweakInfo {
                id: d.id.to_string(),
                title: d.title.to_string(),
                description: d.description.to_string(),
                category: d.category,
                risk: d.risk,
                impact: d.impact,
                applied,
                available,
                appliable: super::tweak_ops::is_appliable(d.id),
            }
        })
        .collect();

    let cats = [System, Performance, Network, Graphics, Privacy, Gaming];
    let categories: Vec<CategorySummary> = cats
        .iter()
        .map(|&c| {
            let members: Vec<&TweakInfo> = tweaks.iter().filter(|t| t.category == c).collect();
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
    ScanResult { tweaks, categories, total, applied }
}
