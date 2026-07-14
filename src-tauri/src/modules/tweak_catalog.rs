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
    Appearance,
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
    /// A safety caution shown in RED on the info icon when present (e.g. "don't
    /// apply on a laptop"). None = the ordinary white info icon.
    pub warning: Option<String>,
}

/// Safety warnings for the tweaks that genuinely need one. Everything else
/// returns None (plain white info icon). Kept as one table so the UI and the
/// apply-confirm dialog surface the exact same caution.
pub fn warning_for(id: &str) -> Option<&'static str> {
    match id {
        "power_ultimate" | "power_high_perf" =>
            Some("On a laptop this runs the CPU/GPU hot and drains the battery — only use it plugged in, and watch your temperatures."),
        "disable_bitlocker" =>
            Some("Only disable BitLocker if you understand the security tradeoff — your drive will no longer be encrypted."),
        "remove_onedrive" =>
            Some("Do NOT apply if you use OneDrive — this removes it and unsyncs your OneDrive folder. Your local files stay, but cloud sync stops."),
        "remove_xbox" =>
            Some("Removes the Xbox app and its components — skip this if you use Xbox Game Pass, Xbox achievements, or play Xbox-app games."),
        "services_manual" =>
            Some("Sets several non-essential services to Manual start. Safe for most people, but if you rely on printing, Bluetooth or fax, re-enable those after."),
        "disable_hvci" =>
            Some("This LOWERS a Windows security protection (Memory Integrity) for a gaming gain. Deliberate tradeoff — needs a restart."),
        "disable_core_parking" | "disable_power_throttling" =>
            Some("Great on a desktop; on a laptop it raises heat and battery drain because cores never idle down."),
        "browser_debloat" =>
            Some("Turns off built-in browser upsells/telemetry (Edge/Brave). Reversible, but it changes some browser policies."),
        _ => None,
    }
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

