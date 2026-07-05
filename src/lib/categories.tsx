import {
  Cpu,
  Gamepad2,
  Gauge,
  Globe,
  Lock,
  Monitor,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import type { RiskLevel, TweakCategory } from "./types";

export const CATEGORY_META: Record<
  TweakCategory,
  { label: string; subtitle: string; icon: LucideIcon; color: string }
> = {
  system: {
    label: "System",
    subtitle: "Windows services, startup and memory",
    icon: Settings2,
    color: "#f97316",
  },
  performance: {
    label: "Performance",
    subtitle: "CPU, timer resolution and latency",
    icon: Gauge,
    color: "#e3000e",
  },
  network: {
    label: "Network",
    subtitle: "Latency, throughput and DNS",
    icon: Globe,
    color: "#3b82f6",
  },
  graphics: {
    label: "Graphics",
    subtitle: "GPU, display and frame pacing",
    icon: Monitor,
    color: "#a855f7",
  },
  privacy: {
    label: "Privacy",
    subtitle: "Telemetry, tracking and background data",
    icon: Lock,
    color: "#14b8a6",
  },
  gaming: {
    label: "Gaming",
    subtitle: "Input latency and game settings",
    icon: Gamepad2,
    color: "#22c55e",
  },
};

/** Display boost % for a tweak's 1–5 impact (RIP-style headline number). */
export function boostPct(impact: number): number {
  return { 1: 3, 2: 7, 3: 11, 4: 21, 5: 35 }[impact] ?? impact * 5;
}

export const CATEGORY_ORDER: TweakCategory[] = [
  "system",
  "performance",
  "network",
  "graphics",
  "privacy",
  "gaming",
];

export const CPU_ICON = Cpu;

export const RISK_META: Record<RiskLevel, { label: string; cls: string }> = {
  safe: { label: "Safe", cls: "text-good border-good/30 bg-good/10" },
  moderate: { label: "Moderate", cls: "text-warn border-warn/30 bg-warn/10" },
  advanced: { label: "Advanced", cls: "text-accent border-accent/30 bg-accent/10" },
};

/** Which risk levels a preset is willing to enable (selection only). */
export const PRESET_RISK: Record<string, RiskLevel[]> = {
  ultimate: ["safe", "moderate", "advanced"],
  balanced: ["safe", "moderate"],
  power_saving: ["safe"],
};
