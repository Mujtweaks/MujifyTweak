import { Clock, ShieldCheck, Wifi, Zap, type LucideIcon } from "lucide-react";
import { useSystemStore } from "../store/systemStore";
import { useGameStore } from "../store/gameStore";
import { useTweakStore } from "../store/tweakStore";

function scoreWord(score: number): string {
  if (score >= 85) return "EXCELLENT";
  if (score >= 70) return "GOOD";
  if (score >= 50) return "FAIR";
  return "POOR";
}

function timeAgo(ts: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

function SubStat({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex flex-1 items-center justify-center gap-2.5 py-1">
      <span className="grid h-7 w-7 place-items-center rounded-full border border-accent/25 bg-accent/10">
        <Icon size={13} strokeWidth={2} className="text-accent" />
      </span>
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-txt3">
          {label}
        </p>
        <p className="text-[12px] font-semibold text-txt">{value ?? "—"}</p>
      </div>
    </div>
  );
}

/**
 * Semicircular system score. The score comes exclusively from SystemMonitor's
 * computed system_score (Checkpoint 3) — until then the gauge honestly reads
 * "--" with an empty arc. No invented numbers.
 */
function networkTierFor(ping: number | null | undefined): string | null {
  if (ping == null) return null;
  if (ping < 20) return "Excellent";
  if (ping < 45) return "Good";
  if (ping < 90) return "Fair";
  return "High";
}

export default function ScoreGauge() {
  const stats = useSystemStore((s) => s.stats);
  const netStats = useSystemStore((s) => s.netStats);
  const activeGame = useGameStore((s) => s.activeGame);
  const lastOptimizedAt = useTweakStore((s) => s.lastOptimizedAt);

  const score = stats?.systemScore ?? null;
  // Derived from real data — power plan straight from the OS, status/network from
  // live score and ping. Null (shows "—") until the first stats tick arrives.
  const powerPlan = stats?.activePowerPlan ?? null;
  const networkTier = networkTierFor(netStats?.pingMs);
  const systemStatus =
    score == null ? null : score >= 85 ? "Optimal" : score >= 65 ? "Good" : "Strained";

  return (
    <div className="rounded-2xl border border-edge bg-panel px-6 pb-4 pt-6">
      <div className="relative mx-auto w-[240px]">
        <svg viewBox="0 0 240 132" className="w-full">
          <defs>
            <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#7f0008" />
              <stop offset="55%" stopColor="#e3000e" />
              <stop offset="100%" stopColor="#ff3b45" />
            </linearGradient>
          </defs>
          {/* track */}
          <path
            d="M 24 120 A 96 96 0 0 1 216 120"
            fill="none"
            stroke="#1c1c21"
            strokeWidth="13"
            strokeLinecap="round"
          />
          {/* value arc — pathLength=100 lets dasharray map 1:1 to score */}
          {score !== null && (
            <path
              d="M 24 120 A 96 96 0 0 1 216 120"
              fill="none"
              stroke="url(#scoreGrad)"
              strokeWidth="13"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${score} 100`}
              style={{ filter: "drop-shadow(0 0 10px rgba(227,0,14,0.55))" }}
            />
          )}
        </svg>
        <div className="absolute inset-x-0 bottom-0 text-center">
          <span className="font-display text-[64px] font-bold leading-none text-txt">
            {score ?? "--"}
          </span>
          <span className="ml-1 text-[13px] font-medium text-txt3">/100</span>
        </div>
      </div>

      <p className="mt-2 text-center font-display text-[15px] font-semibold tracking-[0.45em] text-accent">
        {score !== null ? scoreWord(score) : "AWAITING DATA"}
      </p>
      <p className="mt-1 text-center text-[12px] text-txt2">
        {score !== null
          ? activeGame
            ? `System is tuned. Ready for ${activeGame.name}.`
            : "System is tuned and ready."
          : "Live scoring begins when system monitoring comes online (Checkpoint 3)."}
      </p>

      <div className="mt-4 flex divide-x divide-edge border-t border-edge pt-3.5">
        <SubStat
          icon={Clock}
          label="Last Optimized"
          value={lastOptimizedAt ? timeAgo(lastOptimizedAt) : null}
        />
        <SubStat icon={Zap} label="Power Plan" value={powerPlan} />
        <SubStat icon={Wifi} label="Network" value={networkTier} />
        <SubStat icon={ShieldCheck} label="System Status" value={systemStatus} />
      </div>
    </div>
  );
}
