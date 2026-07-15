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
  BloatApp,
  JunkCategory,
  LargeFile,
  DupGroup,
  CleanResult,
  RamStatus,
  RamOptimizeResult,
  RestorePoint,
  FixInfo,
  HardwareProfile,
  SystemHealthReport,
  NetworkInfo,
  PingResponse,
  Profile,
  ScanResult,
  ServiceStatus,
  SettingsAdvice,
  GameSession,
  DetectiveReport,
  ReadyCheckItem,
  UpdateInfo,
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
    // No public release channel configured yet (or offline) → skip gracefully.
    // Never surface a raw error or block the app; you're not missing anything.
    console.warn("update check failed:", err);
    return { ok: false, message: "Couldn't check for updates right now — try again later." };
  }
}

/** Non-throwing update check for the in-app banner (never a browser page). */
export async function getUpdateInfo(): Promise<UpdateInfo | null> {
  if (!isTauri) return null;
  try {
    return await invoke<UpdateInfo>("get_update_info");
  } catch {
    return null;
  }
}

/** Download + install the update in-app (progress via events), then relaunch. */
export async function installUpdate(): Promise<void> {
  if (!isTauri) return;
  await invoke("install_update");
}

/** Current app version (fast, from the Rust ping). */
export async function getAppVersion(): Promise<string | null> {
  if (!isTauri) return null;
  try {
    const p = await invoke<{ appVersion: string }>("ping");
    return p.appVersion;
  } catch {
    return null;
  }
}

/** GitHub release notes for a version tag, or null (graceful — none yet = no-op). */
export async function fetchReleaseNotes(version: string): Promise<string | null> {
  try {
    const tag = version.startsWith("v") ? version : `v${version}`;
    const r = await fetch(`https://api.github.com/repos/Mujtweaks/MujifyTweak/releases/tags/${tag}`);
    if (!r.ok) return null;
    const j = (await r.json()) as { body?: string };
    const body = (j.body ?? "").trim();
    return body || null;
  } catch {
    return null;
  }
}

/** Open the local logs folder (%AppData%\MujifyTweaks\logs) in File Explorer. */
export async function openLogsFolder(): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke("open_logs_folder");
  } catch (err) {
    console.error("open_logs_folder failed:", err);
    toast.error("Couldn't open logs", "The logs folder isn't available.");
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

/** Game Settings Advisor — exact in-game graphics settings for this machine's
 *  hardware tier, plus an upscaler pick. Recommendations only; read-only. */
export async function getSettingsAdvice(
  gameName: string,
  installPath: string | null,
): Promise<SettingsAdvice | null> {
  if (!isTauri) return null;
  try {
    return await invoke<SettingsAdvice>("get_settings_advice", { gameName, installPath });
  } catch (err) {
    console.error("get_settings_advice failed:", err);
    return null;
  }
}

/** FPS Drop Detective — per-game session history (oldest→newest). Read-only. */
export async function getGameSessions(game: string): Promise<GameSession[]> {
  if (!isTauri) return [];
  try {
    return await invoke<GameSession[]>("get_game_sessions", { game });
  } catch {
    return [];
  }
}

/** The latest Detective report, if a game regressed below its baseline. */
export async function getDetectiveReport(): Promise<DetectiveReport | null> {
  if (!isTauri) return null;
  try {
    return await invoke<DetectiveReport | null>("get_detective_report");
  } catch {
    return null;
  }
}

/** Dismiss the current Detective report (user acknowledged it). */
export async function dismissDetectiveReport(): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke("dismiss_detective_report");
  } catch {
    /* ignore */
  }
}

/** Pre-game Ready Check — read-only pre-flight for the active game. */
export async function readyCheck(
  gameName: string | null,
  gameInstallPath: string | null,
): Promise<ReadyCheckItem[]> {
  if (!isTauri) return [];
  try {
    return await invoke<ReadyCheckItem[]>("ready_check", { gameName, gameInstallPath });
  } catch {
    return [];
  }
}

