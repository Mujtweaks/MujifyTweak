import {
  Activity,
  Bot,
  Gamepad2,
  Globe,
  LayoutDashboard,
  ListChecks,
  Rocket,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { PageId } from "../lib/nav";
import { useSystemStore } from "../store/systemStore";
import { useGameStore } from "../store/gameStore";
import logo from "../assets/logo.png";

interface SidebarProps {
  page: PageId;
  onNavigate: (page: PageId) => void;
}

interface Item {
  id: PageId;
  label: string;
  icon: LucideIcon;
}

const GENERAL: Item[] = [
  { id: "home", label: "Home", icon: LayoutDashboard },
  { id: "profiles", label: "Profiles", icon: Gamepad2 },
  { id: "changelog", label: "Change Log", icon: ListChecks },
];

const OPTIMIZE: Item[] = [
  { id: "optimizer", label: "Optimizer", icon: Rocket },
  { id: "tweaks", label: "Tweaks", icon: SlidersHorizontal },
  { id: "network", label: "Network", icon: Globe },
  { id: "diagnostics", label: "Diagnostics", icon: Activity },
  { id: "ai", label: "AI Assistant", icon: Bot },
];

function NavButton({ item, active, onClick }: { item: Item; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-3 rounded-btn border px-3.5 py-2.5 text-left transition-colors ${
        active
          ? "border-accent/40 bg-accent/10 text-accent shadow-[0_0_18px_rgba(227,0,14,0.12)]"
          : "border-transparent text-txt2 hover:bg-white/5 hover:text-txt"
      }`}
    >
      <Icon size={18} strokeWidth={1.6} className={active ? "text-accent" : "text-current"} />
      <span className="text-[13.5px] font-medium">{item.label}</span>
    </button>
  );
}

export default function Sidebar({ page, onNavigate }: SidebarProps) {
  const backendConnected = useSystemStore((s) => s.backendConnected);
  const stats = useSystemStore((s) => s.stats);
  const antiCheatActive = useGameStore((s) => s.antiCheatActive);
  const live = !!stats;

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-edge bg-[#0d0d0d]">
      <div className="flex h-[68px] items-center px-5">
        <img src={logo} alt="Mujify Tweaks" className="h-11 w-auto object-contain mix-blend-screen brightness-125" draggable={false} />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-txt3">General</p>
        <div className="flex flex-col gap-1">
          {GENERAL.map((it) => <NavButton key={it.id} item={it} active={page === it.id} onClick={() => onNavigate(it.id)} />)}
        </div>

        <p className="px-2 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-txt3">Optimize</p>
        <div className="flex flex-col gap-1">
          {OPTIMIZE.map((it) => <NavButton key={it.id} item={it} active={page === it.id} onClick={() => onNavigate(it.id)} />)}
        </div>

        <div className="mt-4 border-t border-edge pt-2">
          <NavButton item={{ id: "settings", label: "Settings", icon: Settings }} active={page === "settings"} onClick={() => onNavigate("settings")} />
        </div>
      </nav>

      <div className="flex flex-col gap-3 border-t border-edge px-3 py-4">
        <button
          onClick={() => onNavigate("tweaks")}
          className="glint flex items-center justify-center gap-2 rounded-btn bg-accent px-3 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] transition-transform active:scale-[0.98] hover:bg-accent-hi"
        >
          <Zap size={15} strokeWidth={2.5} fill="currentColor" />
          Quick Optimize
        </button>

        <div className="flex items-center gap-2.5 rounded-btn border border-edge bg-card px-3 py-2.5">
          <ShieldCheck size={16} strokeWidth={1.75} className={antiCheatActive ? "text-warning" : backendConnected ? "text-success" : "text-txt3"} />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-txt">System Guard</p>
            <p className="truncate text-[10.5px] text-txt2">{antiCheatActive ? "Protected game active" : backendConnected ? "Protected · Free forever" : "Connecting…"}</p>
          </div>
          <span className={`live-dot h-1.5 w-1.5 rounded-full ${live ? "bg-success text-success" : "bg-txt3"}`} />
        </div>
      </div>
    </aside>
  );
}
