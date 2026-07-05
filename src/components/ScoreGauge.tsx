import { Clock, Shield, Wifi, Zap, type LucideIcon } from "lucide-react";
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

function netTier(ping: number | null | undefined): string | null {
  if (ping == null) return null;
  if (ping < 20) return "Excellent";
  if (ping < 45) return "Good";
  if (ping < 90) return "Fair";
  return "High";
}

function Chip({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | null }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/10">
        <Icon size={14} strokeWidth={2} className="text-accent" />
      </span>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-txt3">{label}</p>
        <p className="text-[13px] font-medium text-txt">{value ?? "—"}</p>
      </div>
    </div>
  );
}

export default function ScoreGauge() {
  const stats = useSystemStore((s) => s.stats);
  const netStats = useSystemStore((s) => s.netStats);
  const activeGame = useGameStore((s) => s.activeGame);
  const lastOptimizedAt = useTweakStore((s) => s.lastOptimizedAt);

  const score = stats?.systemScore ?? null;
  const powerPlan = stats?.activePowerPlan ?? null;
  const status = score == null ? null : score >= 85 ? "Optimal" : score >= 65 ? "Good" : "Strained";

  return (
    <div className="rounded-card border border-edge bg-card p-6">
      <div className="relative mx-auto w-[260px]">
        <svg viewBox="0 0 260 150" className="w-full">
          <defs>
            <linearGradient id="scoreArc" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8a0009" />
              <stop offset="60%" stopColor="#e3000e" />
              <stop offset="100%" stopColor="#ff3b45" />
            </linearGradient>
          </defs>
          <path
            d="M 26 132 A 104 104 0 0 1 234 132"
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="14"
            strokeLinecap="round"
          />
          {score !== null && (
            <path
              d="M 26 132 A 104 104 0 0 1 234 132"
              fill="none"
              stroke="url(#scoreArc)"
              strokeWidth="14"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${score} 100`}
              style={{ filter: "drop-shadow(0 0 24px rgba(227,0,14,0.25))" }}
            />
          )}
        </svg>
        <div className="absolute inset-x-0 bottom-1 text-center">
          <span className="text-[72px] font-bold leading-none text-txt">{score ?? "--"}</span>
        </div>
      </div>

      <p className="mt-1 text-center text-lg font-bold tracking-[0.15em] text-accent">
        {score !== null ? scoreWord(score) : "AWAITING DATA"}
      </p>
      <p className="mt-1.5 text-center text-sm text-txt2">
        {score !== null
          ? activeGame
            ? `System is tuned. Ready for ${activeGame.name}.`
            : "System is tuned and ready."
          : "Live scoring starts as monitoring comes online."}
      </p>

      <div className="mt-6 flex items-center justify-between gap-2">
        <Chip icon={Clock} label="Last Optimized" value={lastOptimizedAt ? timeAgo(lastOptimizedAt) : "Never"} />
        <Chip icon={Zap} label="Power Plan" value={powerPlan} />
        <Chip icon={Wifi} label="Network" value={netTier(netStats?.pingMs)} />
        <Chip icon={Shield} label="Status" value={status} />
      </div>
    </div>
  );
}
