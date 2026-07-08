import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./tauri";
import { useSystemStore } from "../store/systemStore";
import { toast } from "../store/toastStore";
import type {
  ApplyOutcome,
  BenchAverages,
  BenchmarkReport,
  ChangeLogEntry,
  GameCatalogEntry,
  GameInfo,
  GameProfileResult,
  GameRecProfile,
  GameServersResult,
  DeviceIssue,
  FixInfo,
  HardwareProfile,
  SystemHealthReport,
  NetworkInfo,
  PingResponse,
  Profile,
  ScanResult,
} from "./types";

/**
 * Checkpoint 1 — IPC proof-of-life. The System Guard card renders the result.
 * If the ping fails the UI says so; nothing here is faked.
 */
export async function connectBackend(): Promise<void> {
  if (!isTauri) return;
  try {
    const res = await invoke<PingResponse>("ping");
    useSystemStore.getState().setBackend(res.status === "ok", res.appVersion);
  } catch (err) {
    console.error("backend ping failed:", err);
    useSystemStore.getState().setBackend(false, null);
  }
}

/** Ask the Tauri updater plugin to check for a new release. */
export async function checkForUpdates(): Promise<{ ok: boolean; message: string }> {
  if (!isTauri) return { ok: false, message: "Updates are only available in the desktop app." };
  try {
    const message = await invoke<string>("check_for_updates");
    return { ok: true, message };
  } catch (err) {
    return { ok: false, message: String(err) };
  }
}

/** Checkpoint 2 — full hardware profile (cached in Rust). */
export async function fetchHardware(): Promise<void> {
  if (!isTauri) return;
  try {
    const hw = await invoke<HardwareProfile>("get_hardware_profile");
    useSystemStore.getState().setHardware(hw);
  } catch (err) {
    console.error("get_hardware_profile failed:", err);
  }
}

/** Checkpoint 8 (scan half) — read current tweak state. Reads only, applies nothing. */
export async function scanTweaks(isLaptop: boolean | null): Promise<ScanResult | null> {
  if (!isTauri) return null;
  try {
    return await invoke<ScanResult>("scan_tweaks", { isLaptop });
  } catch (err) {
    console.error("scan_tweaks failed:", err);
    return null;
  }
}

/** Per-game recommended tweak preset (read-only lookup, applies nothing). */
export async function getRecommendedTweaks(gameName: string): Promise<GameRecProfile | null> {
  if (!isTauri) return null;
  try {
    return await invoke<GameRecProfile | null>("get_recommended_tweaks", { gameName });
  } catch (err) {
    console.error("get_recommended_tweaks failed:", err);
    return null;
  }
}

/** Universal per-game profile: preset, engine-detected, or safe generic. Always
 *  returns a real profile (read-only — applies nothing). */
export async function getGameProfile(
  gameName: string,
  installPath: string | null,
): Promise<GameProfileResult | null> {
  if (!isTauri) return null;
  try {
    return await invoke<GameProfileResult>("get_game_profile", { gameName, installPath });
  } catch (err) {
    console.error("get_game_profile failed:", err);
    return null;
  }
}

/** Bottleneck / Health Scan — detects real misconfigurations. Read-only, fixes nothing. */
export async function scanSystemHealth(
  gameName: string | null,
  gameInstallPath: string | null,
): Promise<SystemHealthReport | null> {
  if (!isTauri) return null;
  try {
    return await invoke<SystemHealthReport>("scan_system_health", { gameName, gameInstallPath });
  } catch (err) {
    console.error("scan_system_health failed:", err);
    return null;
  }
}

/** Driver Health — every device reporting a problem, in plain English. Read-only. */
export async function scanDeviceHealth(): Promise<DeviceIssue[]> {
  if (!isTauri) return [];
  try {
    return await invoke<DeviceIssue[]>("scan_device_health");
  } catch (err) {
    console.error("scan_device_health failed:", err);
    return [];
  }
}

