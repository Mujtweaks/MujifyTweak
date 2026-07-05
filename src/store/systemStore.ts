import { create } from "zustand";
import type {
  FrameStats,
  HardwareProfile,
  NetSample,
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
  /** Rolling network history for the latency graph (t: 60..0, 0 = now). */
  netHistory: NetSample[];

  // Network session tracking, derived live from the stream (never faked).
  netSessionStart: number | null;
  downPeakMbps: number | null;
  upPeakMbps: number | null;
  bestPingMs: number | null;
  worstPingMs: number | null;
  totalBytes: number;

  setBackend: (connected: boolean, version: string | null) => void;
  setStats: (stats: SystemStats) => void;
  setFrameStats: (stats: FrameStats) => void;
  setNetStats: (stats: NetworkStats) => void;
  setHardware: (hw: HardwareProfile) => void;
}

const NET_WINDOW = 60;

export const useSystemStore = create<SystemState>((set, get) => ({
  backendConnected: false,
  backendVersion: null,
  stats: null,
  frameStats: null,
  netStats: null,
  hardware: null,
  perfHistory: [],
  netHistory: [],
  netSessionStart: null,
  downPeakMbps: null,
  upPeakMbps: null,
  bestPingMs: null,
  worstPingMs: null,
  totalBytes: 0,

  setBackend: (connected, version) =>
    set({ backendConnected: connected, backendVersion: version }),

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

  setNetStats: (netStats) => {
    const s = get();
    // Rolling latency history.
    const shifted = s.netHistory
      .map((h) => ({ ...h, t: h.t - 1 }))
      .filter((h) => h.t >= 0);
    shifted.push({
      t: NET_WINDOW,
      ping: netStats.pingMs ?? undefined,
      jitter: netStats.jitterMs ?? undefined,
      loss: netStats.packetLossPercent,
    });

    // Session-derived extremes (all measured, never invented).
    const down = netStats.downMbps ?? null;
    const up = netStats.upMbps ?? null;
    const ping = netStats.pingMs ?? null;
    // Running integral of measured throughput → real cumulative bytes (~1.5s tick).
    const tickBytes = (((down ?? 0) + (up ?? 0)) * 1_000_000 * 1.5) / 8;
    set({
      netStats,
      netHistory: shifted,
      netSessionStart: s.netSessionStart ?? Date.now(),
      totalBytes: s.totalBytes + tickBytes,
      downPeakMbps: down != null ? Math.max(s.downPeakMbps ?? 0, down) : s.downPeakMbps,
      upPeakMbps: up != null ? Math.max(s.upPeakMbps ?? 0, up) : s.upPeakMbps,
      bestPingMs:
        ping != null ? Math.min(s.bestPingMs ?? Infinity, ping) : s.bestPingMs,
      worstPingMs:
        ping != null ? Math.max(s.worstPingMs ?? 0, ping) : s.worstPingMs,
    });
  },

  setHardware: (hardware) => set({ hardware }),
}));
