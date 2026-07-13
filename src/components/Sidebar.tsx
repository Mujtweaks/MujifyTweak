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
  Sparkles,
  SlidersHorizontal,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { PageId } from "../lib/nav";
import { useSystemStore } from "../store/systemStore";
import { useGameStore } from "../store/gameStore";
import { displayName, useSettingsStore } from "../store/settingsStore";
import logo from "../assets/logo-mark.png";

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
  { id: "cleaner", label: "Cleaner", icon: Sparkles },
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
        className={`relative z-10 flex h-11 w-full items-center gap-3 rounded-xl px-[15px] transition-colors ${
          active ? "text-white" : "text-txt3 hover:bg-white/5 hover:text-txt2"
        }`}
      >
        <Icon size={19} strokeWidth={1.75} className="shrink-0" />
        <span className="whitespace-nowrap text-[13px] font-medium opacity-0 transition-opacity duration-150 group-hover/side:opacity-100">
          {it.label}
        </span>
      </button>
    );
  };

  return (
    // Outer aside is a fixed 64px gutter so content never shifts; the inner
    // panel overlays and expands to reveal labels on hover.
    <aside className="group/side relative w-[64px] shrink-0">
      <div className="absolute inset-y-0 left-0 z-40 flex w-[64px] flex-col overflow-hidden border-r border-edge bg-[#0d0d0d] py-4 transition-[width] duration-200 ease-out group-hover/side:w-[210px] group-hover/side:shadow-[6px_0_28px_rgba(0,0,0,0.45)] motion-reduce:transition-none">
        {/* Logo mark + wordmark (wordmark fades in when expanded) */}
        <div className="mb-4 flex items-center gap-2.5 px-[14px]">
          <div className="grid h-9 w-9 shrink-0 place-items-center">
            <img src={logo} alt="Mujify" className="h-8 w-8 object-contain mix-blend-screen brightness-125" draggable={false} />
          </div>
          <span className="whitespace-nowrap text-[15px] font-black uppercase tracking-tight text-txt opacity-0 transition-opacity duration-200 group-hover/side:opacity-100">
            Mujify
          </span>
        </div>

        <nav className="relative flex flex-1 flex-col gap-1.5 px-2">
          {/* The single red indicator that slides between nav items */}
          <span
            className={`slide-indicator pointer-events-none absolute left-2 right-2 top-0 z-0 rounded-xl bg-accent ${ind.visible ? "opacity-100" : "opacity-0"}`}
            style={{ height: ind.height, transform: `translateY(${ind.top}px)` }}
          />
          {GROUP_1.map(renderItem)}
          <span className="mx-2 my-1.5 h-px bg-edge" />
          {GROUP_2.map(renderItem)}
          <span className="mx-2 my-1.5 h-px bg-edge" />
          {GROUP_3.map(renderItem)}
        </nav>

        {/* Footer — Get Help, guard dot, and the personalized avatar */}
        <div className="flex flex-col gap-2.5 px-2">
          <button
            onClick={() => onNavigate("support")}
            title="Get help — free live support"
            className={`flex h-10 w-full items-center gap-3 rounded-xl px-[15px] transition-colors ${
              page === "support" ? "bg-accent text-white" : "text-txt3 hover:bg-white/8 hover:text-txt2"
            }`}
          >
            <LifeBuoy size={18} strokeWidth={1.75} className="shrink-0" />
            <span className="whitespace-nowrap text-[13px] font-medium opacity-0 transition-opacity duration-150 group-hover/side:opacity-100">
              Get Help
            </span>
          </button>
          <div className="flex h-9 items-center gap-3 px-[15px]">
            <span
              title={antiCheatActive ? "System Guard — protected game active" : backendConnected ? "System Guard — Protected" : "Connecting…"}
              className={`live-dot h-2 w-2 shrink-0 rounded-full ${antiCheatActive ? "bg-warning text-warning" : live ? "bg-success text-success" : "bg-txt3"}`}
            />
            <span className="whitespace-nowrap text-[11.5px] font-medium text-txt3 opacity-0 transition-opacity duration-150 group-hover/side:opacity-100">
              {antiCheatActive ? "Protected game" : live ? "Protected" : "Connecting…"}
            </span>
          </div>
          <div className="flex items-center gap-3 px-[11px]">
            <span
              title={`${displayName(userName)} · Free`}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-edge bg-card text-[13px] font-bold text-txt2"
            >
              {displayName(userName).charAt(0).toUpperCase()}
            </span>
            <span className="flex flex-col whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/side:opacity-100">
              <span className="text-[12px] font-semibold text-txt">{displayName(userName)}</span>
              <span className="text-[10px] text-txt3">Free · no account</span>
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
