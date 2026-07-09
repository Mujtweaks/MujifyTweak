import { useEffect, useState } from "react";
import { Cpu, Gauge, LineChart, MonitorCog, Sparkles, Wand2 } from "lucide-react";
import { getSettingsAdvice } from "../lib/backend";
import type { GameInfo, SettingsAdvice } from "../lib/types";

const IMPACT_TONE: Record<string, string> = {
  high: "bg-success/10 text-success",
  medium: "bg-warning/10 text-warning",
  low: "bg-panel2 text-txt2",
};
const VISUAL_NOTE: Record<string, string> = {
  none: "no visible change",
  minor: "minor visual change",
  noticeable: "visible tradeoff",
};
const TIER_WORD: Record<string, string> = {
  integrated: "Integrated",
  entry: "Entry-tier",
  mid: "Mid-tier",
  high: "High-end",
  ultra: "Flagship",
  unknown: "Unrecognized",
};

/**
 * Game Settings Advisor — the real FPS engine. Shows this machine's hardware tier
 * and the exact in-game GRAPHICS settings to change for it, with an honest impact
 * tier + visual-cost note and the reason. Recommendations only: the user changes
 * these in the game's own menu, then proves the gain with the before/after run.
 * No fabricated percentages — the only measured number lives in the report.
 */
export default function SettingsAdvisor({ game, onMeasure }: { game: GameInfo; onMeasure?: () => void }) {
  const [advice, setAdvice] = useState<SettingsAdvice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getSettingsAdvice(game.name, game.installPath ?? null).then((a) => {
      setAdvice(a);
      setLoading(false);
    });
  }, [game.name, game.installPath]);

  if (loading) return <p className="py-4 text-center text-[12px] text-txt3">Reading your hardware…</p>;
  if (!advice) return <p className="py-4 text-center text-[12px] text-txt3">Open in the desktop app to see settings advice.</p>;

  const hw = advice.hardware;
  const upList = hw.upscalers.length ? hw.upscalers.map((u) => u.toUpperCase()).join(" / ") : "none";

  return (
    <div className="flex flex-col gap-3">
      {/* Hardware tier line */}
      <div className="rounded-chip border border-edge bg-card px-3.5 py-2.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-txt2">
          <MonitorCog size={13} className="text-accent" />
          <span className="font-semibold text-txt">Your PC:</span>
          <span className="font-semibold text-txt">{TIER_WORD[hw.gpuTier] ?? hw.gpuTier} GPU</span>
          <span className="text-txt3">({hw.gpuModel || "unknown"})</span>
          {hw.vramGb != null && <span className="text-txt3">· {hw.vramGb}GB VRAM</span>}
          <span className="text-txt3">· {Math.round(hw.ramGb)}GB RAM</span>
          <span className="inline-flex items-center gap-1 text-txt3">
            <Cpu size={11} /> {TIER_WORD[hw.cpuTier] ?? hw.cpuTier} CPU
          </span>
          <span className="text-txt3">· supports {upList}</span>
        </p>
        {!hw.gpuKnown && (
          <p className="mt-1 text-[10.5px] text-warning">
            We don't recognize this GPU yet — showing conservative (entry-tier) advice.
          </p>
        )}
      </div>

      {/* Honest header */}
      <p className="flex items-start gap-2 text-[11px] leading-relaxed text-txt3">
        <Sparkles size={13} className="mt-0.5 shrink-0 text-accent" />
        Change these inside the game's own settings menu — then run a Before/After to measure your real gain.
        These are honest impact tiers, never a promised percentage.
      </p>

      {/* Upscaler — the single biggest win, highlighted */}
      {advice.upscaler && (
        <div className="rounded-chip border border-accent/30 bg-accent/5 px-3.5 py-3">
          <div className="flex items-center gap-2">
            <Wand2 size={14} className="text-accent" />
            <p className="text-[12.5px] font-bold text-txt">Enable {advice.upscaler.upscaler} {advice.upscaler.quality}</p>
            <span className="rounded bg-success/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-success">
              {advice.upscaler.impact} impact
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-txt2">{advice.upscaler.why}</p>
        </div>
      )}

      {/* Per-setting recommendations */}
      <ul className="flex flex-col gap-1.5">
        {advice.recommendations.map((r) => (
          <li key={r.setting} className="flex items-start gap-3 rounded-chip border border-edge bg-card px-3.5 py-2.5">
            <Gauge size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-txt3" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-[12.5px] font-semibold text-txt">{r.setting}</p>
                <span className="text-txt3">→</span>
                <span className="text-[12px] font-bold text-accent">{r.value}</span>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${IMPACT_TONE[r.impact] ?? "bg-panel2 text-txt2"}`}>
                  {r.impact} impact
                </span>
                <span className="text-[9.5px] uppercase tracking-wide text-txt3">{VISUAL_NOTE[r.visualCost] ?? r.visualCost}</span>
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-txt2">{r.why}</p>
            </div>
          </li>
        ))}
      </ul>

      {/* Deep-link to the proof loop */}
      <button
        onClick={() => {
          onMeasure?.();
          window.location.hash = "report";
        }}
        className="mt-1 flex items-center justify-center gap-2 rounded-btn border border-edge bg-card px-4 py-2 text-[12px] font-semibold text-txt hover:border-edge2"
      >
        <LineChart size={14} strokeWidth={2} className="text-accent" />
        Measure the gain in a Before/After
      </button>
    </div>
  );
}
