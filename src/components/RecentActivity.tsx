import { Activity, Globe, ShieldCheck, SlidersHorizontal, Zap, type LucideIcon } from "lucide-react";
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

export default function RecentActivity({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const activity = useTweakStore((s) => s.activity);

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-card border border-edge bg-card p-5">
      {activity.length === 0 ? (
        <div className="grid flex-1 place-items-center py-4">
          <div className="max-w-[260px] text-center">
            <ShieldCheck size={22} strokeWidth={1.5} className="mx-auto text-txt3" />
            <p className="mt-2 text-[13px] font-semibold text-txt">No activity yet</p>
            <p className="mt-1 text-[11.5px] leading-snug text-txt2">
              Every change Mujify makes is logged here in plain English — each one undoable. Your
              system is currently untouched.
            </p>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col">
          {activity.slice(0, 4).map((e) => {
            const Icon = KIND_ICON[e.kind];
            return (
              <li key={e.id} className="flex items-center gap-3 border-b border-edge py-3 last:border-0">
                <span className={`h-2 w-2 shrink-0 rounded-full ${e.status === "ok" ? "bg-success" : "bg-warning"}`} />
                <Icon size={15} strokeWidth={1.75} className="shrink-0 text-accent" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-txt">{e.text}</span>
                <span className="shrink-0 text-[11px] text-txt3">{timeAgo(e.timestamp)}</span>
              </li>
            );
          })}
        </ul>
      )}
      <button
        onClick={() => onNavigate("changelog")}
        className="mt-3 block self-end text-[13px] font-medium text-accent transition-colors hover:text-accent-hi"
      >
        View Full Log →
      </button>
    </div>
  );
}
