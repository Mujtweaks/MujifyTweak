import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { AlertTriangle, ArrowRight, Search, X } from "lucide-react";
import { dismissDetectiveReport, getDetectiveReport } from "../lib/backend";
import type { DetectiveReport } from "../lib/types";
import type { PageId } from "../lib/nav";

// A journal action → where the user goes to act on it (always through the normal
// confirm pipeline — the Detective never applies anything itself).
const ACTION: Record<string, { label: string; page: PageId }> = {
  driver_rollback: { label: "Driver options", page: "drivers" },
  health_scan: { label: "Run health scan", page: "diagnostics" },
  power_high_perf: { label: "Fix power plan", page: "tweaks" },
  max_refresh_rate: { label: "Fix refresh rate", page: "tweaks" },
};

/**
 * FPS Drop Detective card — appears on the Dashboard only when a game ran
 * meaningfully below its baseline. Shows the honest comparison and what CHANGED
 * on the PC since it last ran normally (correlation, never causation). Nothing
 * is applied here; action links route to the normal confirm pipeline.
 */
export default function DetectiveCard({ onNavigate }: { onNavigate: (p: PageId) => void }) {
  const [report, setReport] = useState<DetectiveReport | null>(null);

  useEffect(() => {
    void getDetectiveReport().then(setReport);
    const un = listen<DetectiveReport>("detective_report", (e) => setReport(e.payload));
    return () => {
      void un.then((f) => f());
    };
  }, []);

  if (!report) return null;

  const dismiss = () => {
    void dismissDetectiveReport();
    setReport(null);
  };

  return (
    <div className="rounded-card border border-accent/30 bg-accent/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/15">
            <Search size={17} className="text-accent" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent">FPS Drop Detective</p>
            <p className="text-[15px] font-bold leading-tight text-txt">
              {report.game} is running ~{Math.round(report.dropPct)}% below its usual FPS
            </p>
          </div>
        </div>
        <button onClick={dismiss} className="shrink-0 text-txt3 hover:text-txt" aria-label="Dismiss">
          <X size={16} />
        </button>
      </div>

      <p className="mt-2 text-[12px] text-txt2">
        Usually about <span className="font-semibold text-txt">{Math.round(report.baselineFps)} FPS</span>, this run
        averaged <span className="font-semibold text-txt">{Math.round(report.currentFps)} FPS</span>.
      </p>

      {report.changes.length > 0 ? (
        <>
          <p className="mt-3 text-[12px] font-semibold text-txt">
            Here's what changed on your PC since it last ran normally:
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {report.changes.map((c, i) => {
              const act = c.action ? ACTION[c.action] : undefined;
              return (
                <li key={i} className="flex items-center gap-2.5 rounded-chip border border-edge bg-card px-3 py-2.5">
                  <AlertTriangle size={13} className="shrink-0 text-warning" />
                  <span className="flex-1 text-[12px] text-txt">{c.summary}</span>
                  {act && (
                    <button
                      onClick={() => onNavigate(act.page)}
                      className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-accent hover:text-accent-hi"
                    >
                      {act.label} <ArrowRight size={12} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="mt-3 rounded-chip border border-edge bg-card px-3 py-2.5 text-[12px] text-txt2">
          Nothing obvious changed on your PC in this window — it could be a game update itself, or thermals. The
          session comparison above is your starting point.
        </p>
      )}

      <p className="mt-3 text-[10.5px] leading-snug text-txt3">
        These are things that changed around the same time — correlation, not proof of cause. Nothing here is applied
        automatically.
      </p>
    </div>
  );
}
