import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { GameInfo } from "../lib/types";

const readGameMode = (): boolean => {
  try { return localStorage.getItem("mujify.gameMode") === "1"; } catch { return false; }
};

interface GameState {
  activeGame: GameInfo | null;
  installedGames: GameInfo[];
  /** Wired to Windows' own Game Mode (persisted + real reg toggle). */
  gameModeEnabled: boolean;
  antiCheatActive: boolean;

  setActiveGame: (game: GameInfo | null) => void;
  setInstalledGames: (games: GameInfo[]) => void;
  toggleGameMode: () => void;
  setAntiCheatActive: (active: boolean) => void;
}

export const useGameStore = create<GameState>((set) => ({
  activeGame: null,
  installedGames: [],
  gameModeEnabled: readGameMode(),
  antiCheatActive: false,

  setActiveGame: (activeGame) => set({ activeGame }),
  setInstalledGames: (installedGames) => set({ installedGames }),
  toggleGameMode: () =>
    set((s) => {
      const next = !s.gameModeEnabled;
      try { localStorage.setItem("mujify.gameMode", next ? "1" : "0"); } catch { /* ignore */ }
      // Flip Windows' real Game Mode setting (best-effort; UI reflects intent).
      void invoke("set_game_mode", { enabled: next }).catch(() => {});
      return { gameModeEnabled: next };
    }),
  setAntiCheatActive: (antiCheatActive) => set({ antiCheatActive }),
}));
