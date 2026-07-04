import { Clock, Wifi, Zap, type LucideIcon } from "lucide-react";
import { useSystemStore } from "../store/systemStore";

const R = 30;
const CIRC = 2 * Math.PI * R;

function MiniGauge({
  label,
  percent,
  sub,
}: {
  label: string;
  percent: number | null;
  sub: string | null;
}) {
  const frac = percent === null ? 0 : Math.min(100, Math.max(0, percent)) / 100;
  return (
    <div className="flex flex-1 flex-col items-center gap-1 py-1">
      <div className="relative h-[76px] w-[76px]">
        <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90">
          <circle cx="38" cy="38" r={R} fill="none" stroke="#1c1c21" strokeWidth="6" />
          {percent !== null && (
            <circle
              cx="38"
              cy="38"
              r={R}
              fill="none"
              stroke="#e3000e"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${frac * CIRC} ${CIRC}`}
              style={{ filter: "drop-shadow(0 0 6px rgba(227,0,14,0.5))" }}
            />
          )}
        </svg>
        <span className="font-display absolute inset-0 grid place-items-center text-[17px] font-bold text-txt">
          {percent !== null ? `${Math.round(percent)}%` : "--"}
        </span>
      </div>
      <p className="text-[11px] font-semibold text-txt">{label}</p>
      <p className="text-[10.5px] text-txt3">{sub ?? "—"}</p>
    </div>
  );
}

function InfoTile({
  icon: Icon,
  value,
  label,
  sub,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  sub: string;
}) {
  return (
    <div className="flex flex-1 items-center gap-3 rounded-xl border border-edge bg-panel2 px-3.5 py-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-accent/25 bg-accent/10">
        <Icon size={14} strokeWidth={2} className="text-accent" />
      </span>
      <div className="min-w-0">
        <p className="font-display text-[19px] font-bold leading-tight text-txt">
          {value}
        </p>
        <p className="truncate text-[9.5px] font-semibold uppercase tracking-[0.1em] text-txt3">
          {label} <span className="normal-case tracking-normal">· {sub}</span>
        </p>
      </div>
    </div>
  );
}

/**
 * Live utilization circles + ping/FPS/frame-time tiles. Every value is null
 * until the matching monitor emits real data (Checkpoints 3, 6, 7).
 */
export default function StatGauges() {
  const stats = useSystemStore((s) => s.stats);
  const frameStats = useSystemStore((s) => s.frameStats);
  const netStats = useSystemStore((s) => s.netStats);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-edge bg-panel p-4">
      <div className="flex divide-x divide-edge">
        <MiniGauge
          label="CPU"
          percent={stats?.cpuUsagePercent ?? null}
          sub={stats?.cpuTempC != null ? `${Math.round(stats.cpuTempC)}°C` : null}
        />
        <MiniGauge
          label="GPU"
          percent={stats?.gpuUsagePercent ?? null}
          sub={stats?.gpuTempC != null ? `${Math.round(stats.gpuTempC)}°C` : null}
        />
        <MiniGauge
          label="RAM"
          percent={stats?.ramUsagePercent ?? null}
          sub={
            stats
              ? `${stats.ramUsedGb.toFixed(1)} / ${stats.ramTotalGb.toFixed(0)} GB`
              : null
          }
        />
      </div>

      <div className="flex gap-3">
        <InfoTile
          icon={Wifi}
          value={
            netStats?.pingMs != null ? `${Math.round(netStats.pingMs)}ms` : "--"
          }
          label="Ping"
          sub={
            netStats?.jitterMs != null
              ? `±${netStats.jitterMs.toFixed(0)}ms jitter`
              : "—"
          }
        />
        <InfoTile
          icon={Zap}
          value={frameStats ? `${Math.round(frameStats.avgFps)}` : "--"}
          label="FPS"
          sub={frameStats ? `1% Low: ${Math.round(frameStats.onePercentLow)}` : "—"}
        />
        <InfoTile
          icon={Clock}
          value={frameStats ? `${frameStats.avgFrameTimeMs.toFixed(1)}ms` : "--"}
          label="Frame Time"
          sub={
            frameStats
              ? frameStats.frameTimeStability < 2
                ? "Stable"
                : "Unstable"
              : "—"
          }
        />
      </div>
    </div>
  );
}
