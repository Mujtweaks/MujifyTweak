/**
 * AI Assistant credentials.
 *
 * Keys are NOT stored in this bundle (that would let anyone read them from the
 * installed app's WebView source). They live in
 * %AppData%\Roaming\MujifyTweaks\config.json and are fetched at runtime through
 * the Rust `get_api_key` / `set_api_key` commands. Settings writes them; here we
 * only read them.
 */

import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./tauri";

export const NEMOTRON_MODEL = "nvidia/nemotron-3-ultra-550b-a55b";
export const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";

export async function nvidiaKey(): Promise<string | null> {
  if (!isTauri) return null;
  try {
    return await invoke<string | null>("get_api_key", { key: "nvidia" });
  } catch {
    return null;
  }
}

export async function tavilyKey(): Promise<string | null> {
  if (!isTauri) return null;
  try {
    return await invoke<string | null>("get_api_key", { key: "tavily" });
  } catch {
    return null;
  }
}

export async function saveApiKey(key: "nvidia" | "tavily", value: string): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke("set_api_key", { key, value });
  } catch {
    /* ignore — surfaced by the caller's own state */
  }
}
