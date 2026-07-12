import { riskMeta } from "../lib/risk";
import type { RiskLevel } from "../lib/types";

/** RIP-style risk pill — green/amber/purple. Styling lives in lib/risk.ts. */
export default function RiskBadge({ level }: { level: RiskLevel }) {
  const { label, pill } = riskMeta(level);
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${pill}`}>
      {label}
    </span>
  );
}
