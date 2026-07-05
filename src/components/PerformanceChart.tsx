import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { useSystemStore } from "../store/systemStore";
import type { PerfSample } from "../lib/types";

const EMPTY: PerfSample[] = Array.from({ length: 61 }, (_, t) => ({ t }));

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[10.5px] font-medium text-txt2">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function Big({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="flex flex-1 flex-col items-center">
      <span className="text-5xl font-bold text-txt">{value}</span>
      <span className="mt-1 text-[11px] font-bold uppercase tracking-widest" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

export default function PerformanceChart() {
  const perfHistory = useSystemStore((s) => s.perfHistory);
  const stats = useSystemStore((s) => s.stats);
  const frameStats = useSystemStore((s) => s.frameStats);

  const hasData = perfHistory.length > 0;
  const data = hasData ? perfHistory : EMPTY;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card border border-edge bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-txt3">
            {hasData && <span className="live-dot h-1.5 w-1.5 rounded-full bg-success text-success" />}
            Live Performance Monitor
          </p>
          <div className="flex items-center gap-3">
            <Legend color="#e3000e" label="FPS" />
            <Legend color="#4a9eff" label="CPU" />
            <Legend color="#22c55e" label="GPU" />
          </div>
        </div>

        <div className="relative h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                domain={[0, 60]}
                ticks={[0, 20, 40, 60]}
                tickFormatter={(t: number) => (t === 60 ? "Now" : `${60 - t}s`)}
                tick={{ fill: "#444", fontSize: 10 }}
                axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                tickLine={false}
              />
              <YAxis domain={[0, 150]} ticks={[0, 50, 100, 150]} tick={{ fill: "#444", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Line type="monotone" dataKey="fps" stroke="#e3000e" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="cpu" stroke="#4a9eff" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="gpu" stroke="#22c55e" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          {!hasData && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <p className="text-[11px] uppercase tracking-[0.2em] text-txt3">Waiting for live feed</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex rounded-card border border-edge bg-card px-2 py-4">
        <Big value={frameStats ? `${Math.round(frameStats.avgFps)}` : "--"} label="FPS" color="#e3000e" />
        <Big value={stats ? `${Math.round(stats.cpuUsagePercent)}%` : "--"} label="CPU" color="#4a9eff" />
        <Big value={stats?.gpuUsagePercent != null ? `${Math.round(stats.gpuUsagePercent)}%` : "--"} label="GPU" color="#22c55e" />
      </div>
    </div>
  );
}
