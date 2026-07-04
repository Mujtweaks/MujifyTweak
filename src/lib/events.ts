import { listen } from "@tauri-apps/api/event";
import { isTauri } from "./tauri";
import { useSystemStore } from "../store/systemStore";
import { useGameStore } from "../store/gameStore";
import { useTweakStore } from "../store/tweakStore";
import type {
  ActivityEntry,
  AntiCheatStatus,
  FrameStats,
  GameInfo,
  NetworkStats,
  SystemStats,
} from "./types";

/**
 * The one place live data enters the frontend. The Rust backend PUSHES via
 * app.emit — the UI never polls invoke for stats. Listeners registered here
 * simply idle until the matching backend module comes online:
 *
 *   system_stats      → SystemMonitor    (Checkpoint 3)
 *   game_changed      → GameDetector     (Checkpoint 4)
 *   frame_stats       → FrameTimeMonitor (Checkpoint 6)
 *   network_stats     → NetworkMonitor   (Checkpoint 7)
 *   change_log_update → TweaksEngine     (Checkpoint 9)
 */
export async function initEventBridge(): Promise<void> {
  if (!isTauri) return;

  await listen<SystemStats>("system_stats", (e) =>
    useSystemStore.getState().setStats(e.payload),
  );

  await listen<FrameStats>("frame_stats", (e) =>
    useSystemStore.getState().setFrameStats(e.payload),
  );

  await listen<NetworkStats>("network_stats", (e) =>
    useSystemStore.getState().setNetStats(e.payload),
  );

  await listen<GameInfo | null>("game_changed", (e) =>
    useGameStore.getState().setActiveGame(e.payload),
  );

  await listen<AntiCheatStatus>("anti_cheat_status", (e) =>
    useGameStore.getState().setAntiCheatActive(e.payload.active),
  );

  await listen<ActivityEntry>("change_log_update", (e) =>
    useTweakStore.getState().pushActivity(e.payload),
  );
}

/** Tray "Quick Optimize" (and future deep-links) navigate the UI. */
export async function listenNavigate(
  onNavigate: (page: string) => void,
): Promise<() => void> {
  if (!isTauri) return () => {};
  return listen<string>("navigate", (e) => onNavigate(e.payload));
}
