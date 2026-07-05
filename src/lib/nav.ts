import {
  Activity,
  Bot,
  Gamepad2,
  Globe,
  LayoutDashboard,
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

/** Sidebar nav — every entry is a real, working page. */
export const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", icon: LayoutDashboard },
  { id: "optimizer", label: "Optimizer", icon: Rocket },
  { id: "profiles", label: "Profiles", icon: Gamepad2 },
  { id: "diagnostics", label: "Diagnostics", icon: Activity },
  { id: "network", label: "Network", icon: Globe },
  { id: "tweaks", label: "Tweaks", icon: SlidersHorizontal },
  { id: "ai", label: "AI Assistant", icon: Bot },
  { id: "settings", label: "Settings", icon: Settings },
];
