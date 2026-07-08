// src/store/settingsStore.ts
//
// Small app-level preferences that live on this PC only (localStorage). Right
// now: whether the AI assistant is enabled. Kept separate from aiStore so the
// toggle survives even when the chat session is cleared.
import { create } from "zustand";

const AI_ENABLED_KEY = "mujify.aiEnabled";

function readAiEnabled(): boolean {
  try {
    return localStorage.getItem(AI_ENABLED_KEY) !== "false";
  } catch {
    return true;
  }
}

interface SettingsState {
  aiEnabled: boolean;
  setAiEnabled: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  aiEnabled: readAiEnabled(),
  setAiEnabled: (v) => {
    try {
      localStorage.setItem(AI_ENABLED_KEY, String(v));
    } catch {
      /* ignore storage errors */
    }
    set({ aiEnabled: v });
  },
}));
