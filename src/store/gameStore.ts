import { create } from "zustand";
import type { GameInfo } from "../lib/types";

interface GameState {
  activeGame: GameInfo | null;
  installedGames: GameInfo[];
  /** UI toggle only until TweaksEngine lands (Checkpoint 9). */
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
  gameModeEnabled: false,
  antiCheatActive: false,

  setActiveGame: (activeGame) => set({ activeGame }),
  setInstalledGames: (installedGames) => set({ installedGames }),
  toggleGameMode: () =>
    set((s) => ({ gameModeEnabled: !s.gameModeEnabled })),
  setAntiCheatActive: (antiCheatActive) => set({ antiCheatActive }),
}));
