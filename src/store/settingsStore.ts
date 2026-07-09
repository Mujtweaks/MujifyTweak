// src/store/settingsStore.ts
//
// Small app-level preferences that live on this PC only (localStorage) — no
// account, nothing leaves the machine. Includes the AI toggle, the user's
// chosen name (personalization), the pre-game Ready Check toggle, and the
// anonymous online-status ping (on by default, disclosed at first run).
import { create } from "zustand";

const KEYS = {
  ai: "mujify.aiEnabled",
  name: "mujify.userName",
  readyCheck: "mujify.readyCheck",
  shareOnline: "mujify.shareOnline",
};

function read(key: string, def: string): string {
  try {
    return localStorage.getItem(key) ?? def;
  } catch {
    return def;
  }
}
function write(key: string, val: string) {
  try {
    localStorage.setItem(key, val);
  } catch {
    /* ignore storage errors */
  }
}

interface SettingsState {
  aiEnabled: boolean;
  /** The name the user chose on first run (local only). "" → falls back to "GAMER". */
  userName: string;
  readyCheckEnabled: boolean;
  /** Send a single anonymous "online" ping (version only). ON by default —
   *  openly disclosed on the first-run welcome screen; one-click off here. */
  shareOnlineStatus: boolean;
  setAiEnabled: (v: boolean) => void;
  setUserName: (v: string) => void;
  setReadyCheckEnabled: (v: boolean) => void;
  setShareOnlineStatus: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  aiEnabled: read(KEYS.ai, "true") !== "false",
  userName: read(KEYS.name, ""),
  readyCheckEnabled: read(KEYS.readyCheck, "true") !== "false",
  shareOnlineStatus: read(KEYS.shareOnline, "true") !== "false",
  setAiEnabled: (v) => {
    write(KEYS.ai, String(v));
    set({ aiEnabled: v });
  },
  setUserName: (v) => {
    write(KEYS.name, v);
    set({ userName: v });
  },
  setReadyCheckEnabled: (v) => {
    write(KEYS.readyCheck, String(v));
    set({ readyCheckEnabled: v });
  },
  setShareOnlineStatus: (v) => {
    write(KEYS.shareOnline, String(v));
    set({ shareOnlineStatus: v });
  },
}));

/** The display name to greet the user with — their chosen name, or "GAMER". */
export function displayName(name: string): string {
  const n = name.trim();
  return n.length > 0 ? n : "GAMER";
}
