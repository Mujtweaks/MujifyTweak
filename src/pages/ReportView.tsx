import { useEffect, useState } from "react";
import { ArrowRight, LineChart, Play, Square } from "lucide-react";
import { getLatestReport, runBenchmark } from "../lib/backend";
import { useGameStore } from "../store/gameStore";
import type { BenchmarkReport, MetricDelta } from "../lib/types";

function DeltaRow({ m }: { m: MetricDelta }) {
  const fmt = (v: number | null) => (v == null ? "—" : v.toFixed(1));
  let arrow = "";
  let color = "text-txt2";
  if (m.measured && m.deltaPct != null) {
    const improved = m.better === "higher" ? m.deltaPct > 0 : m.deltaPct < 0;
    const flat = Math.abs(m.deltaPct) < 1;
    arrow = flat ? "→" : improved ? "▲" : "▼";
    color = flat ? "text-txt2" : improved ? "text-good" : "text-accent";
  }
  return (
    <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] items-center gap-2 border-t border-edge py-2.5 text-[12.5px]">
      <span className="text-txt2">{m.label}</span>
      <span className="text-txt">{fmt(m.before)}</span>
      <span className="text-txt">{fmt(m.after)}</span>
      <span className={`text-right font-semibold ${color}`}>
        {!m.measured
          ? "not measured"
          : m.deltaPct == null
            ? "—"
            : `${arrow} ${m.deltaPct > 0 ? "+" : ""}${m.deltaPct.toFixed(1)}%`}
      </span>
    </div>
  );
}

/**
 * Before/After proof report. Shows the latest real Baseline→Post→Delta result,
 * or an honest empty state. FPS rows read "not measured" until PresentMon is
 * bundled — never a fabricated gain percentage.
 */
export default function ReportView() {
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [phase, setPhase] = useState<"idle" | "baseline" | "post">("idle");
  const activeGame = useGameStore((s) => s.activeGame);

  const refresh = async () => setReport(await getLatestReport());

  useEffect(() => {
    void refresh();
  }, []);

  const capture = async (which: "baseline" | "post") => {
    setPhase(which);
    await runBenchmark(which, activeGame?.name ?? null);
    await refresh();
    setPhase("idle");
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <div className="flex items-center gap-2.5">
          <LineChart size={20} strokeWidth={1.75} className="text-accent" />
          <h1 className="font-display text-2xl font-bold tracking-wide text-txt">Before / After Report</h1>
        </div>
        <p className="mt-1 max-w-xl text-[12.5px] text-txt2">
          The proof loop. Capture a baseline, apply tweaks, then capture a post-run — Mujify only
          ever claims a gain its own measurements back up. No result yet? It says so.
        </p>
      </div>

      {/* Capture controls */}
      <div className="flex items-center gap-3 rounded-2xl border border-edge bg-panel p-4">
        <button
          onClick={() => capture("baseline")}
          disabled={phase !== "idle"}
          className="flex items-center gap-2 rounded-xl border border-edge bg-panel2 px-3.5 py-2 text-[12.5px] font-medium text-txt hover:border-edge2 disabled:opacity-60"
        >
          {phase === "baseline" ? <Square size={13} /> : <Play size={13} />}
          {phase === "baseline" ? "Capturing baseline… (~20s)" : "1 · Capture Baseline"}
        </button>
        <ArrowRight size={16} className="text-txt3" />
        <button
          onClick={() => capture("post")}
          disabled={phase !== "idle" || !report}
          className="flex items-center gap-2 rounded-xl border border-edge bg-panel2 px-3.5 py-2 text-[12.5px] font-medium text-txt hover:border-edge2 disabled:opacity-50"
        >
          {phase === "post" ? <Square size={13} /> : <Play size={13} />}
          {phase === "post" ? "Capturing post… (~20s)" : "2 · Capture Post"}
        </button>
        <span className="ml-auto text-[11px] text-txt3">Same method, same duration, both ways.</span>
      </div>

      {!report ? (
        <div className="grid place-items-center rounded-2xl border border-edge bg-panel py-16">
          <div className="text-center">
            <LineChart size={26} strokeWidth={1.5} className="mx-auto text-txt3" />
            <p className="mt-2 text-[13px] font-semibold text-txt">No report yet</p>
            <p className="mt-1 max-w-[320px] text-[11.5px] text-txt2">
              Run a baseline capture to begin. You'll never see a fabricated percentage here — only
              measured deltas, and honest "not measured yet" where data doesn't exist.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-edge bg-panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-txt">
              {report.gameName ? `Results — ${report.gameName}` : "System Results"}
            </p>
            <p className="text-[10.5px] text-txt3">{new Date(report.createdAt).toLocaleString()}</p>
          </div>

          <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2 text-[10px] font-bold uppercase tracking-wider text-txt3">
            <span>Metric</span>
            <span>Before</span>
            <span>After</span>
            <span className="text-right">Δ</span>
          </div>
          {report.metrics.map((m) => (
            <DeltaRow key={m.label} m={m} />
          ))}

          <div className="mt-4 rounded-xl border border-edge bg-panel2 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-txt3">Verdict</p>
            <p className="mt-1 text-[13px] text-txt">{report.verdict}</p>
            {!report.fpsMeasured && (
              <p className="mt-1.5 text-[11px] text-txt2">
                FPS and frame-time deltas will appear here once PresentMon is bundled — until then
                they're honestly marked "not measured", never guessed.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
