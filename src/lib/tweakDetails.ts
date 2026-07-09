// Display-only transparency data for every tweak (and, later, every fix).
// Nothing here applies anything — it powers the expandable "what this does /
// what exactly changes" panel so a non-technical user understands the change and
// that it's reversible. Mirrors the real Rust `tweak_ops::ops_for` mapping.

export type TweakAction =
  | "registry"
  | "service-stop"
  | "service-disable"
  | "service-start"
  | "task-delete"
  | "command"
  | "cache-clear"
  | "power-plan"
  | "display"
  | "permanent";

export interface TweakDetail {
  /** One plain-English sentence, no jargon. */
  what: string;
  /** What kind of change it is (drives the action badge). */
  action: TweakAction;
  /** The specific thing that changes — key / service / value in plain words. */
  changes: string;
}

/** The action-type badge wording shown to the user. */
export const ACTION_LABEL: Record<TweakAction, string> = {
  registry: "Changes a registry value (reversible)",
  "service-stop": "Stops a Windows service (temporary)",
  "service-disable": "Disables a service's startup (reversible)",
  "service-start": "Starts / enables a Windows service (reversible)",
  "task-delete": "Deletes a scheduled task (reversible)",
  command: "Runs a repair command (reversible)",
  "cache-clear": "Clears a cache folder (rebuilds automatically)",
  "power-plan": "Switches the power plan (reversible)",
  display: "Changes the display mode (reversible)",
  permanent: "Permanent change (not auto-reversible)",
};

/** Risk tiers, defined for the user in industry-standard wording. */
export const RISK_WORD: Record<string, string> = {
  safe: "Safe",
  moderate: "Moderate",
  advanced: "Advanced",
};
export const RISK_DEF: Record<string, string> = {
  safe: "No impact on normal Windows functionality.",
  moderate: "May affect specific features you use.",
  advanced: "Could break certain Windows functions — for experienced users.",
};

