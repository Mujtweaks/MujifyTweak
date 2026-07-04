import { useState } from "react";
import { ShieldCheck, Zap } from "lucide-react";
import { NAV_ITEMS, type PageId } from "../lib/nav";
import { useSystemStore } from "../store/systemStore";
import logo from "../assets/logo.png";

interface SidebarProps {
  page: PageId;
  onNavigate: (page: PageId) => void;
}

export default function Sidebar({ page, onNavigate }: SidebarProps) {
  const backendConnected = useSystemStore((s) => s.backendConnected);
  const backendVersion = useSystemStore((s) => s.backendVersion);
  const [hint, setHint] = useState<string | null>(null);

  const showHint = (text: string) => {
    setHint(text);
    window.setTimeout(() => setHint(null), 2600);
  };

  return (
    <aside className="flex w-[190px] shrink-0 flex-col border-r border-edge bg-[#0d0d0f]">
      {/* Logo — mix-blend-screen lets the PNG's black background melt into the rail */}
      <div className="flex h-[60px] items-center border-b border-edge px-4">
        <img
          src={logo}
          alt="Mujify Tweaks"
          className="h-11 w-full object-contain mix-blend-screen"
          draggable={false}
        />
      </div>

      {/* Nav — active item gets the red glow chip treatment */}
      <nav className="flex flex-col gap-1 px-3 py-4">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = page === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`group flex items-center gap-3 rounded-xl px-2.5 py-[7px] text-left transition-colors ${
                active ? "bg-accent/10" : "hover:bg-white/[0.04]"
              }`}
            >
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-all ${
                  active
                    ? "border-accent/50 bg-accent/15 shadow-[0_0_14px_rgba(227,0,14,0.35)]"
                    : "border-transparent"
                }`}
              >
                <Icon
                  size={17}
                  strokeWidth={1.75}
                  className={active ? "text-accent" : "text-txt2 group-hover:text-txt"}
                />
              </span>
              <span
                className={`text-[13px] font-medium ${
                  active ? "text-txt" : "text-txt2 group-hover:text-txt"
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3 px-3 pb-4">
        {hint && (
          <p className="rounded-lg border border-edge bg-panel2 px-2.5 py-2 text-[11px] leading-snug text-txt2">
            {hint}
          </p>
        )}

        <button
          onClick={() =>
            showHint("Not wired yet — one-click optimize comes online with TweaksEngine (Checkpoint 9).")
          }
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-accent to-[#b0000b] px-3 py-2.5 text-[13px] font-semibold text-white shadow-[0_0_22px_rgba(227,0,14,0.35)] transition-transform active:scale-[0.98]"
        >
          <Zap size={15} strokeWidth={2.25} fill="currentColor" />
          Quick Optimize
        </button>

        {/* System Guard — Checkpoint 1: this status is REAL (Rust ping round-trip) */}
        <div className="flex items-center gap-2.5 rounded-xl border border-edge bg-panel px-3 py-2.5">
          <ShieldCheck
            size={17}
            strokeWidth={1.75}
            className={backendConnected ? "text-good" : "text-txt3"}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-txt2">
              System Guard
            </p>
            <p className="truncate text-[11px] text-txt">
              {backendConnected ? `Core connected v${backendVersion}` : "Connecting…"}
            </p>
          </div>
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              backendConnected ? "bg-good" : "animate-pulse bg-txt3"
            }`}
          />
        </div>
      </div>
    </aside>
  );
}
