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
  { label: string; subtitle: string; icon: LucideIcon }
> = {
  system: {
    label: "System",
    subtitle: "Windows services, startup and memory",
    icon: Settings2,
  },
  performance: {
    label: "Performance",
    subtitle: "CPU, timer resolution and latency",
    icon: Gauge,
  },
  network: {
    label: "Network",
    subtitle: "Latency, throughput and DNS",
    icon: Globe,
  },
  graphics: {
    label: "Graphics",
    subtitle: "GPU, display and frame pacing",
    icon: Monitor,
  },
  privacy: {
    label: "Privacy",
    subtitle: "Telemetry, tracking and background data",
    icon: Lock,
  },
  gaming: {
    label: "Gaming",
    subtitle: "Input latency and game settings",
    icon: Gamepad2,
  },
};

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
