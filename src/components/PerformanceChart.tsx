import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { useSystemStore } from "../store/systemStore";
import type { PerfSample } from "../lib/types";

// Empty x-axis skeleton so the grid renders before any live data exists.
const EMPTY_AXIS: PerfSample[] = Array.from({ length: 61 }, (_, t) => ({ t }));

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[10.5px] font-medium text-txt2">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function BigTile({
  value,
  unit,
  color,
}: {
  value: string;
  unit: string;
  color: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center py-1">
      <span className="font-display text-[42px] font-bold leading-none text-txt">
        {value}
      </span>
      <span
        className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em]"
        style={{ color }}
      >
        {unit}
      </span>
    </div>
  );
}

/**
 * LIVE PERFORMANCE MONITOR — renders the rolling 60s window pushed by
 * system_stats/frame_stats events. Until Checkpoint 3 delivers real samples,
 * the chart shows an honest empty grid with a waiting overlay.
 */
export default function PerformanceChart() {
  const perfHistory = useSystemStore((s) => s.perfHistory);
  const stats = useSystemStore((s) => s.stats);
  const frameStats = useSystemStore((s) => s.frameStats);

  const hasData = perfHistory.length > 0;
  const data = hasData ? perfHistory : EMPTY_AXIS;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-edge bg-panel p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-txt">
            Live Performance Monitor
          </p>
          <div className="flex items-center gap-3">
            <Legend color="#e3000e" label="FPS" />
            <Legend color="#3e8bff" label="CPU" />
            <Legend color="#2fd466" label="GPU" />
          </div>
        </div>

        <div className="relative h-[210px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -14 }}>
              <CartesianGrid stroke="#1a1a1f" strokeDasharray="0" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                domain={[0, 60]}
                ticks={[0, 15, 30, 45, 60]}
                tickFormatter={(t: number) => (t === 60 ? "Now" : `${60 - t}s`)}
                tick={{ fill: "#55555c", fontSize: 10 }}
                axisLine={{ stroke: "#1f1f24" }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 150]}
                ticks={[0, 50, 100, 150]}
                tick={{ fill: "#55555c", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Line type="monotone" dataKey="fps" stroke="#e3000e" strokeWidth={1.8} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="cpu" stroke="#3e8bff" strokeWidth={1.6} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="gpu" stroke="#2fd466" strokeWidth={1.6} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>

          {!hasData && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="text-center">
                <p className="font-display text-[13px] font-semibold tracking-[0.3em] text-txt3">
                  WAITING FOR LIVE FEED
                </p>
                <p className="mt-1 text-[10.5px] text-txt3">
                  System monitor comes online at Checkpoint 3
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex divide-x divide-edge rounded-2xl border border-edge bg-panel px-2 py-3">
        <BigTile
          value={frameStats ? `${Math.round(frameStats.avgFps)}` : "--"}
          unit="FPS"
          color="#e3000e"
        />
        <BigTile
          value={stats ? `${Math.round(stats.cpuUsagePercent)}%` : "--"}
          unit="CPU"
          color="#3e8bff"
        />
        <BigTile
          value={
            stats?.gpuUsagePercent != null
              ? `${Math.round(stats.gpuUsagePercent)}%`
              : "--"
          }
          unit="GPU"
          color="#2fd466"
        />
      </div>
    </div>
  );
}
