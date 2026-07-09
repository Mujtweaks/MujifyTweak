import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Info, X } from "lucide-react";
import { readyCheck } from "../lib/backend";
import { useGameStore } from "../store/gameStore";
import { useSettingsStore } from "../store/settingsStore";
import type { ReadyCheckItem } from "../lib/types";
import type { PageId } from "../lib/nav";

// A failing check → where the user goes to fix it (normal confirm pipeline).
const ACTION_PAGE: Record<string, PageId> = {
  thermal: "diagnostics",
  bg_process: "diagnostics",
  refresh_rate: "tweaks",
  power_plan: "tweaks",
  apply_profile: "tweaks",
};

/**
 * Pre-game Ready Check — an F1-style pre-flight panel that appears when a game
 * launches, for ~6s. Read-only (reuses the health-scan classifiers); ticks
 * animate in sequentially and any ✗ links to the matching fix. Toggleable in
 * Settings, and it respects prefers-reduced-motion via the shared CSS.
 */
export default function ReadyCheck({ onNavigate }: { onNavigate: (p: PageId) => void }) {
  const activeGame = useGameStore((s) => s.activeGame);
  const enabled = useSettingsStore((s) => s.readyCheckEnabled);
  const [items, setItems] = useState<ReadyCheckItem[] | null>(null);
  const [game, setGame] = useState("");
  const lastGame = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const name = activeGame?.name ?? null;
    if (!name) {
      lastGame.current = null;
      return;
    }
    if (!enabled || name === lastGame.current) return;
    lastGame.current = name;
    setGame(name);
    void readyCheck(name, activeGame?.installPath ?? null).then((r) => {
      if (r.length === 0) return;
      setItems(r);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setItems(null), 6500);
    });
  }, [activeGame, enabled]);

  if (!items) return null;

  return (
    <div className="toast-in pointer-events-auto fixed bottom-4 left-1/2 z-[150] w-[380px] -translate-x-1/2 rounded-card border border-edge bg-card/95 p-4 shadow-[0_10px_40px_rgba(0,0,0,0.55)] backdrop-blur">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-widest text-txt2">Ready Check · {game}</p>
        <button onClick={() => setItems(null)} className="text-txt3 hover:text-txt" aria-label="Dismiss">
          <X size={14} />
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map((it, i) => {
          const page = it.action ? ACTION_PAGE[it.action] : undefined;
          const Icon = it.informational ? Info : it.ok ? Check : AlertTriangle;
          const tone = it.informational ? "text-txt3" : it.ok ? "text-success" : "text-warning";
          return (
            <div
              key={i}
              className="stagger-item flex items-center gap-2.5 text-[12px]"
              style={{ animationDelay: `${i * 80}ms` }}
              title={it.detail}
            >
              <Icon size={15} strokeWidth={2.25} className={`shrink-0 ${tone}`} />
              <span className={`flex-1 ${it.ok || it.informational ? "text-txt2" : "font-medium text-txt"}`}>{it.label}</span>
              {!it.ok && !it.informational && page && (
                <button
                  onClick={() => {
                    onNavigate(page);
                    setItems(null);
                  }}
                  className="flex items-center gap-0.5 text-[11px] font-semibold text-accent hover:text-accent-hi"
                >
                  Fix <ArrowRight size={11} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