/// Every tweak id in the catalog (used for iteration / invariants in tests).
#[allow(dead_code)]
pub fn all_ids() -> Vec<&'static str> {
    CATALOG.iter().map(|d| d.id).collect()
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
    TweakDef { id: "usb_selective_suspend_off", title: "Disable USB Selective Suspend", description: "Stops Windows suspending USB devices — steadier mouse/keyboard/controller input.", category: System, risk: Safe, impact: 2 },
    TweakDef { id: "disable_fast_startup", title: "Disable Fast Startup", description: "Forces a clean cold boot so drivers and state load fresh — more consistent behaviour.", category: System, risk: Safe, impact: 2 },
    TweakDef { id: "zero_startup_delay", title: "Zero Startup App Delay", description: "Removes the artificial delay before startup apps launch after boot.", category: System, risk: Safe, impact: 1 },
    TweakDef { id: "disable_widgets", title: "Disable Widgets / News & Interests", description: "Turns off the taskbar Widgets board and its background feed process.", category: System, risk: Safe, impact: 2 },
    TweakDef { id: "disable_background_apps", title: "Disable Background Apps", description: "Stops UWP/Store apps from running and updating in the background.", category: System, risk: Moderate, impact: 3 },
    TweakDef { id: "disable_storage_sense", title: "Disable Storage Sense", description: "Stops the automatic disk-cleanup task from running in the background.", category: System, risk: Safe, impact: 1 },
    TweakDef { id: "num_lock_startup", title: "Num Lock On at Startup", description: "Enables Num Lock automatically at sign-in so the numpad works right away.", category: System, risk: Safe, impact: 1 },
    TweakDef { id: "verbose_logon", title: "Verbose Sign-in Messages", description: "Shows detailed “what Windows is doing” status text during sign-in/shutdown — handy for spotting what's slowing boot.", category: System, risk: Safe, impact: 1 },
    TweakDef { id: "detailed_bsod", title: "Detailed Blue-Screen Info", description: "Makes the blue-screen show the full technical detail (driver/stop code) instead of just a sad face — far easier to diagnose crashes.", category: System, risk: Safe, impact: 1 },
    TweakDef { id: "utc_time", title: "Use UTC for Hardware Clock", description: "Stores the BIOS clock in UTC so the time stays correct when dual-booting Linux. Skip on a Windows-only PC.", category: System, risk: Moderate, impact: 1 },
    TweakDef { id: "svchost_split_threshold", title: "Consolidate Service Host Processes", description: "Raises the svchost split threshold so Windows groups services into fewer processes — less RAM and per-process overhead on machines with plenty of memory.", category: System, risk: Moderate, impact: 3 },
    TweakDef { id: "disable_autoplay", title: "Disable AutoPlay", description: "Stops Windows auto-launching a prompt/app every time you plug in a USB drive or SD card.", category: System, risk: Safe, impact: 1 },
    TweakDef { id: "menu_show_delay", title: "Instant Menu Response", description: "Removes the built-in delay before menus open — the whole desktop feels snappier. Fully reversible.", category: Appearance, risk: Safe, impact: 2 },
    TweakDef { id: "disable_content_delivery", title: "Stop Suggested App Installs", description: "Turns off every Content Delivery Manager channel Windows uses to silently push promoted apps and suggestions onto your account.", category: Appearance, risk: Safe, impact: 2 },
    TweakDef { id: "disable_wer", title: "Disable Windows Error Reporting", description: "Stops the Windows Error Reporting service from collecting and uploading crash dumps in the background.", category: Privacy, risk: Safe, impact: 2 },
    TweakDef { id: "clear_standby", title: "Clear Standby Memory", description: "A one-shot action, not a toggle — run it from “Free up memory” in the Cleaner tab to flush the standby list back to the game.", category: System, risk: Safe, impact: 3 },
    TweakDef { id: "disable_memory_compression", title: "Disable Memory Compression", description: "Reduces CPU overhead from compressing RAM pages on high-memory systems.", category: System, risk: Moderate, impact: 3 },
    TweakDef { id: "disable_hvci", title: "Disable Memory Integrity (Core Isolation)", description: "Turns off HVCI/VBS Memory Integrity to reclaim its gaming performance cost. This LOWERS a security protection and needs a restart to take effect — a deliberate tradeoff, not a blanket recommendation.", category: System, risk: Advanced, impact: 3 },
    TweakDef { id: "max_refresh_rate", title: "Set Monitor to Max Refresh Rate", description: "Raises your display to its highest refresh rate at the current resolution — a 60Hz-stuck 144Hz panel is night-and-day. Instantly reversible.", category: Graphics, risk: Moderate, impact: 4 },

    // ---------- Performance ----------
    TweakDef { id: "disable_core_parking", title: "Disable CPU Core Parking", description: "Keeps all CPU cores active instead of parking idle ones — smoother frame pacing.", category: Performance, risk: Moderate, impact: 5 },
    TweakDef { id: "timer_resolution", title: "Timer Resolution Optimization", description: "Info only — modern Windows (2004+) gives each game the timer resolution it requests while focused, so a forced global 1 ms tweak no longer helps and can raise power draw. Shown for awareness.", category: Performance, risk: Safe, impact: 5 },
    TweakDef { id: "disable_dynamic_tick", title: "Disable Dynamic Tick", description: "Legacy timer tweak — modern Windows handles this well; often no gain and it can hurt. Experimental.", category: Performance, risk: Advanced, impact: 2 },
    TweakDef { id: "disable_hpet", title: "Disable HPET", description: "Legacy timer tweak — community consensus moved away years ago; can even hurt on modern CPUs. Experimental.", category: Performance, risk: Advanced, impact: 2 },
    TweakDef { id: "cpu_affinity_pcore", title: "Pin Games to Performance Cores", description: "Steers the game to P-cores on hybrid CPUs (auto-skips where it would hurt).", category: Performance, risk: Advanced, impact: 4 },
    TweakDef { id: "disable_power_throttling", title: "Disable Power Throttling", description: "Stops Windows from throttling foreground apps to save power.", category: Performance, risk: Moderate, impact: 4 },
    TweakDef { id: "win32_priority", title: "Optimize Win32 Priority Separation", description: "Sets Win32PrioritySeparation to 0x26 (38) — short, variable quantums that strongly favour the foreground game for the highest FPS. (For reference: 0x2A = max responsiveness/snappier Windows, 0x18 = favour background tasks.)", category: Performance, risk: Moderate, impact: 3 },
    TweakDef { id: "game_priority", title: "Above-Normal Game Priority", description: "Info only — process priority is set on the live game at runtime (during Auto-Optimize), not as a persistent Windows setting, so there's no global toggle here.", category: Performance, risk: Safe, impact: 3 },
    TweakDef { id: "mmcss_gaming", title: "MMCSS Gaming Profile", description: "Gives games a larger GPU/CPU scheduling share via the multimedia scheduler.", category: Performance, risk: Moderate, impact: 3 },
    TweakDef { id: "large_system_cache", title: "Optimize System Responsiveness", description: "Sets SystemResponsiveness to 10 so Windows reserves less CPU for background multimedia and gives more to your game (10 is the recommended gaming value; Windows default is 20).", category: Performance, risk: Moderate, impact: 3 },

    // ---------- Network ----------
    TweakDef { id: "disable_nagle", title: "Disable Nagle's Algorithm", description: "Sends small game packets immediately instead of batching them — lower input lag.", category: Network, risk: Moderate, impact: 4 },
    TweakDef { id: "network_throttling_index", title: "Network Throttling Index", description: "Removes the multimedia network throttle for better bandwidth and throughput.", category: Network, risk: Moderate, impact: 4 },
    TweakDef { id: "network_qos", title: "Disable QoS Bandwidth Reserve", description: "Stops Windows reserving up to 20% of your bandwidth for background QoS traffic.", category: Network, risk: Safe, impact: 3 },
    TweakDef { id: "tcp_optimize", title: "TCP Auto-Tuning", description: "Tunes TCP window auto-tuning and scaling for gaming traffic.", category: Network, risk: Moderate, impact: 3 },
    TweakDef { id: "tcp_ack_frequency", title: "TCP ACK Frequency", description: "Acknowledges packets immediately rather than delaying — pairs with Nagle off.", category: Network, risk: Moderate, impact: 3 },
    TweakDef { id: "flush_dns", title: "Flush DNS Cache", description: "Clears stale DNS entries before an online session.", category: Network, risk: Safe, impact: 2 },
    TweakDef { id: "disable_teredo", title: "Disable Teredo / ISATAP", description: "Removes legacy IPv6 tunneling that can add latency and instability.", category: Network, risk: Safe, impact: 2 },
    TweakDef { id: "disable_delivery_optimization", title: "Disable Delivery Optimization", description: "Stops Windows Delivery Optimization from uploading your downloaded updates to other PCs over your connection — saves upload bandwidth.", category: Network, risk: Safe, impact: 2 },

    // ---------- Graphics ----------
    TweakDef { id: "gpu_low_latency", title: "GPU Low Latency Mode", description: "Info only — this lives in your GPU driver, not Windows. Turn on NVIDIA Reflex (or “Low Latency Mode: Ultra”) / AMD Anti-Lag in the game or your driver control panel.", category: Graphics, risk: Safe, impact: 4 },
    TweakDef { id: "disable_fso", title: "Disable Fullscreen Optimizations", description: "Forces true exclusive fullscreen for lower input lag and better compatibility.", category: Graphics, risk: Moderate, impact: 4 },
    TweakDef { id: "hags", title: "Hardware-Accelerated GPU Scheduling", description: "Lets the GPU manage its own memory scheduling on supported cards.", category: Graphics, risk: Moderate, impact: 3 },
    TweakDef { id: "disable_game_bar", title: "Disable Xbox Game Bar", description: "Removes the DVR/overlay capture hook overhead.", category: Graphics, risk: Safe, impact: 3 },
    TweakDef { id: "disable_gamedvr", title: "Disable Background Game DVR", description: "Stops background frame capture that silently costs FPS.", category: Graphics, risk: Safe, impact: 3 },
    TweakDef { id: "gpu_priority", title: "GPU Scheduling Priority", description: "Raises the GPU priority of games via the multimedia scheduler tasks.", category: Graphics, risk: Moderate, impact: 3 },
    TweakDef { id: "shader_cache", title: "Increase Shader Cache Size", description: "Lets the driver keep more compiled shaders to reduce traversal stutter.", category: Graphics, risk: Safe, impact: 2 },
    TweakDef { id: "disable_vsync_hint", title: "Disable Windowed VSync Hint", description: "Removes the DWM VSync hint that can cap windowed frame rates.", category: Graphics, risk: Moderate, impact: 2 },
    TweakDef { id: "disable_mpo", title: "Disable Multiplane Overlay (MPO)", description: "Turns off DWM Multiplane Overlay — the fix for screen flicker, black flashes and stutter that some NVIDIA/AMD setups get with G-Sync/FreeSync. Needs a restart. Fully reversible.", category: Graphics, risk: Moderate, impact: 3 },
    // Vendor-specific — the UI shows each only when that GPU brand is detected.
    TweakDef { id: "nvidia_max_performance", title: "NVIDIA: Prefer Maximum Performance", description: "Sets the NVIDIA PowerMizer policy to hold high clocks instead of down-clocking during games.", category: Graphics, risk: Moderate, impact: 4 },
    TweakDef { id: "nvidia_disable_telemetry", title: "NVIDIA: Disable Telemetry", description: "Disables the NVIDIA telemetry background service.", category: Graphics, risk: Safe, impact: 2 },
    TweakDef { id: "amd_disable_ulps", title: "AMD: Disable ULPS", description: "Turns off Ultra Low Power State so the Radeon GPU doesn't aggressively down-clock.", category: Graphics, risk: Moderate, impact: 3 },

    // ---------- Privacy ----------
    TweakDef { id: "disable_recall", title: "Disable Microsoft Recall", description: "Stops Windows Recall from continuously screenshotting and indexing everything you do — background AI capture with serious privacy exposure.", category: Privacy, risk: Safe, impact: 3 },
    TweakDef { id: "disable_copilot", title: "Disable Windows Copilot", description: "Turns off the Windows Copilot AI assistant and its background process.", category: Privacy, risk: Safe, impact: 2 },
    TweakDef { id: "disable_telemetry", title: "Disable Windows Telemetry", description: "Turns off diagnostic data collection and its background uploads.", category: Privacy, risk: Safe, impact: 3 },
    TweakDef { id: "disable_cortana", title: "Disable Cortana", description: "Removes the Cortana background process and its indexing hooks.", category: Privacy, risk: Safe, impact: 2 },
    TweakDef { id: "disable_ad_id", title: "Disable Advertising ID", description: "Stops apps from tracking you with a per-device advertising identifier.", category: Privacy, risk: Safe, impact: 2 },
    TweakDef { id: "disable_activity_history", title: "Disable Activity History", description: "Stops Windows from recording and syncing your activity timeline.", category: Privacy, risk: Safe, impact: 2 },
    TweakDef { id: "disable_location", title: "Disable Location Tracking", description: "Turns off the system location service and its background polling.", category: Privacy, risk: Safe, impact: 2 },
    TweakDef { id: "disable_feedback", title: "Disable Feedback Requests", description: "Stops Windows from periodically asking for feedback.", category: Privacy, risk: Safe, impact: 1 },
    TweakDef { id: "disable_wpbt", title: "Block Firmware App Injection (WPBT)", description: "Stops the motherboard firmware from silently installing vendor software into Windows on every boot (the WPBT mechanism). A real security & bloat win. Reversible.", category: Privacy, risk: Moderate, impact: 2 },
    TweakDef { id: "disable_bitlocker", title: "Disable BitLocker Auto-Encryption", description: "Stops Windows automatically encrypting your drive with BitLocker. Reversible policy change — does not decrypt an already-encrypted drive.", category: Privacy, risk: Advanced, impact: 1 },
    TweakDef { id: "services_manual", title: "Set Unneeded Services to Manual", description: "Stops non-essential background services (Fax, Downloaded Maps, Remote Registry, Retail Demo, WMP Network Sharing) from starting on boot — they'll still start on demand if something needs them. Frees RAM and boot time.", category: System, risk: Moderate, impact: 3 },
    TweakDef { id: "remove_onedrive", title: "Remove Microsoft OneDrive", description: "Uninstalls OneDrive and stops it launching at startup. Your local files stay put; only cloud sync stops.", category: System, risk: Advanced, impact: 2 },

    // ---------- Gaming ----------
    TweakDef { id: "mouse_accel_off", title: "Disable Mouse Acceleration", description: "Makes cursor and aim movement 1:1 for consistent aim.", category: Gaming, risk: Safe, impact: 4 },
    TweakDef { id: "raw_input", title: "Raw Input Priority", description: "Info only — enable “Raw Input” in each game's mouse/controls settings; it bypasses Windows pointer processing per-game, so there's no global switch.", category: Gaming, risk: Safe, impact: 3 },
    TweakDef { id: "fps_cap", title: "Smart FPS Cap", description: "Info only — set an FPS cap ~3 below your refresh rate in the game's settings or your GPU driver (NVIDIA/AMD) for the lowest latency with sync on.", category: Gaming, risk: Safe, impact: 3 },
    TweakDef { id: "keyboard_delay", title: "Minimize Keyboard Repeat Delay", description: "Sets the fastest keyboard repeat/response for input.", category: Gaming, risk: Safe, impact: 2 },
    TweakDef { id: "disable_sticky_keys", title: "Disable Sticky Keys", description: "Prevents the Sticky Keys prompt from interrupting games.", category: Gaming, risk: Safe, impact: 1 },
    TweakDef { id: "remove_xbox", title: "Remove Xbox App & Components", description: "Uninstalls the Xbox app, Game Bar overlay and related components. Skip if you use Game Pass or Xbox achievements.", category: Gaming, risk: Advanced, impact: 2 },

    // ---------- Appearance (make Windows lean & snappy) ----------
    TweakDef { id: "visual_fx_performance", title: "Best-Performance Visual Effects", description: "Switches Windows visual effects to “Adjust for best performance” — drops animations and shadows so the desktop feels instant. Fully reversible.", category: Appearance, risk: Safe, impact: 3 },
    TweakDef { id: "disable_transparency", title: "Disable Transparency Effects", description: "Turns off the translucent taskbar/menus (Acrylic/Mica) — a small GPU/compositor saving and a cleaner look.", category: Appearance, risk: Safe, impact: 2 },
    TweakDef { id: "dark_mode", title: "Enable Dark Mode", description: "Switches apps and the system UI to the dark theme.", category: Appearance, risk: Safe, impact: 1 },
    TweakDef { id: "hide_task_view", title: "Hide Task View Button", description: "Removes the Task View (virtual-desktops) button from the taskbar for a cleaner bar.", category: Appearance, risk: Safe, impact: 1 },
    TweakDef { id: "taskbar_end_task", title: "Enable End Task on Right-Click", description: "Adds “End Task” to the right-click menu of taskbar apps, so you can kill a frozen game instantly without opening Task Manager.", category: Appearance, risk: Safe, impact: 2 },
    TweakDef { id: "disable_bing_search", title: "Disable Bing in Start Search", description: "Stops Start-menu search from querying Bing/web — local results only, faster and more private.", category: Appearance, risk: Safe, impact: 2 },
    TweakDef { id: "disable_consumer_features", title: "Disable Auto-Installed Promo Apps", description: "Stops Windows from silently installing promoted/suggested apps (Candy Crush and friends) on your account.", category: Appearance, risk: Safe, impact: 2 },
    TweakDef { id: "show_file_extensions", title: "Show File Extensions", description: "Reveals file extensions (.exe, .txt, .bat) in Explorer — safer and clearer than hiding them.", category: Appearance, risk: Safe, impact: 1 },
    TweakDef { id: "show_hidden_files", title: "Show Hidden Files", description: "Shows hidden files and folders in File Explorer.", category: Appearance, risk: Safe, impact: 1 },
    TweakDef { id: "hide_taskbar_search", title: "Hide Taskbar Search Box", description: "Removes the wide search box from the taskbar for a cleaner bar (search still works via Start).", category: Appearance, risk: Safe, impact: 1 },
    TweakDef { id: "disable_lock_screen", title: "Disable Lock Screen", description: "Skips the lock-screen image and goes straight to the sign-in prompt.", category: Appearance, risk: Safe, impact: 1 },
    TweakDef { id: "enable_long_paths", title: "Enable Long File Paths", description: "Lets Windows and apps use paths longer than 260 characters — avoids weird errors with deep game/mod folders.", category: System, risk: Safe, impact: 1 },
    TweakDef { id: "disable_notification_center", title: "Disable Notification Center", description: "Turns off the Action/Notification Center flyout and its calendar popup — fewer background interruptions while gaming.", category: Privacy, risk: Safe, impact: 2 },
    TweakDef { id: "taskbar_align_left", title: "Move Taskbar Icons Left", description: "Aligns taskbar icons to the left (classic Windows 10 style) instead of centered.", category: Appearance, risk: Safe, impact: 1 },
    TweakDef { id: "hide_start_recommendations", title: "Hide Start “Recommended”", description: "Removes the Recommended (recent files/apps) section from the Start menu for a cleaner, more private Start.", category: Appearance, risk: Safe, impact: 1 },
    TweakDef { id: "scrollbars_always", title: "Always Show Scrollbars", description: "Keeps scrollbars visible instead of auto-hiding them — easier to grab, no layout shift.", category: Appearance, risk: Safe, impact: 1 },
    TweakDef { id: "start_more_pins", title: "Start Menu: More Pins Layout", description: "Switches the Start menu to the “More pins” layout — bigger pinned area, smaller Recommended strip. The cleaner, more classic feel.", category: Appearance, risk: Safe, impact: 1 },
];

