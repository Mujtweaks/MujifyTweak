//! Mujify Tweaks backend modules.
//!
//! Every stat is real Windows data. Every system change routes through
//! TweaksEngine → AntiCheatGuard → ChangeLog, captures a precise before-state,
//! and is reversible. The RealMutator apply path only runs on the user's
//! explicit per-action confirmation; the logic is proven by `cargo test` under
//! MockMutator, which touches nothing.

pub mod anti_cheat_guard;
pub mod benchmark;
pub mod change_log;
pub mod frame_time_monitor;
pub mod game_detector;
pub mod games_db;
pub mod hardware_profiler;
pub mod network_monitor;
pub mod power_util;
pub mod profile_store;
pub mod rollback_engine;
pub mod system_monitor;
pub mod system_mutator;
pub mod tweak_catalog;
pub mod tweak_ops;
pub mod tweaks_engine;
pub mod wmi_util;
