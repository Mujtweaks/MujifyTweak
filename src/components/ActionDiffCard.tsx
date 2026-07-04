import RiskLabel from "./RiskLabel";
import type { RiskLevel } from "../lib/types";

interface ActionDiffCardProps {
  target: string;
  before: string;
  after: string;
  risk: RiskLevel;
  onApply: () => void;
  onSkip: () => void;
}

/**
 * Exact-change preview shown BEFORE any action is applied (v2.0 advanced
 * tweaks and v2.5 AI fixes both use this — never apply without showing it).
 */
export default function ActionDiffCard({
  target,
  before,
  after,
  risk,
  onApply,
  onSkip,
}: ActionDiffCardProps) {
  return (
    <div className="rounded-xl border border-edge bg-panel p-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-txt2">
          {target}
        </p>
        <RiskLabel level={risk} />
      </div>
      <div className="mt-2 flex items-center gap-2 font-mono text-[12px]">
        <span className="rounded bg-accent/10 px-1.5 py-0.5 text-accent line-through">
          {before}
        </span>
        <span className="text-txt3">→</span>
        <span className="rounded bg-good/10 px-1.5 py-0.5 text-good">{after}</span>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={onApply}
          className="rounded-lg bg-accent px-3 py-1.5 text-[11.5px] font-semibold text-white transition-colors hover:bg-accent-hi"
        >
          Apply
        </button>
        <button
          onClick={onSkip}
          className="rounded-lg border border-edge bg-panel2 px-3 py-1.5 text-[11.5px] font-medium text-txt2 transition-colors hover:text-txt"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
