import {
  Activity,
  Gamepad2,
  Globe,
  House,
  Rocket,
  Settings,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

export type PageId =
  | "home"
  | "optimizer"
  | "profiles"
  | "profile-editor"
  | "diagnostics"
  | "network"
  | "tweaks"
  | "tools"
  | "ai"
  | "changelog"
  | "report"
  | "history"
  | "drivers"
  | "startup"
  | "settings";

export interface NavItem {
  id: PageId;
  label: string;
  icon: LucideIcon;
}

/**
 * Sidebar nav. Only fully-real pages appear here — no dead clicks, no
 * placeholder stubs. Tools (Phase 6) is intentionally absent until it's real.
 */
export const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", icon: House },
  { id: "optimizer", label: "Optimizer", icon: Rocket },
  { id: "profiles", label: "Profiles", icon: Gamepad2 },
  { id: "diagnostics", label: "Diagnostics", icon: Activity },
  { id: "network", label: "Network", icon: Globe },
  { id: "tweaks", label: "Tweaks", icon: SlidersHorizontal },
  { id: "settings", label: "Settings", icon: Settings },
];
