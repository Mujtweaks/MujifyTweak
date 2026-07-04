import {
  Activity,
  Globe,
  ListX,
  SlidersHorizontal,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useTweakStore } from "../store/tweakStore";
import type { ActivityEntry } from "../lib/types";
import type { PageId } from "../lib/nav";

const KIND_ICON: Record<ActivityEntry["kind"], LucideIcon> = {
  power: Zap,
  tweak: SlidersHorizontal,
  network: Globe,
  scan: Activity,
  info: Activity,
};

function timeAgo(ts: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

interface RecentActivityProps {
  onNavigate: (page: PageId) => void;
}

/**
 * Plain-English feed of everything Mujify changes — populated exclusively by
 * change_log_update events from TweaksEngine (Checkpoint 9). Empty until then.
 */
export default function RecentActivity({ onNavigate }: RecentActivityProps) {
  const activity = useTweakStore((s) => s.activity);

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-edge bg-panel p-4">
      {activity.length === 0 ? (
        <div className="grid flex-1 place-items-center py-6">
          <div className="max-w-[260px] text-center">
            <ListX size={22} strokeWidth={1.5} className="mx-auto text-txt3" />
            <p className="mt-2 text-[13px] font-semibold text-txt">
              No activity yet
            </p>
            <p className="mt-1 text-[11.5px] leading-snug text-txt2">
              Every change Mujify makes will be logged here in plain English —
              each one undoable. TweaksEngine lands at Checkpoint 9.
            </p>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {activity.slice(0, 6).map((entry) => {
            const Icon = KIND_ICON[entry.kind];
            return (
              <li
                key={entry.id}
                className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.03]"
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    entry.status === "ok" ? "bg-good" : "bg-warn"
                  }`}
                />
                <Icon size={15} strokeWidth={1.75} className="shrink-0 text-accent" />
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-txt">
                  {entry.text}
                </span>
                <span className="shrink-0 text-[11px] text-txt3">
                  {timeAgo(entry.timestamp)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <button
        onClick={() => onNavigate("changelog")}
        className="mt-3 self-end text-[12px] font-semibold text-accent transition-colors hover:text-accent-hi"
      >
        View Full Log →
      </button>
    </div>
  );
}
