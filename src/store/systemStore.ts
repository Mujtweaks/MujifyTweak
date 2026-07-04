import { create } from "zustand";
import type {
  FrameStats,
  HardwareProfile,
  NetworkStats,
  PerfSample,
  SystemStats,
} from "../lib/types";

interface SystemState {
  backendConnected: boolean;
  backendVersion: string | null;
  stats: SystemStats | null;
  frameStats: FrameStats | null;
  netStats: NetworkStats | null;
  hardware: HardwareProfile | null;
  /** Rolling 61-sample window (t: 0..60, 60 = now) for the live chart. */
  perfHistory: PerfSample[];

  setBackend: (connected: boolean, version: string | null) => void;
  setStats: (stats: SystemStats) => void;
  setFrameStats: (stats: FrameStats) => void;
  setNetStats: (stats: NetworkStats) => void;
  setHardware: (hw: HardwareProfile) => void;
}

export const useSystemStore = create<SystemState>((set, get) => ({
  backendConnected: false,
  backendVersion: null,
  stats: null,
  frameStats: null,
  netStats: null,
  hardware: null,
  perfHistory: [],

  setBackend: (connected, version) =>
    set({ backendConnected: connected, backendVersion: version }),

  // Each system_stats tick also pushes one sample into the rolling chart window.
  setStats: (stats) => {
    const prev = get().perfHistory;
    const shifted = prev
      .map((s) => ({ ...s, t: s.t - 1 }))
      .filter((s) => s.t >= 0);
    shifted.push({
      t: 60,
      cpu: stats.cpuUsagePercent,
      gpu: stats.gpuUsagePercent ?? undefined,
      fps: get().frameStats?.avgFps,
    });
    set({ stats, perfHistory: shifted });
  },

  setFrameStats: (frameStats) => set({ frameStats }),
  setNetStats: (netStats) => set({ netStats }),
  setHardware: (hardware) => set({ hardware }),
}));
