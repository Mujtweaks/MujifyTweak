import {
  Cpu,
  Gamepad2,
  Gauge,
  Globe,
  Lock,
  Monitor,
  Palette,
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
  appearance: {
    label: "Appearance",
    subtitle: "Best-performance visuals, minimal Windows",
    icon: Palette,
    color: "#ec4899",
  },
};

/** Honest impact tier for a tweak's 1–5 rating. We never fabricate a "boost %" —
 *  a real percentage only ever appears in the measured before/after report. */
export function impactTier(impact: number): "Low" | "Medium" | "High" {
  if (impact >= 4) return "High";
  if (impact >= 2) return "Medium";
  return "Low";
}

export const CATEGORY_ORDER: TweakCategory[] = [
  "system",
  "performance",
  "network",
  "graphics",
  "privacy",
  "gaming",
  "appearance",
];

export const CPU_ICON = Cpu;

/** Which risk levels a preset is willing to enable (selection only). */
export const PRESET_RISK: Record<string, RiskLevel[]> = {
  ultimate: ["safe", "moderate", "advanced"],
  balanced: ["safe", "moderate"],
  power_saving: ["safe"],
};
