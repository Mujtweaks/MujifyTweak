import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./tauri";
import { useSystemStore } from "../store/systemStore";
import type {
  GameInfo,
  HardwareProfile,
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
    return await invoke<Profile>("save_profile", { profile });
  } catch (err) {
    console.error("save_profile failed:", err);
    return null;
  }
}

export async function deleteProfile(id: string): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke("delete_profile", { id });
  } catch (err) {
    console.error("delete_profile failed:", err);
  }
}
