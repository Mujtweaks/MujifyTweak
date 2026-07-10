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
  /** Mean GPU-busy time per frame (ms), when PresentMon reports it. */
  gpuBusyMs: number | null;
  /** Live bottleneck: "gpu" | "cpu" | "balanced". */
  bottleneck: string | null;
}

/** Emitted every ~2s by NetworkMonitor (Checkpoint 7) as "network_stats". */
export interface NetworkStats {
  pingMs: number | null;
  jitterMs: number | null;
  packetLossPercent: number;
  downMbps: number | null;
  upMbps: number | null;
}

/** One Windows System Restore point. */
export interface RestorePoint {
  sequence: number;
  description: string;
  created: string;
  kind: string;
}

/** One removable preinstalled Store app (Debloat). */
export interface BloatApp {
  name: string;
  category: string;
  packageFullName: string;
  reinstallable: boolean;
}

/** One graphics adapter. */
export interface GpuInfo {
  name: string;
  vendor: string;
  driver: string | null;
}

/** Returned by HardwareProfiler (Checkpoint 2). */
export interface HardwareProfile {
  cpuName: string;
  cpuVendor: string;
  cpuCores: number;
  cpuThreads: number;
  cpuBaseClockMhz: number | null;
  gpuName: string;
  gpuVendor: string;
  gpuDriverVersion: string | null;
  gpus: GpuInfo[];
  npuName: string | null;
  ramTotalGb: number;
  ramSpeedMhz: number | null;
  ramType: string | null;
  storageSummary: string;
  storageKind: string | null;
  motherboard: string | null;
  isLaptop: boolean | null;
  chassis: string;
  onBattery: boolean;
  osEdition: string | null;
  osBuild: string | null;
  isCopilotPlus: boolean;
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
  pingMs: number | null;
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
  appliedTweaks: string[];
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

/** One misconfiguration found by the Bottleneck / Health Scan. */
export interface HealthFinding {
  id: string;
  title: string;
  detail: string;
  severity: "critical" | "warning" | "info";
  fpsCost: string;
  fixable: "one-click" | "bios" | "manual" | "detection-only";
}

export interface SystemHealthReport {
  findings: HealthFinding[];
  scannedAt: number;
  problems: number;
}

/** Hardware tier classification driving the Game Settings Advisor. */
export interface HardwareTier {
  gpuTier: string; // integrated | entry | mid | high | ultra | unknown
  gpuModel: string;
  gpuVendor: string;
  gpuKnown: boolean;
  vramGb: number | null;
  cpuTier: string; // entry | mid | high | unknown
  cpuName: string;
  cpuCores: number;
  ramGb: number;
  upscalers: string[]; // best-first subset of dlss/xess/fsr
}

/** One in-game setting recommendation, resolved for this machine's GPU tier. */
export interface ResolvedRec {
  setting: string;
  value: string;
  impact: string; // low | medium | high (never a fabricated %)
  visualCost: string; // none | minor | noticeable
  why: string;
}

export interface UpscalerAdvice {
  upscaler: string; // DLSS | XeSS | FSR | TSR
  quality: string;
  impact: string;
  why: string;
}

export interface SettingsAdvice {
  source: string; // preset | engine | universal
  reason: string;
  gameName: string;
  hardware: HardwareTier;
  recommendations: ResolvedRec[];
  upscaler: UpscalerAdvice | null;
}

/** FPS Drop Detective — one recorded gaming session (real measured data only). */
export interface GameSession {
  schemaVersion: number;
  game: string;
  date: number;
  durationSecs: number;
  avgFps: number | null;
  onePercentLow: number | null;
  stabilityMs: number | null;
  bottleneck: string | null;
  avgCpuTempC: number | null;
  avgGpuTempC: number | null;
  activeTweaks: string[];
}

/** One entry in the system change journal ("here's what changed"). */
export interface JournalEntry {
  timestamp: number;
  kind: string;
  summary: string;
  action: string | null; // driver_rollback | health_scan | power_high_perf | max_refresh_rate
}

/** In-app updater status for the update banner/modal. */
export interface UpdateInfo {
  available: boolean;
  version: string;
  current: string;
}

/** One pre-game Ready Check line (read-only pre-flight). */
export interface ReadyCheckItem {
  label: string;
  ok: boolean;
  detail: string;
  action: string | null;
  informational: boolean;
}

/** The Detective's report card when a game regresses below its baseline. */
export interface DetectiveReport {
  game: string;
  dropPct: number;
  baselineFps: number;
  currentFps: number;
  changes: JournalEntry[];
  generatedAt: number;
}

/** A device/driver reporting a problem (Device Manager ConfigManagerErrorCode). */
export interface DeviceIssue {
  name: string;
  class: string;
  instanceId: string;
  errorCode: number;
  errorText: string;
}

/** A repair in the Fixes Hub (from resources/fixes.json). */
export interface FixInfo {
  id: string;
  title: string;
  description: string;
  category: string;
  risk: string;
  action: string;
  what: string;
  changes: string;
  reversible: boolean;
}

/** One region's latency in the Game Server Ping Tester. pingMs null = no reply. */
export interface RegionPing {
  region: string;
  host: string;
  pingMs: number | null;
}

export interface GameServersResult {
  id: string;
  name: string;
  appId: string | null;
  regions: RegionPing[];
}

/** A game we can ping (for the Ping Optimizer grid), without ping data. */
export interface GameCatalogEntry {
  id: string;
  name: string;
  appId: string | null;
}

/** One recommended (or not-recommended) tweak for a game, with the reason. */
export interface TweakRec {
  id: string;
  why: string;
}

/** Per-game recommended tweak preset from the bundled database. */
export interface GameRecProfile {
  match?: string[];
  name: string;
  impact: string;
  recommended: TweakRec[];
  notRecommended: TweakRec[];
}

/** Universal per-game profile: preset, engine-detected, or safe generic. */
export interface GameProfileResult {
  gameName: string;
  source: "preset" | "engine" | "generic";
  engine: string | null;
  bottleneck: string | null;
  reason: string;
  impact: string;
  recommended: TweakRec[];
  notRecommended: TweakRec[];
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
  /** Opt-in auto-apply on launch (only acts when the master switch is also on). */
  autoApply?: boolean;
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
