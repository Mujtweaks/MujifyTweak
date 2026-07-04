import {
  Activity,
  Gamepad2,
  Globe,
  House,
  Rocket,
  Settings,
  SlidersHorizontal,
  Wrench,
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

/** Sidebar order per the dashboard mockup. */
export const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", icon: House },
  { id: "optimizer", label: "Optimizer", icon: Rocket },
  { id: "profiles", label: "Profiles", icon: Gamepad2 },
  { id: "diagnostics", label: "Diagnostics", icon: Activity },
  { id: "network", label: "Network", icon: Globe },
  { id: "tweaks", label: "Tweaks", icon: SlidersHorizontal },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "settings", label: "Settings", icon: Settings },
];
