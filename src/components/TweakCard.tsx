import { Info, Plus, Sparkles, TrendingUp } from "lucide-react";
import { CATEGORY_META, boostPct } from "../lib/categories";
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
  const boost = boostPct(tweak.impact);
  const scanOnly = !tweak.appliable || !tweak.available;

  return (
    <div
      className={`rounded-2xl border p-5 transition-colors ${
        advanced
          ? "border-purple-800/40 bg-gradient-to-br from-purple-900/10 to-transparent hover:border-purple-700/50"
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
        <span className={`flex items-center gap-1 text-[12px] font-bold ${advanced ? "text-purple-400" : "text-success"}`}>
          {advanced ? <Sparkles size={13} /> : <TrendingUp size={13} />}
          +{boost}% Boost
        </span>
      </div>

      {/* Middle */}
      <p className="mt-3 text-[15px] font-bold text-txt">{tweak.title}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-txt2">{tweak.description}</p>

      {/* Bottom row */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onInfo?.(tweak)}
            title="Learn more"
            className="grid h-7 w-7 place-items-center rounded-full border border-edge bg-bg text-txt2 transition-colors hover:text-txt"
          >
            <Plus size={13} strokeWidth={2} />
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
            <>
              <span className="text-[10px] font-medium uppercase tracking-wide text-txt3">Scan-only</span>
              <Toggle on={false} onClick={() => {}} disabled />
            </>
          ) : (
            <>
              {!advanced && <span className="text-[11px] font-semibold uppercase tracking-wide text-txt3">Activate</span>}
              <Toggle on={selected} onClick={() => onToggle(tweak)} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
