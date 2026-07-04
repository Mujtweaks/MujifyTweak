import { create } from "zustand";
import type { ActivityEntry, ScanResult } from "../lib/types";

interface TweakState {
  /** Plain-English feed shown in RecentActivity; fed by change_log_update events. */
  activity: ActivityEntry[];
  lastOptimizedAt: number | null;
  /** Live power plan name — null until read from the real system (Checkpoint 8). */
  powerPlan: string | null;
  networkTier: string | null;
  systemStatus: string | null;

  /** Result of the last read-only scan_tweaks call (Checkpoint 8 scan half). */
  scanResult: ScanResult | null;
  lastScanAt: number | null;
  /** Tweak IDs the user has selected to apply (selection only — nothing runs). */
  selected: Set<string>;

  pushActivity: (entry: ActivityEntry) => void;
  setPowerPlan: (plan: string | null) => void;
  setLastOptimizedAt: (ts: number | null) => void;
  setScan: (result: ScanResult) => void;
  setSelected: (ids: Set<string>) => void;
}

export const useTweakStore = create<TweakState>((set) => ({
  activity: [],
  lastOptimizedAt: null,
  powerPlan: null,
  networkTier: null,
  systemStatus: null,
  scanResult: null,
  lastScanAt: null,
  selected: new Set(),

  pushActivity: (entry) =>
    set((s) => ({ activity: [entry, ...s.activity].slice(0, 100) })),
  setPowerPlan: (powerPlan) => set({ powerPlan }),
  setLastOptimizedAt: (lastOptimizedAt) => set({ lastOptimizedAt }),
  setScan: (scanResult) => set({ scanResult, lastScanAt: Date.now() }),
  setSelected: (selected) => set({ selected: new Set(selected) }),
}));
