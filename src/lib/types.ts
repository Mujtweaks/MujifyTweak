/**
 * Shared shapes mirroring the Rust backend payloads (all camelCase).
 * Live-stat fields are null in the stores until a real backend event delivers
 * them — the UI never invents a number.
 */

export interface PingResponse {
  status: string;
  appVersion: string;
  timestampUtc: string;
}

export interface HealthScores {
  cpu: number;
  gpu: number;
  memory: number;
  storage: number;
  stability: number;
}

/** Emitted 1/s by SystemMonitor (Checkpoint 3) as "system_stats". */
export interface SystemStats {
  cpuUsagePercent: number;
  cpuPerCore: number[];
  cpuTempC: number | null;
  gpuUsagePercent: number | null;
  gpuTempC: number | null;
  gpuVramUsedMb: number | null;
  ramUsedGb: number;
  ramTotalGb: number;
  ramUsagePercent: number;
  diskReadMbS: number | null;
  diskWriteMbS: number | null;
  diskActivityPercent: number | null;
  systemScore: number;
  bottleneck: string;
  bottleneckDetail: string;
  activePowerPlan: string | null;
  health: HealthScores;
}

/** Emitted 1/s by FrameTimeMonitor (Checkpoint 6) as "frame_stats". */
export interface FrameStats {
  avgFps: number;
  onePercentLow: number;
  pointOnePercentLow: number;
  avgFrameTimeMs: number;
  frameTimeStability: number;
}

/** Emitted every ~2s by NetworkMonitor (Checkpoint 7) as "network_stats". */
export interface NetworkStats {
  pingMs: number | null;
  jitterMs: number | null;
  packetLossPercent: number;
  downMbps: number | null;
  upMbps: number | null;
}

/** Returned by HardwareProfiler (Checkpoint 2). */
export interface HardwareProfile {
  cpuName: string;
  cpuCores: number;
  cpuThreads: number;
  cpuBaseClockMhz: number | null;
  gpuName: string;
  gpuVendor: string;
  gpuDriverVersion: string | null;
  ramTotalGb: number;
  ramSpeedMhz: number | null;
  ramType: string | null;
  storageSummary: string;
  storageKind: string | null;
  motherboard: string | null;
  isLaptop: boolean | null;
}

/** GameDetector (Checkpoint 4) — active game + installed library entries. */
export interface GameInfo {
  name: string;
  exe: string;
  launcher: string | null;
  installPath: string | null;
}

export interface AntiCheatStatus {
  active: boolean;
  detected: string[];
}

export type RiskLevel = "safe" | "moderate" | "advanced";

export type TweakCategory =
  | "system-performance"
  | "graphics-display"
  | "network-optimization"
  | "windows-services"
  | "storage-optimization"
  | "game-input";

export interface TweakInfo {
  id: string;
  title: string;
  description: string;
  category: TweakCategory;
  risk: RiskLevel;
  applied: boolean;
  available: boolean;
}

export interface CategorySummary {
  category: TweakCategory;
  total: number;
  applied: number;
  available: number;
}

export interface ScanResult {
  tweaks: TweakInfo[];
  categories: CategorySummary[];
  total: number;
  applied: number;
}

export interface Profile {
  schemaVersion: number;
  id: string;
  gameName: string;
  gameExe: string | null;
  launcher: string | null;
  preset: string;
  launchOptions: string | null;
  enabledTweaks: string[];
  createdAt: string;
  lastPlayed: string | null;
  avgFpsBefore: number | null;
  avgFpsAfter: number | null;
}

/** One rolling sample of the live performance chart (t: 0..60, 60 = now). */
export interface PerfSample {
  t: number;
  fps?: number;
  cpu?: number;
  gpu?: number;
}

/** Plain-English activity feed row. */
export interface ActivityEntry {
  id: string;
  kind: "power" | "tweak" | "network" | "scan" | "info";
  text: string;
  timestamp: number;
  status: "ok" | "warn";
}
