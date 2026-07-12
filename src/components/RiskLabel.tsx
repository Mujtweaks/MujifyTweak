import { riskMeta } from "../lib/risk";
import type { RiskLevel } from "../lib/types";

/** Bordered risk chip shown next to a logged/queued change. Styling lives in
 *  lib/risk.ts (the single source of truth for every risk badge). */
export default function RiskLabel({ level }: { level: RiskLevel }) {
  const { label, chip } = riskMeta(level);
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${chip}`}
    >
      {label}
    </span>
  );
}
