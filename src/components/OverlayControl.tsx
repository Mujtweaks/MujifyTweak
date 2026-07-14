import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Gauge } from "lucide-react";
import Toggle from "./Toggle";
import { toast } from "../store/toastStore";

// Reusable control for the in-game FPS/temp overlay — used on both the Home page
// (so it's front-and-centre) and in Settings. Enable state + chosen metrics live
// in localStorage (shared with the transparent overlay window, which reads them).

const OVERLAY_METRICS: { id: string; label: string }[] = [
  { id: "fps", label: "FPS" },
  { id: "cpu", label: "CPU %" },
  { id: "gpu", label: "GPU %" },
  { id: "cputemp", label: "CPU temp" },
  { id: "gputemp", label: "GPU temp" },
  { id: "ram", label: "RAM %" },
];

export default function OverlayControl({ compact = false }: { compact?: boolean }) {
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem("mujify.overlay.enabled") === "1"; } catch { return false; }
  });
  const [metrics, setMetrics] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("mujify.overlay.metrics");
      return raw ? (JSON.parse(raw) as string[]) : ["fps", "cpu", "gpu", "cputemp", "gputemp"];
    } catch { return ["fps", "cpu", "gpu", "cputemp", "gputemp"]; }
  });

  const persist = (m: string[]) => {
    setMetrics(m);
    try { localStorage.setItem("mujify.overlay.metrics", JSON.stringify(m)); } catch { /* ignore */ }
  };
  const toggle = async (next: boolean) => {
    setOn(next);
    try { localStorage.setItem("mujify.overlay.enabled", next ? "1" : "0"); } catch { /* ignore */ }
    try { await invoke("set_overlay_enabled", { enabled: next }); } catch (e) { toast.error("Overlay", String(e)); }
  };
  const toggleMetric = (id: string) =>
    persist(metrics.includes(id) ? metrics.filter((x) => x !== id) : [...metrics, id]);

  return (
    <div className={compact ? "" : "rounded-2xl border border-edge bg-card p-5"}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {!compact && (
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10">
              <Gauge size={18} className="text-accent" />
            </span>
          )}
          <div className="pr-2">
            <p className="text-[14px] font-bold text-txt">In-game FPS / temp overlay</p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-txt2">
              Live stats on top of your game, MSI-Afterburner style. Shows over borderless &amp; windowed games.
            </p>
          </div>
        </div>
        <Toggle on={on} onClick={() => void toggle(!on)} />
      </div>
      {on && (
        <div className="mt-3 flex flex-wrap gap-2">
          {OVERLAY_METRICS.map((m) => {
            const active = metrics.includes(m.id);
            return (
              <button
                key={m.id}
                onClick={() => toggleMetric(m.id)}
                className={`rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors ${active ? "border-accent bg-accent/15 text-accent" : "border-edge bg-bg text-txt3 hover:text-txt2"}`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
