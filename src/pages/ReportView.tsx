import { useEffect, useState } from "react";
import { ArrowRight, Check, Gamepad2, LineChart, Play, Square } from "lucide-react";
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
          <LineChart size={26} strokeWidth={1.75} className="text-accent" />
          <h1 className="text-[38px] font-black uppercase leading-none tracking-tight text-txt">Performance Report</h1>
        </div>
        <p className="mt-1 max-w-xl text-[12.5px] text-txt2">
          The proof loop. Capture a baseline, apply tweaks, then capture a post-run — Mujify only
          ever claims a gain its own measurements back up. No result yet? It says so.
        </p>
      </div>

      {/* Guided flow — real FPS needs a game presenting during BOTH captures */}
      <div
        className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-[12px] ${
          activeGame ? "border-success/25 bg-success/5" : "border-warning/25 bg-warning/5"
        }`}
      >
        <Gamepad2 size={15} className={`mt-0.5 shrink-0 ${activeGame ? "text-success" : "text-warning"}`} />
        {activeGame ? (
          <p className="text-txt2">
            <span className="font-semibold text-txt">{activeGame.name}</span> detected. Play it, capture a{" "}
            <span className="font-semibold text-txt">60s baseline</span>, apply your tweaks, then capture a{" "}
            <span className="font-semibold text-txt">60s post-run</span> — we compare real FPS.
          </p>
        ) : (
          <p className="text-txt2">
            <span className="font-semibold text-warning">Start your game first.</span> FPS is only measured while a
            game is presenting during <span className="font-semibold text-txt">both</span> captures. Without one, we
            measure CPU/RAM/ping only and will not claim an FPS gain.
          </p>
        )}
      </div>

      {/* Capture controls */}
      <div className="flex items-center gap-3 rounded-2xl border border-edge bg-panel p-4">
        <button
          onClick={() => capture("baseline")}
          disabled={phase !== "idle"}
          className="flex items-center gap-2 rounded-xl border border-edge bg-panel2 px-3.5 py-2 text-[12.5px] font-medium text-txt hover:border-edge2 disabled:opacity-60"
        >
          {phase === "baseline" ? <Square size={13} /> : <Play size={13} />}
          {phase === "baseline" ? "Capturing baseline… (~60s)" : "1 · Capture Baseline"}
        </button>
        <ArrowRight size={16} className="text-txt3" />
        <button
          onClick={() => capture("post")}
          disabled={phase !== "idle" || !report}
          className="flex items-center gap-2 rounded-xl border border-edge bg-panel2 px-3.5 py-2 text-[12.5px] font-medium text-txt hover:border-edge2 disabled:opacity-50"
        >
          {phase === "post" ? <Square size={13} /> : <Play size={13} />}
          {phase === "post" ? "Capturing post… (~60s)" : "2 · Capture Post"}
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
          {report.metrics
            .filter((m) => m.measured || m.label !== "Avg FPS")
            .map((m) => (
              <DeltaRow key={m.label} m={m} />
            ))}

          {/* Tweaks applied between the two captures */}
          <div className="mt-4 rounded-xl border border-edge bg-panel2 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-txt3">Tweaks Applied This Session</p>
            {report.appliedTweaks.length === 0 ? (
              <p className="mt-1 text-[12px] text-txt2">No tweaks were applied between the two captures.</p>
            ) : (
              <ul className="mt-1.5 flex flex-col gap-1">
                {report.appliedTweaks.map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-txt">
                    <Check size={13} className="mt-0.5 shrink-0 text-good" /> {t}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-3 rounded-xl border border-edge bg-panel2 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-txt3">Verdict</p>
            <p className="mt-1 text-[13px] text-txt">{report.verdict}</p>
            {!report.fpsMeasured && (
              <p className="mt-1.5 text-[11px] text-txt2">
                No game was presenting during capture, so in-game FPS isn't shown (never guessed).
                Launch a game and re-run to measure real FPS.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
