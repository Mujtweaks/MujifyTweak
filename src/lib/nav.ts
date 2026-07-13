import {
  Activity,
  Bot,
  Gamepad2,
  Globe,
  LayoutDashboard,
  Rocket,
  Settings,
  SlidersHorizontal,
  Trash2,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type PageId =
  | "home"
  | "overview"
  | "optimizer"
  | "profiles"
  | "profile-editor"
  | "diagnostics"
  | "gpu"
  | "network"
  | "tweaks"
  | "fixes"
  | "cleaner"
  | "tools"
  | "ai"
  | "changelog"
  | "report"
  | "history"
  | "drivers"
  | "startup"
  | "support"
  | "settings";

export interface NavItem {
  id: PageId;
  label: string;
  icon: LucideIcon;
}

/** Uppercase page titles shown in the TopBar (sidebar is icon-only). */
export const PAGE_TITLES: Record<PageId, string> = {
  home: "Home",
  overview: "System Overview",
  optimizer: "Optimizer",
  profiles: "Games",
  "profile-editor": "Profile",
  diagnostics: "Diagnostics",
  gpu: "GPU",
  network: "Network",
  tweaks: "Tweaks",
  fixes: "Fixes",
  cleaner: "Cleaner",
  tools: "Tools",
  ai: "AI Assistant",
  changelog: "Change Log",
  report: "Performance Report",
  history: "History",
  drivers: "Drivers",
  startup: "Startup",
  support: "Support",
  settings: "Settings",
};

/** Sidebar nav — every entry is a real, working page. */
export const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", icon: LayoutDashboard },
  { id: "optimizer", label: "Optimizer", icon: Rocket },
  { id: "profiles", label: "Profiles", icon: Gamepad2 },
  { id: "diagnostics", label: "Diagnostics", icon: Activity },
  { id: "network", label: "Network", icon: Globe },
  { id: "tweaks", label: "Tweaks", icon: SlidersHorizontal },
  { id: "fixes", label: "Fixes", icon: Wrench },
  { id: "cleaner", label: "Cleaner", icon: Trash2 },
  { id: "ai", label: "AI Assistant", icon: Bot },
  { id: "settings", label: "Settings", icon: Settings },
];