/** Build the plain-text system report for the Support hub (no keys, no name). */
export async function getSupportReport(activeGame: string | null): Promise<string> {
  if (!isTauri) return "";
  try {
    return await invoke<string>("get_support_report", { activeGame });
  } catch (err) {
    console.error("get_support_report failed:", err);
    return "";
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
    toast.errorHelp("Driver repair failed", String(err));
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

/** Read-only: every System Restore point on the machine. */
export async function listRestorePoints(): Promise<RestorePoint[]> {
  if (!isTauri) return [];
  try {
    return await invoke<RestorePoint[]>("list_restore_points");
  } catch (err) {
    console.error("list_restore_points failed:", err);
    return [];
  }
}

/** Read-only: is System Restore enabled for the system drive? */
export async function restoreProtectionEnabled(): Promise<boolean> {
  if (!isTauri) return false;
  try {
    return await invoke<boolean>("restore_protection_enabled");
  } catch {
    return false;
  }
}

/** Create a restore point (confirmed). Returns the honest result message. */
export async function createRestorePoint(description: string): Promise<boolean> {
  if (!isTauri) return false;
  try {
    const msg = await invoke<string>("create_restore_point", { description, confirm: true });
    toast.success("Restore point", msg);
    return true;
  } catch (err) {
    toast.warning("Restore point not created", String(err));
    return false;
  }
}

/** Delete ALL restore points (hard-confirmed, destructive — removes safety nets). */
export async function deleteAllRestorePoints(): Promise<boolean> {
  if (!isTauri) return false;
  try {
    const msg = await invoke<string>("delete_all_restore_points", { confirm: true });
    toast.success("Restore points", msg);
    return true;
  } catch (err) {
    toast.errorHelp("Delete failed", String(err));
    return false;
  }
}

/** Read-only: preinstalled Store bloat that's safe to remove (allowlisted). */
export async function scanBloatware(): Promise<BloatApp[]> {
  if (!isTauri) return [];
  try {
    return await invoke<BloatApp[]>("scan_bloatware");
  } catch (err) {
    console.error("scan_bloatware failed:", err);
    return [];
  }
}

/** Remove one allowlisted Store app (reinstallable from the Store, not a
 *  captured-state revert). Only ever called on the user's explicit click. */
export async function removeBloatware(app: BloatApp): Promise<boolean> {
  if (!isTauri) return false;
  try {
    await invoke("remove_bloatware", {
      friendly: app.name,
      packageFullName: app.packageFullName,
      confirm: true,
    });
    toast.success(`${app.name} removed`, "Reinstallable anytime from the Microsoft Store.");
    return true;
  } catch (err) {
    console.error("remove_bloatware failed:", err);
    toast.errorHelp("Removal failed", String(err));
    return false;
  }
}

// ---- Cleaner (all scans read-only; clean is confirm-gated) ----

/** Read-only: reclaimable junk categories with sizes. Changes nothing. */
export async function scanJunk(): Promise<JunkCategory[]> {
  if (!isTauri) return [];
  try {
    return await invoke<JunkCategory[]>("scan_junk");
  } catch (err) {
    console.error("scan_junk failed:", err);
    return [];
  }
}

/** Read-only: files ≥ min_mb under a folder, largest first. */
export async function scanLargeFiles(root: string, minMb: number): Promise<LargeFile[]> {
  if (!isTauri) return [];
  try {
    return await invoke<LargeFile[]>("scan_large_files", { root, minMb });
  } catch (err) {
    console.error("scan_large_files failed:", err);
    return [];
  }
}

/** Read-only: byte-identical duplicate files under a folder. */
export async function scanDuplicateFiles(root: string): Promise<DupGroup[]> {
  if (!isTauri) return [];
  try {
    return await invoke<DupGroup[]>("scan_duplicate_files", { root });
  } catch (err) {
    console.error("scan_duplicate_files failed:", err);
    return [];
  }
}

/** Delete the selected regenerable caches — only ever called on the user's
 *  explicit confirm. Returns bytes freed (a real, measured figure). */
export async function cleanJunk(categoryIds: string[]): Promise<CleanResult | null> {
  if (!isTauri) return null;
  try {
    return await invoke<CleanResult>("clean_junk", { categoryIds, confirm: true });
  } catch (err) {
    console.error("clean_junk failed:", err);
    toast.errorHelp("Clean failed", String(err));
    return null;
  }
}

/** Open Explorer with a file selected (read-only navigation). */
export async function revealInExplorer(path: string): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke("reveal_in_explorer", { path });
  } catch (err) {
    console.error("reveal_in_explorer failed:", err);
  }
}

// ---- RAM Optimizer (status read-only; optimize confirm-gated) ----

/** Read-only live memory status. */
export async function ramStatus(): Promise<RamStatus | null> {
  if (!isTauri) return null;
  try {
    return await invoke<RamStatus>("ram_status");
  } catch (err) {
    console.error("ram_status failed:", err);
    return null;
  }
}

/** Trim process working sets and report the REAL freed-memory delta. Only ever
 *  called on the user's explicit click. */
export async function optimizeRam(): Promise<RamOptimizeResult | null> {
  if (!isTauri) return null;
  try {
    return await invoke<RamOptimizeResult>("optimize_ram", { confirm: true });
  } catch (err) {
    console.error("optimize_ram failed:", err);
    toast.errorHelp("RAM optimize failed", String(err));
    return null;
  }
}

/** Apply one fix through the confirm + ChangeLog + rollback pipeline. `confirm`
 *  is only ever true here after the user clicks Apply in the confirmation modal. */
export async function applyFix(id: string): Promise<boolean> {
  if (!isTauri) return false;
  try {
    const entry = await invoke<{ description: string }>("apply_fix", { id, confirm: true });
    // Long-running / reboot-dependent fixes report honestly as "started", not
    // "done" — the backend stamps that note into the entry's description.
    const started = /started\b|runs in the background|restart is required/i.test(entry.description);
    if (started) {
      toast.info("Fix started", entry.description.replace(/^Fix:\s*[^.]*\.\s*/, ""));
    } else {
      toast.success("Fix applied", "Logged in the Change Log — revert there if it's reversible.");
    }
    return true;
  } catch (err) {
    console.error("apply_fix failed:", err);
    toast.errorHelp("Fix failed", String(err));
    return false;
  }
}

/** Services Manager — read-only. Reports each curated service's REAL start type
 *  and running state. Changing one goes through applyTweaks like anything else. */
export async function fetchServices(): Promise<ServiceStatus[]> {
  if (!isTauri) return [];
  try {
    return await invoke<ServiceStatus[]>("list_services");
  } catch (err) {
    console.error("list_services failed:", err);
    return [];
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
    toast.errorHelp("Apply failed", String(err));
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
    toast.errorHelp("Revert failed", String(err));
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
    toast.errorHelp("Revert failed", String(err));
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
