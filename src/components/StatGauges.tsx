import { Clock, Wifi, Zap, type LucideIcon } from "lucide-react";
import { useSystemStore } from "../store/systemStore";

const R = 34;
const CIRC = 2 * Math.PI * R;

function Ring({ label, percent, sub, color }: { label: string; percent: number | null; sub: string | null; color: string }) {
  const frac = percent === null ? 0 : Math.min(100, Math.max(0, percent)) / 100;
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5">
      <div className="relative h-[84px] w-[84px]">
        <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90">
          <circle cx="42" cy="42" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
          {percent !== null && (
            <circle
              cx="42"
              cy="42"
              r={R}
              fill="none"
              stroke={color}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${frac * CIRC} ${CIRC}`}
              style={{ filter: `drop-shadow(0 0 6px ${color}66)` }}
            />
          )}
        </svg>
        <span className="absolute inset-0 grid place-items-center text-xl font-bold text-txt">
          {percent !== null ? `${Math.round(percent)}%` : "--"}
        </span>
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-txt3">{label}</p>
      <p className="text-[11px] text-txt2">{sub ?? "—"}</p>
    </div>
  );
}

function MetricChip({
  icon: Icon,
  value,
  label,
  sub,
  green,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  sub: string;
  green?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col gap-0.5 rounded-chip border border-edge bg-bg p-3">
      <Icon size={15} strokeWidth={2} className="text-accent" />
      <p className="mt-1 text-lg font-bold text-txt">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-txt3">{label}</p>
      <p className={`text-[11px] ${green ? "text-success" : "text-txt2"}`}>{sub}</p>
    </div>
  );
}

export default function StatGauges() {
  const stats = useSystemStore((s) => s.stats);
  const frameStats = useSystemStore((s) => s.frameStats);
  const netStats = useSystemStore((s) => s.netStats);

  return (
    <div className="flex flex-col gap-4 rounded-card border border-edge bg-card p-5">
      <div className="flex">
        <Ring
          label="CPU"
          color="#e3000e"
          percent={stats?.cpuUsagePercent ?? null}
          sub={stats?.cpuTempC != null ? `${Math.round(stats.cpuTempC)}°C` : null}
        />
        <Ring
          label="GPU"
          color="#4a9eff"
          percent={stats?.gpuUsagePercent ?? null}
          sub={stats?.gpuTempC != null ? `${Math.round(stats.gpuTempC)}°C` : null}
        />
        <Ring
          label="RAM"
          color="#a855f7"
          percent={stats?.ramUsagePercent ?? null}
          sub={stats ? `${stats.ramUsedGb.toFixed(1)} / ${stats.ramTotalGb.toFixed(0)} GB` : null}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <MetricChip
          icon={Wifi}
          value={netStats?.pingMs != null ? `${Math.round(netStats.pingMs)}ms` : "--"}
          label="Ping"
          sub={netStats?.jitterMs != null ? `±${netStats.jitterMs.toFixed(0)}ms jitter` : "—"}
        />
        <MetricChip
          icon={Zap}
          value={frameStats ? `${Math.round(frameStats.avgFps)}` : "--"}
          label="FPS"
          sub={frameStats ? `1% Low: ${Math.round(frameStats.onePercentLow)}` : "—"}
        />
        <MetricChip
          icon={Clock}
          value={frameStats ? `${frameStats.avgFrameTimeMs.toFixed(1)}ms` : "--"}
          label="Frame Time"
          sub={frameStats ? (frameStats.frameTimeStability < 2 ? "Stable" : "Unstable") : "—"}
          green={frameStats ? frameStats.frameTimeStability < 2 : false}
        />
      </div>
    </div>
  );
}
