//! Mujify Tweaks backend modules.
//!
//! Every stat is real Windows data. Every system change routes through
//! TweaksEngine → AntiCheatGuard → ChangeLog, captures a precise before-state,
//! and is reversible. The RealMutator apply path only runs on the user's
//! explicit per-action confirmation; the logic is proven by `cargo test` under
//! MockMutator, which touches nothing.

pub mod ai_backend;
pub mod anti_cheat_guard;
pub mod auto_apply;
pub mod benchmark;
pub mod change_journal;
pub mod change_log;
pub mod cleaner;
pub mod config;
pub mod debloat;
pub mod driver_doctor;
pub mod fix_catalog;
pub mod frame_time_monitor;
pub mod game_detector;
pub mod game_icons;
pub mod overlay;
pub mod game_profiler;
pub mod game_profiles;
pub mod game_settings;
pub mod games_db;
pub mod hardware_profiler;
pub mod hardware_tier;
pub mod health_scan;
pub mod logger;
pub mod network_monitor;
pub mod power_util;
pub mod process_manager;
pub mod profile_store;
pub mod ram_optimizer;
pub mod ready_check;
pub mod restore_points;
pub mod rollback_engine;
pub mod server_ping;
pub mod services_manager;
pub mod sessions;
pub mod speed_test;
pub mod support;
pub mod system_monitor;
pub mod system_mutator;
pub mod tweak_catalog;
pub mod tweak_ops;
pub mod tweaks_engine;
pub mod wmi_util;
