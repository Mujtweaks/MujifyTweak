//! Mujify Tweaks backend modules.
//!
//! Implemented so far (Checkpoints 2–8, 11 storage): hardware profiling, live
//! system + network monitoring, game/anti-cheat detection, the tweak catalog +
//! read-only scanner, and profile storage. Every stat is real Windows data;
//! nothing here applies a tweak to the machine.

pub mod anti_cheat_guard;
pub mod game_detector;
pub mod games_db;
pub mod hardware_profiler;
pub mod network_monitor;
pub mod power_util;
pub mod profile_store;
pub mod system_monitor;
pub mod tweak_catalog;
pub mod wmi_util;