/// Scan current state and report per-tweak applied/available + category rollups.
/// Reads only — nothing is changed on the system.
/// Off the UI thread — reading live registry state for all ~90 tweaks can take a
/// moment, and running it on the main thread froze the Optimizer/Tweaks tabs at
/// "loading…". `spawn_blocking` keeps the window responsive while it scans.
#[tauri::command]
pub async fn scan_tweaks(is_laptop: Option<bool>) -> ScanResult {
    tokio::task::spawn_blocking(move || scan_tweaks_impl(is_laptop))
        .await
        .unwrap_or_else(|_| ScanResult { tweaks: Vec::new(), categories: Vec::new(), total: 0, applied: 0 })
}

fn scan_tweaks_impl(is_laptop: Option<bool>) -> ScanResult {
    let tweaks: Vec<TweakInfo> = CATALOG
        .iter()
        .map(|d| {
            // Real detection for EVERY tweak: reads the live registry/system state
            // its ops target and reports whether it's already present — instead of
            // the old hardcoded 6-tweak check. Scan-only tweaks report not-applied.
            let applied = super::tweak_ops::is_applied(d.id);
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
                warning: warning_for(d.id).map(String::from),
            }
        })
        .collect();

    let cats = [System, Performance, Network, Graphics, Privacy, Gaming, Appearance];
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
