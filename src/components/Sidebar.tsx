import { ShieldCheck, Zap } from "lucide-react";
import { NAV_ITEMS, type PageId } from "../lib/nav";
import { useSystemStore } from "../store/systemStore";
import { useGameStore } from "../store/gameStore";
import logo from "../assets/logo.png";

interface SidebarProps {
  page: PageId;
  onNavigate: (page: PageId) => void;
}

export default function Sidebar({ page, onNavigate }: SidebarProps) {
  const backendConnected = useSystemStore((s) => s.backendConnected);
  const antiCheatActive = useGameStore((s) => s.antiCheatActive);

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-edge bg-[#0d0d0d]">
      {/* Logo */}
      <div className="flex h-[68px] items-center px-5">
        <img
          src={logo}
          alt="Mujify Tweaks"
          className="h-10 w-auto object-contain mix-blend-screen"
          draggable={false}
        />
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = page === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`group relative flex items-center gap-3 rounded-btn px-4 py-3 text-left transition-colors ${
                active
                  ? "bg-accent/10 text-txt"
                  : "text-txt3 hover:bg-white/5 hover:text-txt2"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-accent" />
              )}
              <Icon
                size={18}
                strokeWidth={1.5}
                className={active ? "text-accent" : "text-current"}
              />
              <span className="text-[13.5px] font-medium">{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="flex flex-col gap-3 border-t border-edge px-3 py-4">
        <button
          onClick={() => onNavigate("optimizer")}
          className="flex items-center justify-center gap-2 rounded-btn bg-accent px-3 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] transition-transform active:scale-[0.98] hover:bg-accent-hi"
        >
          <Zap size={15} strokeWidth={2.5} fill="currentColor" />
          Quick Optimize
        </button>

        <div className="flex items-center gap-2.5 px-1">
          <ShieldCheck
            size={16}
            strokeWidth={1.75}
            className={antiCheatActive ? "text-warning" : backendConnected ? "text-success" : "text-txt3"}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-txt">System Guard</p>
            <p className="truncate text-[10.5px] text-txt2">
              {antiCheatActive ? "Protected game active" : backendConnected ? "Protected" : "Connecting…"}
            </p>
          </div>
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              antiCheatActive ? "bg-warning" : backendConnected ? "bg-success" : "animate-pulse bg-txt3"
            }`}
          />
        </div>
      </div>
    </aside>
  );
}
