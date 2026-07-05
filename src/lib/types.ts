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
  /** Steam appid when known — used to load real header art. */
  appId: string | null;
}

export interface AntiCheatStatus {
  active: boolean;
  detected: string[];
}

/** Read-only adapter details for the Network page. */
export interface NetworkInfo {
  adapterName: string | null;
  ipAddress: string | null;
  gateway: string | null;
  dnsServer: string | null;
  connectionType: string | null;
}

/** One rolling network sample for the latency graph (t: seconds ago, 0 = now). */
export interface NetSample {
  t: number;
  ping?: number;
  jitter?: number;
  loss?: number;
}

export type RiskLevel = "safe" | "moderate" | "advanced";

export type TweakCategory =
  | "system"
  | "performance"
  | "network"
  | "graphics"
  | "privacy"
  | "gaming";

export interface TweakInfo {
  id: string;
  title: string;
  description: string;
  category: TweakCategory;
  risk: RiskLevel;
  /** 1–5 performance impact rating. */
  impact: number;
  applied: boolean;
  available: boolean;
  /** Real, tested apply path exists — otherwise the UI shows it scan-only. */
  appliable: boolean;
}

export interface ChangeLogEntry {
  id: string;
  timestamp: number;
  tweakId: string;
  description: string;
  riskLevel: RiskLevel;
  reversible: boolean;
  undone: boolean;
}

export interface ApplyOutcome {
  applied: ChangeLogEntry[];
  blocked: string[];
}

export interface BenchAverages {
  samples: number;
  cpuUsage: number;
  gpuUsage: number | null;
  ramUsage: number;
  systemScore: number;
  avgFps: number | null;
}

export interface MetricDelta {
  label: string;
  before: number | null;
  after: number | null;
  deltaPct: number | null;
  better: "higher" | "lower";
  measured: boolean;
}

export interface BenchmarkReport {
  gameName: string | null;
  createdAt: number;
  baseline: BenchAverages;
  post: BenchAverages;
  metrics: MetricDelta[];
  verdict: string;
  fpsMeasured: boolean;
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