export const TWEAK_DETAILS: Record<string, TweakDetail> = {
  // ---------- System ----------
  power_high_perf: {
    what: "Switches Windows to the High Performance power plan so the CPU/GPU don't down-clock to save power.",
    action: "power-plan",
    changes: "Sets the active power scheme to High Performance. Your original plan is restored on revert.",
  },
  disable_hvci: {
    what: "Turns off Core Isolation / Memory Integrity (HVCI/VBS), which virtualizes the kernel for security at a real gaming performance cost. This is a security-vs-performance tradeoff and needs a restart.",
    action: "registry",
    changes:
      "Sets DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity\\Enabled to 0. Your prior value is captured and restored on revert. Requires a restart to take effect.",
  },
  max_refresh_rate: {
    what: "Raises your monitor to its highest refresh rate at the current resolution — many panels ship stuck at 60Hz when they support 120/144/165Hz.",
    action: "display",
    changes:
      "Sets the primary display to its max refresh at the same resolution via the display driver. Your exact prior mode is captured and restored on revert.",
  },
  power_ultimate: {
    what: "Enables the hidden Ultimate Performance plan, which removes more idle power savings than High Performance.",
    action: "power-plan",
    changes: "Creates and activates the Ultimate Performance scheme. Revert restores your previous plan.",
  },
  disable_startup_apps: {
    what: "Stops non-essential apps from launching at boot to free RAM and speed up startup.",
    action: "registry",
    changes: "Marks selected startup entries as disabled under Explorer\\StartupApproved. Reversible.",
  },
  disable_sysmain: {
    what: "Stops SysMain (Superfetch), which pre-loads apps in the background and competes for disk during games.",
    action: "service-disable",
    changes: "Service SysMain → Disabled + stopped. Revert restores its previous start type and running state.",
  },
  disable_search_index: {
    what: "Halts Windows Search indexing so it stops using CPU and disk while you game.",
    action: "service-disable",
    changes: "Service WSearch → Disabled + stopped. Revert restores the previous state.",
  },
  disable_print_spooler: {
    what: "Stops the print service if you don't print — one fewer background process.",
    action: "service-disable",
    changes: "Service Spooler → Disabled + stopped. Revert restores the previous state.",
  },
  disable_tips: {
    what: "Turns off Windows suggestion notifications, tips and lock-screen ads.",
    action: "registry",
    changes:
      "HKCU\\...\\ContentDeliveryManager → SubscribedContent-338389Enabled, SoftLandingEnabled and SystemPaneSuggestionsEnabled = 0. All reversible.",
  },
  disable_hibernation: {
    what: "Turns off hibernation, freeing the multi-GB hiberfil.sys and removing hybrid-sleep overhead.",
    action: "registry",
    changes: "HKLM\\SYSTEM\\...\\Power → HibernateEnabled = 0. Revert restores the prior value.",
  },
  clear_standby: {
    what: "Flushes the standby memory list back to free RAM when memory runs low.",
    action: "command",
    changes: "One-shot memory flush — there is nothing to undo; the list refills naturally.",
  },
  disable_memory_compression: {
    what: "Turns off RAM compression to cut CPU overhead on systems with plenty of memory.",
    action: "command",
    changes: "Runs Disable-MMAgent -mc. Revert re-enables it with Enable-MMAgent -mc.",
  },

  // ---------- Performance ----------
  disable_core_parking: {
    what: "Keeps all CPU cores awake instead of parking idle ones, for steadier frame pacing.",
    action: "command",
    changes: "Sets the processor core-parking minimum to 100% via powercfg. Revert restores the prior value.",
  },
  timer_resolution: {
    what: "Requests a 1 ms system timer for smoother frames and lower input latency.",
    action: "command",
    changes: "Requests a higher timer resolution at runtime. (Scan-only — apply path not wired yet.)",
  },
  disable_dynamic_tick: {
    what: "Legacy timer tweak. Modern Windows handles interrupt timing fine — often no gain, and it can hurt. Experimental; don't expect FPS.",
    action: "command",
    changes: "Edits the boot configuration (bcdedit disabledynamictick yes). Advanced — needs a restart.",
  },
  disable_hpet: {
    what: "Legacy timer tweak. Community consensus moved away years ago; it can even hurt on modern CPUs. Experimental; don't expect FPS.",
    action: "command",
    changes: "Edits the boot configuration (bcdedit useplatformclock). Advanced — needs a restart.",
  },
  cpu_affinity_pcore: {
    what: "Steers the game onto performance cores on hybrid CPUs (auto-skips where it would hurt).",
    action: "command",
    changes: "Sets process affinity at runtime for the foreground game. Advanced.",
  },
  disable_power_throttling: {
    what: "Stops Windows from throttling foreground apps to save power.",
    action: "registry",
    changes: "HKLM\\SYSTEM\\...\\Power\\PowerThrottling → PowerThrottlingOff = 1. Reversible.",
  },
  win32_priority: {
    what: "Tunes the scheduler to favour the foreground game's threads.",
    action: "registry",
    changes: "HKLM\\...\\PriorityControl → Win32PrioritySeparation = 38 (0x26). Revert restores the prior value.",
  },
  game_priority: {
    what: "Raises the running game's process priority so the scheduler gives it preference.",
    action: "command",
    changes: "Sets the foreground game to Above Normal priority at runtime.",
  },
  mmcss_gaming: {
    what: "Gives games a bigger CPU/GPU scheduling share via the multimedia scheduler.",
    action: "registry",
    changes:
      "HKLM\\...\\SystemProfile\\Tasks\\Games → GPU Priority 8, Priority 6, Scheduling Category High, SFIO Priority High. Reversible.",
  },
  large_system_cache: {
    what: "Sets SystemResponsiveness to 0 so the full CPU can go to the foreground game.",
    action: "registry",
    changes: "HKLM\\...\\SystemProfile → SystemResponsiveness = 0. Revert restores the prior value.",
  },

  // ---------- Network ----------
  disable_nagle: {
    what: "Sends small game packets immediately instead of batching them, cutting input lag.",
    action: "registry",
    changes: "Each network interface → TCPNoDelay = 1. Reversible per interface.",
  },
  network_throttling_index: {
    what: "Removes the multimedia network throttle for full bandwidth.",
    action: "registry",
    changes: "HKLM\\...\\SystemProfile → NetworkThrottlingIndex = 0xFFFFFFFF. Reversible.",
  },
  network_qos: {
    what: "Frees the 20% bandwidth Windows reserves for QoS so games can use it.",
    action: "registry",
    changes: "HKLM\\...\\Psched → NonBestEffortLimit = 0. Reversible.",
  },
  tcp_optimize: {
    what: "Enables TCP window scaling for better throughput on higher-latency links.",
    action: "registry",
    changes: "HKLM\\...\\Tcpip\\Parameters → Tcp1323Opts = 1. Reversible.",
  },
  tcp_ack_frequency: {
    what: "Acknowledges packets immediately rather than delaying them — pairs with Nagle off.",
    action: "registry",
    changes: "Each network interface → TcpAckFrequency = 1. Reversible per interface.",
  },
  flush_dns: {
    what: "Clears stale DNS entries before an online session.",
    action: "command",
    changes: "Runs ipconfig /flushdns. One-shot — nothing to undo.",
  },
  dns_cloudflare: {
    what: "Points DNS at Cloudflare (1.1.1.1) for faster, private name resolution.",
    action: "registry",
    changes: "Each network interface → NameServer = 1.1.1.1, 1.0.0.1. Revert restores your prior DNS.",
  },
  disable_teredo: {
    what: "Removes legacy IPv6 tunnelling (Teredo/ISATAP/6to4) that can add latency.",
    action: "registry",
    changes:
      "HKLM\\...\\Tcpip6\\Parameters → DisabledComponents = 1. Reversible. (The Fixes tab can re-enable Teredo for Xbox party chat.)",
  },

  // ---------- Graphics ----------
  gpu_low_latency: {
    what: "Enables the driver's low-latency render queue (NVIDIA Reflex / AMD Anti-Lag style).",
    action: "registry",
    changes: "Driver low-latency setting. (Scan-only — apply path not wired yet.)",
  },
  disable_fso: {
    what: "Forces true exclusive fullscreen for lower input lag and better compatibility.",
    action: "registry",
    changes: "HKCU\\System\\GameConfigStore → GameDVR_FSEBehaviorMode = 2 (+ related flags). Reversible.",
  },
  hags: {
    what: "Lets the GPU manage its own memory scheduling on supported cards (Hardware-Accelerated GPU Scheduling).",
    action: "registry",
    changes: "HKLM\\...\\GraphicsDrivers → HwSchMode = 2. Reversible. Test on/off — it can slightly skew GPU timing.",
  },
  disable_game_bar: {
    what: "Removes the Xbox Game Bar capture/overlay hook that quietly costs frames.",
    action: "registry",
    changes: "HKCU\\...\\GameBar → AppCaptureEnabled = 0 and GameConfigStore → GameDVR_Enabled = 0. Reversible.",
  },
  disable_gamedvr: {
    what: "Stops background Game DVR frame capture that silently reduces FPS.",
    action: "registry",
    changes: "GameConfigStore → GameDVR_Enabled = 0 and Policies\\GameDVR → AllowGameDVR = 0. Reversible.",
  },
  gpu_priority: {
    what: "Raises the GPU scheduling priority of games via the multimedia scheduler.",
    action: "registry",
    changes: "HKLM\\...\\Tasks\\Games → GPU Priority = 8. Reversible.",
  },
  shader_cache: {
    what: "Lets the driver keep more compiled shaders to reduce traversal stutter.",
    action: "registry",
    changes: "Driver shader-cache size. (Scan-only — apply path not wired yet.)",
  },
  disable_vsync_hint: {
    what: "Removes the DWM VSync hint that can cap windowed frame rates.",
    action: "registry",
    changes: "DWM VSync hint. (Scan-only — apply path not wired yet.)",
  },

  // ---------- Privacy ----------
  disable_recall: {
    what: "Stops Windows Recall from continuously screenshotting and indexing everything on your screen. Snapshots are stored in a searchable AI database on your PC — a serious privacy exposure if anyone gets access to your machine, plus background capture overhead. Only Copilot+ PCs run Recall; on other PCs this sets the same policies as a preventive lock.",
    action: "registry",
    changes:
      "HKCU + HKLM \\Policies\\Microsoft\\Windows\\WindowsAI → DisableAIDataAnalysis = 1, and HKLM → AllowRecallEnablement = 0. All reversible.",
  },
  disable_telemetry: {
    what: "Turns off Windows diagnostic data collection and its background upload services.",
    action: "service-disable",
    changes:
      "HKLM\\...\\DataCollection → AllowTelemetry = 0, and services DiagTrack + dmwappushservice → Disabled. All reversible.",
  },
  disable_cortana: {
    what: "Disables Cortana and its background indexing hooks.",
    action: "registry",
    changes: "HKLM\\...\\Windows Search → AllowCortana = 0. Reversible.",
  },
  disable_ad_id: {
    what: "Stops apps tracking you with a per-device advertising ID.",
    action: "registry",
    changes: "HKCU\\...\\AdvertisingInfo → Enabled = 0. Reversible.",
  },
  disable_activity_history: {
    what: "Stops Windows recording and syncing your activity timeline.",
    action: "registry",
    changes: "HKLM\\...\\System → EnableActivityFeed / PublishUserActivities / UploadUserActivities = 0. Reversible.",
  },
  disable_location: {
    what: "Turns off the system location service and its background polling.",
    action: "registry",
    changes: "HKLM\\...\\ConsentStore\\location → Value = Deny. Reversible.",
  },
  disable_feedback: {
    what: "Stops Windows periodically asking for feedback.",
    action: "registry",
    changes: "HKCU\\Software\\Microsoft\\Siuf\\Rules → NumberOfSIUFInPeriod = 0. Reversible.",
  },

  // ---------- Gaming / input ----------
  mouse_accel_off: {
    what: "Makes cursor and aim movement 1:1 by disabling mouse acceleration.",
    action: "registry",
    changes: "HKCU\\Control Panel\\Mouse → MouseSpeed / MouseThreshold1 / MouseThreshold2 = 0. Reversible.",
  },
  raw_input: {
    what: "Prioritises raw mouse/keyboard input for lower input latency.",
    action: "registry",
    changes: "Raw input priority. (Scan-only — apply path not wired yet.)",
  },
  fps_cap: {
    what: "Caps FPS just under your refresh rate to cut latency when sync is on.",
    action: "command",
    changes: "Driver/in-game frame cap. (Scan-only — apply path not wired yet.)",
  },
  keyboard_delay: {
    what: "Sets the fastest keyboard repeat delay and rate for snappier input.",
    action: "registry",
    changes: "HKCU\\Control Panel\\Keyboard → KeyboardDelay = 0, KeyboardSpeed = 31. Reversible.",
  },
  disable_sticky_keys: {
    what: "Prevents the Sticky Keys prompt from interrupting games.",
    action: "registry",
    changes: "HKCU\\...\\StickyKeys → Flags = 506. Reversible.",
  },

  // ---------- New general tweaks ----------
  usb_selective_suspend_off: {
    what: "Stops Windows from suspending USB devices to save power, which can cause tiny input hitches on mice, keyboards and controllers.",
    action: "registry",
    changes: "HKLM\\...\\Services\\USB → DisableSelectiveSuspend = 1. Reversible.",
  },
  disable_fast_startup: {
    what: "Fast Startup keeps a hibernation-like kernel image between boots, which can cause driver/state inconsistencies. This forces a clean cold boot.",
    action: "registry",
    changes: "HKLM\\...\\Session Manager\\Power → HiberbootEnabled = 0. Reversible.",
  },
  zero_startup_delay: {
    what: "Removes the artificial delay Windows adds before launching startup apps after you log in.",
    action: "registry",
    changes: "HKCU\\...\\Explorer\\Serialize → StartupDelayInMSec = 0. Reversible.",
  },
  disable_delivery_optimization: {
    what: "Stops Windows Update from uploading update files to other PCs over the internet using your bandwidth.",
    action: "registry",
    changes: "HKLM\\...\\DeliveryOptimization → DODownloadMode = 0. Reversible.",
  },
  disable_widgets: {
    what: "Turns off the taskbar Widgets board and the background process that feeds it news and weather.",
    action: "registry",
    changes: "HKLM\\...\\Policies\\Microsoft\\Dsh → AllowNewsAndInterests = 0. Reversible.",
  },
  disable_copilot: {
    what: "Turns off the Windows Copilot AI assistant and its background process.",
    action: "registry",
    changes: "HKCU + HKLM \\Policies\\Microsoft\\Windows\\WindowsCopilot → TurnOffWindowsCopilot = 1. Reversible.",
  },
  disable_background_apps: {
    what: "Stops Microsoft Store / UWP apps from running, updating and syncing in the background.",
    action: "registry",
    changes: "HKCU\\...\\BackgroundAccessApplications → GlobalUserDisabled = 1, and HKLM\\...\\AppPrivacy → LetAppsRunInBackground = 2. Reversible.",
  },
  disable_storage_sense: {
    what: "Stops the automatic Storage Sense disk-cleanup task from running in the background.",
    action: "registry",
    changes: "HKLM\\...\\StorageSense → AllowStorageSenseGlobal = 0. Reversible.",
  },
  disable_edge_preload: {
    what: "Stops Microsoft Edge preloading itself at boot and running in the background when closed.",
    action: "registry",
    changes: "HKLM\\...\\Policies\\Microsoft\\Edge → StartupBoostEnabled = 0, BackgroundModeEnabled = 0. Reversible.",
  },

  // ---------- Vendor-specific ----------
  nvidia_max_performance: {
    what: "Sets the NVIDIA driver's PowerMizer policy on the primary adapter to prefer maximum performance, so the GPU holds high clocks instead of down-clocking during games.",
    action: "registry",
    changes: "HKLM\\...\\Class\\{4d36e968...}\\0000 → PowerMizerEnable = 1, PowerMizerLevel = 1, PowerMizerLevelAC = 1, PerfLevelSrc = 0x2222. Reversible.",
  },
  nvidia_disable_telemetry: {
    what: "Disables the NVIDIA telemetry background service (NvTelemetryContainer).",
    action: "service-disable",
    changes: "Service NvTelemetryContainer → Disabled. Reversible.",
  },
  amd_disable_ulps: {
    what: "Turns off AMD's Ultra Low Power State so the Radeon GPU doesn't aggressively drop to its lowest clocks, which can cause micro-stutter.",
    action: "registry",
    changes: "HKLM\\...\\Class\\{4d36e968...}\\0000 → EnableUlps = 0. Reversible.",
  },
};
