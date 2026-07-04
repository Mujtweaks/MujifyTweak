import {
  Cpu,
  Gauge,
  Gamepad2,
  Globe,
  HardDrive,
  Monitor,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import type { RiskLevel, TweakCategory } from "./types";

export const CATEGORY_META: Record<
  TweakCategory,
  { label: string; subtitle: string; icon: LucideIcon }
> = {
  "system-performance": {
    label: "System Performance",
    subtitle: "Optimize CPU, memory and system settings",
    icon: Gauge,
  },
  "graphics-display": {
    label: "Graphics & Display",
    subtitle: "Optimize GPU, display and visual settings",
    icon: Monitor,
  },
  "network-optimization": {
    label: "Network Optimization",
    subtitle: "Optimize network for lower latency",
    icon: Globe,
  },
  "windows-services": {
    label: "Windows Services",
    subtitle: "Optimize background services and tasks",
    icon: Settings2,
  },
  "storage-optimization": {
    label: "Storage Optimization",
    subtitle: "Optimize storage, cache and indexing",
    icon: HardDrive,
  },
  "game-input": {
    label: "Game & Input",
    subtitle: "Optimize game settings & input latency",
    icon: Gamepad2,
  },
};

export const CATEGORY_ORDER: TweakCategory[] = [
  "system-performance",
  "graphics-display",
  "network-optimization",
  "windows-services",
  "storage-optimization",
  "game-input",
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
