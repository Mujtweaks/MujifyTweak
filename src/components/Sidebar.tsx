import { useLayoutEffect, useRef, useState } from "react";
import {
  Activity,
  Bot,
  Gamepad2,
  Globe,
  LayoutDashboard,
  LifeBuoy,
  Rocket,
  Settings,
  SlidersHorizontal,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { PageId } from "../lib/nav";
import { useSystemStore } from "../store/systemStore";
import { useGameStore } from "../store/gameStore";
import { displayName, useSettingsStore } from "../store/settingsStore";
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

const GROUP_1: Item[] = [
  { id: "home", label: "Home", icon: LayoutDashboard },
  { id: "profiles", label: "Games", icon: Gamepad2 },
];
const GROUP_2: Item[] = [
  { id: "optimizer", label: "Optimizer", icon: Rocket },
  { id: "tweaks", label: "Tweaks", icon: SlidersHorizontal },
  { id: "fixes", label: "Fixes", icon: Wrench },
  { id: "network", label: "Network", icon: Globe },
  { id: "diagnostics", label: "Diagnostics", icon: Activity },
  { id: "ai", label: "AI Assistant", icon: Bot },
];
const GROUP_3: Item[] = [{ id: "settings", label: "Settings", icon: Settings }];

export default function Sidebar({ page, onNavigate }: SidebarProps) {
  const backendConnected = useSystemStore((s) => s.backendConnected);
  const stats = useSystemStore((s) => s.stats);
  const antiCheatActive = useGameStore((s) => s.antiCheatActive);
  const userName = useSettingsStore((s) => s.userName);
  const live = !!stats;

  // Sliding active indicator — measure the active item and let CSS transition it.
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [ind, setInd] = useState({ top: 0, height: 44, visible: false });
  useLayoutEffect(() => {
    const el = itemRefs.current[page];
    if (el) setInd({ top: el.offsetTop, height: el.offsetHeight, visible: true });
    else setInd((p) => ({ ...p, visible: false })); // page not in the rail
  }, [page]);

  const renderItem = (it: Item) => {
    const Icon = it.icon;
    const active = page === it.id;
    return (
      <button
        key={it.id}
        ref={(el) => {
          itemRefs.current[it.id] = el;
        }}
        onClick={() => onNavigate(it.id)}
        title={it.label}
        className={`group relative z-10 grid h-11 w-11 place-items-center rounded-xl transition-colors ${
          active ? "text-white" : "text-txt3 hover:text-txt2"
        }`}
      >
        <Icon size={19} strokeWidth={1.75} className="transition-transform duration-[120ms] ease-out group-hover:scale-110" />
      </button>
    );
  };

  return (
    <aside className="flex w-[64px] shrink-0 flex-col items-center border-r border-edge bg-[#0d0d0d] py-4">
      {/* Logo mark (crop to the gear mark, hide the wordmark) */}
      <div className="mb-4 h-9 w-9 overflow-hidden">
        <img src={logo} alt="Mujify" className="h-9 w-[120px] max-w-none object-cover object-left mix-blend-screen brightness-125" draggable={false} />
      </div>

      <nav className="relative flex flex-1 flex-col items-center gap-1.5">
        {/* The single red indicator that slides between nav items */}
        <span
          className={`slide-indicator pointer-events-none absolute left-1/2 top-0 z-0 w-11 rounded-xl bg-accent ${ind.visible ? "opacity-100" : "opacity-0"}`}
          style={{ height: ind.height, transform: `translate(-50%, ${ind.top}px)` }}
        />
        {GROUP_1.map(renderItem)}
        <span className="my-1.5 h-px w-8 bg-edge" />
        {GROUP_2.map(renderItem)}
        <span className="my-1.5 h-px w-8 bg-edge" />
        {GROUP_3.map(renderItem)}
      </nav>

      {/* Footer — Get Help, guard dot, and the personalized avatar */}
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={() => onNavigate("support")}
          title="Get help — free live support"
          className={`grid h-9 w-9 place-items-center rounded-xl transition-colors ${
            page === "support" ? "bg-accent text-white" : "text-txt3 hover:bg-white/8 hover:text-txt2"
          }`}
        >
          <LifeBuoy size={18} strokeWidth={1.75} />
        </button>
        <span
          title={antiCheatActive ? "System Guard — protected game active" : backendConnected ? "System Guard — Protected" : "Connecting…"}
          className={`live-dot h-2 w-2 rounded-full ${antiCheatActive ? "bg-warning text-warning" : live ? "bg-success text-success" : "bg-txt3"}`}
        />
        <span
          title={`${displayName(userName)} · Free`}
          className="grid h-9 w-9 place-items-center rounded-full border border-edge bg-card text-[13px] font-bold text-txt2"
        >
          {displayName(userName).charAt(0).toUpperCase()}
        </span>
      </div>
    </aside>
  );
}
