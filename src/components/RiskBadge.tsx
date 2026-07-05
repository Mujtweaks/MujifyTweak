import type { RiskLevel } from "../lib/types";

const STYLES: Record<RiskLevel, { label: string; cls: string }> = {
  safe: { label: "Safe", cls: "bg-success/15 text-success" },
  moderate: { label: "Moderate", cls: "bg-warning/15 text-warning" },
  advanced: { label: "Advanced", cls: "bg-purple-500/15 text-purple-400" },
};

/** RIP-style risk pill — green/yellow/purple. */
export default function RiskBadge({ level }: { level: RiskLevel }) {
  const { label, cls } = STYLES[level];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}
