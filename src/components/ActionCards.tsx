import {
  BarChart3,
  LineChart,
  ListChecks,
  RotateCcw,
  Search,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { PageId } from "../lib/nav";

interface ActionCardsProps {
  onNavigate: (page: PageId) => void;
}

interface ActionDef {
  title: string;
  desc: string;
  icon: LucideIcon;
  primary?: boolean;
  goto: PageId;
}

// Each card navigates to the real page that performs the action — no dead clicks.
const ACTIONS: ActionDef[] = [
  {
    title: "BOOST",
    desc: "Pick tweaks and apply them — confirmed, logged, reversible.",
    icon: Zap,
    primary: true,
    goto: "tweaks",
  },
  {
    title: "SCAN",
    desc: "Check your system and see what can be optimized.",
    icon: Search,
    goto: "optimizer",
  },
  {
    title: "ANALYZE",
    desc: "See what's limiting performance right now.",
    icon: BarChart3,
    goto: "diagnostics",
  },
  {
    title: "REVERT ALL",
    desc: "Review the change log and undo anything.",
    icon: RotateCcw,
    goto: "changelog",
  },
];

export default function ActionCards({ onNavigate }: ActionCardsProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        {ACTIONS.map(({ title, desc, icon: Icon, primary, goto }) => (
          <button
            key={title}
            onClick={() => onNavigate(goto)}
            className={`flex items-start gap-3.5 rounded-2xl border p-4 text-left transition-transform active:scale-[0.99] ${
              primary
                ? "border-accent/60 bg-gradient-to-b from-accent to-[#a3000a] shadow-[0_0_26px_rgba(227,0,14,0.30)]"
                : "border-edge bg-panel hover:border-edge2"
            }`}
          >
            <span
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                primary ? "bg-white/15" : "border border-edge bg-panel2"
              }`}
            >
              <Icon
                size={18}
                strokeWidth={2}
                className={primary ? "text-white" : "text-txt"}
              />
            </span>
            <span>
              <span
                className={`font-display block text-[16px] font-bold tracking-wide ${
                  primary ? "text-white" : "text-txt"
                }`}
              >
                {title}
              </span>
              <span
                className={`mt-0.5 block text-[11.5px] leading-snug ${
                  primary ? "text-white/85" : "text-txt2"
                }`}
              >
                {desc}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onNavigate("report")}
          className="flex items-center justify-center gap-2 rounded-xl border border-edge bg-panel py-2.5 text-[12.5px] font-medium text-txt transition-colors hover:border-edge2"
        >
          <LineChart size={14} strokeWidth={2} className="text-txt2" />
          Before/After Report
          <span className="text-accent">→</span>
        </button>
        <button
          onClick={() => onNavigate("changelog")}
          className="flex items-center justify-center gap-2 rounded-xl border border-edge bg-panel py-2.5 text-[12.5px] font-medium text-txt transition-colors hover:border-edge2"
        >
          <ListChecks size={14} strokeWidth={2} className="text-txt2" />
          Change Log
          <span className="text-accent">→</span>
        </button>
      </div>
    </div>
  );
}
