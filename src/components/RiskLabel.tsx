import type { RiskLevel } from "../lib/types";

const STYLES: Record<RiskLevel, { label: string; cls: string }> = {
  safe: { label: "Safe", cls: "bg-good/15 text-good border-good/30" },
  moderate: { label: "Moderate", cls: "bg-warn/15 text-warn border-warn/30" },
  advanced: { label: "Advanced", cls: "bg-accent/15 text-accent border-accent/30" },
};

/** Risk chip shown next to every tweak — the risk field exists on every
 * ChangeLog entry from Checkpoint 9 onward. */
export default function RiskLabel({ level }: { level: RiskLevel }) {
  const { label, cls } = STYLES[level];
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cls}`}
    >
      {label}
    </span>
  );
}