/** Safe driver repair: restore point + Windows driver re-scan. `confirm` is only
 *  ever true here after the user clicks through the confirmation modal. */
export async function repairDrivers(): Promise<string | null> {
  if (!isTauri) return null;
  try {
    const msg = await invoke<string>("repair_drivers", { confirm: true });
    toast.success("Driver repair started", msg);
    return msg;
  } catch (err) {
    console.error("repair_drivers failed:", err);
    toast.error("Driver repair failed", String(err));
    return null;
  }
}

/** Fixes Hub catalog (read-only). */
export async function scanFixes(): Promise<FixInfo[]> {
  if (!isTauri) return [];
  try {
    return await invoke<FixInfo[]>("scan_fixes");
  } catch (err) {
    console.error("scan_fixes failed:", err);
    return [];
  }
}

/** Apply one fix through the confirm + ChangeLog + rollback pipeline. `confirm`
 *  is only ever true here after the user clicks Apply in the confirmation modal. */
export async function applyFix(id: string): Promise<boolean> {
  if (!isTauri) return false;
  try {
    await invoke("apply_fix", { id, confirm: true });
    toast.success("Fix applied", "Logged in the Change Log — revert there if it's reversible.");
    return true;
  } catch (err) {
    console.error("apply_fix failed:", err);
    toast.error("Fix failed", String(err));
    return false;
  }
}

/** Checkpoint 4 — installed games across launchers (read-only library scan). */
export async function fetchInstalledGames(): Promise<GameInfo[]> {
  if (!isTauri) return [];
  try {
    return await invoke<GameInfo[]>("get_installed_games");
  } catch (err) {
    console.error("get_installed_games failed:", err);
    return [];
  }
}

/** Game Server Ping Tester — real ICMP to per-region reference nodes. Read-only.
 *  Pass a gameId to ping just one game (Ping Optimizer), or omit for all. */
export async function pingGameServers(gameId?: string): Promise<GameServersResult[]> {
  if (!isTauri) return [];
  try {
    return await invoke<GameServersResult[]>("ping_game_servers", { gameId: gameId ?? null });
  } catch (err) {
    console.error("ping_game_servers failed:", err);
    toast.error("Ping test failed", String(err));
    return [];
  }
}

/** Bandwidth speed test — real HTTP transfer to Cloudflare. Returns Mbps. Read-only. */
export async function speedTestDownload(): Promise<number | null> {
  if (!isTauri) return null;
  try {
    return await invoke<number>("speed_test_download");
  } catch (err) {
    console.error("speed_test_download failed:", err);
    toast.error("Download test failed", String(err));
    return null;
  }
}

export async function speedTestUpload(): Promise<number | null> {
  if (!isTauri) return null;
  try {
    return await invoke<number>("speed_test_upload");
  } catch (err) {
    console.error("speed_test_upload failed:", err);
    toast.error("Upload test failed", String(err));
    return null;
  }
}

/** The pingable game list for the Ping Optimizer grid (no ping data). Read-only. */
export async function getGameCatalog(): Promise<GameCatalogEntry[]> {
  if (!isTauri) return [];
  try {
    return await invoke<GameCatalogEntry[]>("list_game_catalog");
  } catch (err) {
    console.error("list_game_catalog failed:", err);
    return [];
  }
}

/** Read-only adapter details (IP/gateway/DNS/type) for the Network page. */
export async function getNetworkInfo(): Promise<NetworkInfo | null> {
  if (!isTauri) return null;
  try {
    return await invoke<NetworkInfo>("get_network_info");
  } catch (err) {
    console.error("get_network_info failed:", err);
    return null;
  }
}

/** Checkpoint 11 (storage half) — profile CRUD. */
export async function listProfiles(): Promise<Profile[]> {
  if (!isTauri) return [];
  try {
    return await invoke<Profile[]>("list_profiles");
  } catch (err) {
    console.error("list_profiles failed:", err);
    return [];
  }
}

