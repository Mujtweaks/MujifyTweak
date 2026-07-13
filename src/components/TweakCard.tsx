import { useState } from "react";
import { Info, Plus, Sparkles, TrendingUp } from "lucide-react";
import { CATEGORY_META, impactTier } from "../lib/categories";
import { ACTION_LABEL, TWEAK_DETAILS } from "../lib/tweakDetails";
import { riskMeta } from "../lib/risk";
import RiskBadge from "./RiskBadge";
import Toggle from "./Toggle";
import type { TweakInfo } from "../lib/types";

interface TweakCardProps {
  tweak: TweakInfo;
  selected: boolean;
  onToggle: (t: TweakInfo) => void;
  onInfo?: (t: TweakInfo) => void;
}

/**
 * The RIP-Tweaks tweak card. Advanced tweaks get the purple-glow treatment
 * (advanced = risky, NOT premium — everything is free). Applied tweaks show an
 * "Active" badge; appliable ones a toggle; scan-only ones a disabled toggle with
 * an honest label (never a fake control).
 */
export default function TweakCard({ tweak, selected, onToggle, onInfo }: TweakCardProps) {
  const meta = CATEGORY_META[tweak.category];
  const Icon = meta.icon;
  const advanced = tweak.risk === "advanced";
  const tier = impactTier(tweak.impact);
  const scanOnly = !tweak.appliable || !tweak.available;
  const [expanded, setExpanded] = useState(false);
  const detail = TWEAK_DETAILS[tweak.id];

  return (
    <div
      className={`rounded-2xl border p-5 transition-all duration-150 hover:-translate-y-px hover:scale-[1.005] ${
        advanced
          ? "border-purple-800/40 bg-gradient-to-br from-purple-900/10 to-transparent hover:border-purple-700/50 hover:shadow-[0_0_24px_rgba(168,85,247,0.18)]"
          : "border-edge bg-card hover:border-white/20"
      }`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
            style={{ backgroundColor: `${meta.color}20` }}
          >
            <Icon size={18} strokeWidth={1.75} style={{ color: meta.color }} />
          </span>
          <RiskBadge level={tweak.risk} />
        </div>
        <span
          className={`flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide ${advanced ? "text-purple-400" : tier === "High" ? "text-success" : tier === "Medium" ? "text-warning" : "text-txt2"}`}
          title="Impact rating — not a measured gain. Real percentages appear only in the before/after report."
        >
          {advanced ? <Sparkles size={13} /> : <TrendingUp size={13} />}
          {tier} impact
        </span>
      </div>

      {/* Middle */}
      <p className="mt-3 text-[15px] font-bold text-txt">{tweak.title}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-txt2">{tweak.description}</p>

      {/* Bottom row */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded((v) => !v)}
            title="Technical detail"
            className={`grid h-7 w-7 place-items-center rounded-full border border-edge bg-bg transition-colors ${expanded ? "text-accent" : "text-txt2 hover:text-txt"}`}
          >
            <Plus size={13} strokeWidth={2} className={`transition-transform ${expanded ? "rotate-45" : ""}`} />
          </button>
          <button
            onClick={() => onInfo?.(tweak)}
            title="Details"
            className="grid h-7 w-7 place-items-center rounded-full border border-edge bg-bg text-txt2 transition-colors hover:text-txt"
          >
            <Info size={13} strokeWidth={2} />
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          {tweak.applied ? (
            <span className="rounded-full bg-success/15 px-3 py-1 text-[11px] font-semibold text-success">Active</span>
          ) : scanOnly ? (
            <span
              title="Not a manual switch — this one is applied live while a game runs, or set in your GPU driver / in-game settings. Open the details (i) to see how."
              className="rounded-full bg-panel2 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-txt2"
            >
              Auto · in-game
            </span>
          ) : (
            <>
              {!advanced && <span className="text-[11px] font-semibold uppercase tracking-wide text-txt3">Activate</span>}
              <Toggle on={selected} onClick={() => onToggle(tweak)} />
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2.5 rounded-chip border border-edge bg-bg px-3.5 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-txt3">What this does</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-txt2">{detail?.what ?? tweak.description}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded bg-panel2 px-2 py-0.5 text-[10px] font-semibold text-txt2">
              {detail ? ACTION_LABEL[detail.action] : "Reads current state (scan-only)"}
            </span>
            <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${riskMeta(tweak.risk).tone}`}>
              {riskMeta(tweak.risk).label}
            </span>
          </div>
          <p className="text-[10.5px] leading-snug text-txt3">{riskMeta(tweak.risk).def}</p>
          {detail && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-txt3">Exactly what changes</p>
              <p className="mt-0.5 break-words font-mono text-[10.5px] leading-relaxed text-txt2">{detail.changes}</p>
            </div>
          )}
          <p className="text-[10.5px] text-txt3">
            Current state:{" "}
            <span className={tweak.applied ? "font-semibold text-success" : "text-txt2"}>
              {tweak.applied ? "Applied" : "Not applied"}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
