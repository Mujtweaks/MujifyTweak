// Anonymous online-status ping — the ONLY thing the app ever sends anywhere.
// ON by default and openly disclosed on the first-run welcome screen ("turn it
// off anytime in Settings" → the toggle lives in Settings → Privacy). The payload
// contains NOTHING but the app version: no name, no machine id, no UUID. A failed
// ping never disrupts the app.
import { invoke } from "@tauri-apps/api/core";
import { ANALYTICS_ENDPOINT } from "./links";
import { isTauri } from "./tauri";
import { useSettingsStore } from "../store/settingsStore";

let cachedVersion: string | null = null;

async function version(): Promise<string> {
  if (cachedVersion) return cachedVersion;
  try {
    if (isTauri) {
      const p = await invoke<{ appVersion: string }>("ping");
      cachedVersion = p.appVersion;
    }
  } catch {
    /* ignore */
  }
  return cachedVersion ?? "unknown";
}

async function beat() {
  if (!ANALYTICS_ENDPOINT) return; // not deployed yet
  if (!useSettingsStore.getState().shareOnlineStatus) return; // user turned it off
  try {
    await fetch(ANALYTICS_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ v: await version() }),
      keepalive: true,
    });
  } catch {
    /* analytics must never affect the app — swallow everything */
  }
}

/** Start the 5-minute anonymous heartbeat (safe to call once at startup).
 *  Real app only — browser dev previews must never inflate the counter. */
export function startHeartbeat() {
  if (!isTauri) return;
  void beat();
  window.setInterval(() => void beat(), 5 * 60 * 1000);
}