export async function saveProfile(profile: Profile): Promise<Profile | null> {
  if (!isTauri) return null;
  try {
    const saved = await invoke<Profile>("save_profile", { profile });
    toast.success("Profile saved", profile.gameName ? `Settings stored for ${profile.gameName}.` : undefined);
    return saved;
  } catch (err) {
    console.error("save_profile failed:", err);
    toast.error("Couldn't save profile", String(err));
    return null;
  }
}

export async function deleteProfile(id: string): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke("delete_profile", { id });
    toast.success("Profile deleted");
  } catch (err) {
    console.error("delete_profile failed:", err);
    toast.error("Couldn't delete profile", String(err));
  }
}

// ---- Apply / rollback (Checkpoints 8b–10) -----------------------------------
// `confirm: true` is only ever passed after the user confirms in the modal.

export async function applyTweaks(
  ids: string[],
  antiCheatActive: boolean,
): Promise<ApplyOutcome | null> {
  if (!isTauri) return null;
  try {
    const outcome = await invoke<ApplyOutcome>("apply_tweaks", {
      ids,
      confirm: true,
      antiCheatActive,
    });
    const n = outcome.applied.length;
    const blocked = outcome.blocked.length;
    if (n > 0) {
      toast.success(
        `${n} tweak${n === 1 ? "" : "s"} applied`,
        blocked > 0
          ? `${blocked} blocked by the anti-cheat guard.`
          : "Every change is logged and reversible.",
      );
    } else if (blocked > 0) {
      toast.warning(
        "Nothing applied",
        `${blocked} tweak${blocked === 1 ? "" : "s"} blocked by the anti-cheat guard.`,
      );
    }
    return outcome;
  } catch (err) {
    console.error("apply_tweaks failed:", err);
    toast.error("Apply failed", String(err));
    return null;
  }
}

export async function revertSingle(entryId: string): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke("revert_single", { entryId, confirm: true });
    toast.success("Tweak reverted", "Restored to its previous value.");
  } catch (err) {
    console.error("revert_single failed:", err);
    toast.error("Revert failed", String(err));
  }
}

export async function revertAll(): Promise<number> {
  if (!isTauri) return 0;
  try {
    const n = await invoke<number>("revert_all", { confirm: true });
    if (n > 0) toast.success(`${n} tweak${n === 1 ? "" : "s"} reverted`, "All changes rolled back.");
    return n;
  } catch (err) {
    console.error("revert_all failed:", err);
    toast.error("Revert failed", String(err));
    return 0;
  }
}

/** Tweak ids that were applied but Windows has since reset (offer re-apply). */
export async function checkResetTweaks(): Promise<string[]> {
  if (!isTauri) return [];
  try {
    return await invoke<string[]>("check_reset_tweaks");
  } catch (err) {
    console.error("check_reset_tweaks failed:", err);
    return [];
  }
}

export async function getChangeLog(): Promise<ChangeLogEntry[]> {
  if (!isTauri) return [];
  try {
    return await invoke<ChangeLogEntry[]>("get_change_log");
  } catch (err) {
    console.error("get_change_log failed:", err);
    return [];
  }
}

// ---- Proof loop (Checkpoints 13–15) -----------------------------------------

export async function runBenchmark(
  phase: "baseline" | "post",
  gameName: string | null,
): Promise<BenchAverages | null> {
  if (!isTauri) return null;
  try {
    return await invoke<BenchAverages>("run_benchmark", { phase, gameName });
  } catch (err) {
    console.error("run_benchmark failed:", err);
    return null;
  }
}

export async function getLatestReport(): Promise<BenchmarkReport | null> {
  if (!isTauri) return null;
  try {
    return await invoke<BenchmarkReport | null>("get_latest_report");
  } catch (err) {
    console.error("get_latest_report failed:", err);
    return null;
  }
}
