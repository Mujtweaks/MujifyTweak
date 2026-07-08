import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { useSystemStore } from "../store/systemStore";
import { useAnimatedNumber } from "../lib/useAnimatedNumber";
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

function Big({ value, suffix, label, color }: { value: number | null; suffix?: string; label: string; color: string }) {
  return (
    <div className="flex flex-1 flex-col items-center">
      {value !== null ? (
        <span className="text-5xl font-bold tabular-nums text-txt">
          {Math.round(value)}
          {suffix}
        </span>
      ) : (
        <span className="skeleton mt-1.5 block h-[42px] w-[64px] rounded-lg" />
      )}
      <span className="mt-1 text-[11px] font-bold uppercase tracking-widest" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

const BNECK: Record<string, { label: string; tone: string }> = {
  gpu: { label: "GPU-BOUND", tone: "bg-success/10 text-success" },
  cpu: { label: "CPU-BOUND", tone: "bg-cpu/10 text-cpu" },
  balanced: { label: "BALANCED", tone: "bg-panel2 text-txt2" },
  capped: { label: "FRAME-CAPPED", tone: "bg-panel2 text-txt2" },
};

export default function PerformanceChart() {
  const perfHistory = useSystemStore((s) => s.perfHistory);
  const stats = useSystemStore((s) => s.stats);
  const frameStats = useSystemStore((s) => s.frameStats);

  const hasData = perfHistory.length > 0;
  const data = hasData ? perfHistory : EMPTY;
  const bottleneck = frameStats?.bottleneck ?? null;

  // Roll the big numbers to their new value instead of snapping (~150ms).
  const animFps = useAnimatedNumber(frameStats ? Math.round(frameStats.avgFps) : null, { first: 150, rest: 150 });
  const animCpu = useAnimatedNumber(stats ? stats.cpuUsagePercent : null, { first: 150, rest: 150 });
  const animGpu = useAnimatedNumber(stats?.gpuUsagePercent ?? null, { first: 150, rest: 150 });

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card border border-edge bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-txt3">
              {hasData && <span className="live-dot h-1.5 w-1.5 rounded-full bg-success text-success" />}
              Live Performance Monitor
            </p>
            {bottleneck && BNECK[bottleneck] && (
              <span
                className={`rounded px-2 py-0.5 text-[9px] font-bold tracking-wide ${BNECK[bottleneck].tone}`}
                title="Live bottleneck from GPU-busy vs frame time (PresentMon)"
              >
                {BNECK[bottleneck].label}
              </span>
            )}
          </div>
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
        <Big value={animFps} label="FPS" color="#e3000e" />
        <Big value={animCpu} suffix="%" label="CPU" color="#4a9eff" />
        <Big value={animGpu} suffix="%" label="GPU" color="#22c55e" />
      </div>
    </div>
  );
}
