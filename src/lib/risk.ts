// Single source of truth for how each risk level is named, coloured and defined.
// Every risk badge, word and definition in the app derives from here — do NOT
// redefine these per-component (there used to be 5 scattered copies). Colours
// are kept per badge shape so this consolidation is pixel-identical to before:
//   - pill : rounded-full badge (tweak cards, game modal) — advanced = purple
//   - chip : bordered chip (change log, confirm modal, undo, diff) — advanced = red
//   - tone : faint inline tag in the technical "what changes" panel
import type { RiskLevel } from "./types";

export interface RiskMeta {
  label: string;
  def: string;
  pill: string;
  chip: string;
  tone: string;
}

export const RISK: Record<RiskLevel, RiskMeta> = {
  safe: {
    label: "Safe",
    def: "No impact on normal Windows functionality.",
    pill: "bg-success/15 text-success",
    chip: "bg-good/15 text-good border-good/30",
    tone: "bg-success/10 text-success",
  },
  moderate: {
    label: "Moderate",
    def: "May affect specific features you use.",
    pill: "bg-warning/15 text-warning",
    chip: "bg-warn/15 text-warn border-warn/30",
    tone: "bg-warning/10 text-warning",
  },
  advanced: {
    label: "Advanced",
    def: "Could break certain Windows functions — for experienced users.",
    pill: "bg-purple-500/15 text-purple-400",
    chip: "bg-accent/15 text-accent border-accent/30",
    tone: "bg-purple-500/10 text-purple-400",
  },
};

/** Safe accessor for callers whose `risk` is a plain string (e.g. FixInfo).
 *  Falls back to the Safe styling for an unknown level rather than throwing. */
export function riskMeta(level: string): RiskMeta {
  return RISK[level as RiskLevel] ?? RISK.safe;
}
