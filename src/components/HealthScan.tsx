import { useState } from "react";
import { AlertOctagon, AlertTriangle, CheckCircle2, Info, RefreshCw, Stethoscope, type LucideIcon } from "lucide-react";
import { scanSystemHealth } from "../lib/backend";
import { useGameStore } from "../store/gameStore";
import type { SystemHealthReport } from "../lib/types";

const SEV: Record<string, { tone: string; ring: string; icon: LucideIcon }> = {
  critical: { tone: "text-accent", ring: "border-accent/30 bg-accent/5", icon: AlertOctagon },
  warning: { tone: "text-warning", ring: "border-warning/30 bg-warning/5", icon: AlertTriangle },
  info: { tone: "text-txt2", ring: "border-edge bg-bg", icon: Info },
};
const FIX_LABEL: Record<string, string> = {
  "one-click": "One-click fixable",
  bios: "BIOS setting",
  manual: "Manual",
  "detection-only": "Advisory",
};
const SEV_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

/**
 * Bottleneck / Health Scan — the diagnosis layer. Finds the ONE misconfiguration
 * actually costing this machine performance, with an honest ranged estimate and
 * whether it's one-click / BIOS / manual. Read-only: it detects and reports only
 * — no fixes are applied here (those arrive later, each behind the confirm modal).
 */
export default function HealthScan() {
  const activeGame = useGameStore((s) => s.activeGame);
  const [report, setReport] = useState<SystemHealthReport | null>(null);
  const [scanning, setScanning] = useState(false);

  const scan = async () => {
    setScanning(true);
    setReport(await scanSystemHealth(activeGame?.name ?? null, activeGame?.installPath ?? null));
    setScanning(false);
  };

  const findings = report
    ? [...report.findings].sort((a, b) => (SEV_ORDER[a.severity] ?? 3) - (SEV_ORDER[b.severity] ?? 3))
    : [];

  return (
    <div className="rounded-2xl border border-edge bg-panel p-5">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-txt2">
            <Stethoscope size={14} /> Bottleneck / Health Scan
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-txt3">
            Finds the misconfiguration actually costing you performance — not another registry tweak.
            Detection only; nothing is changed.
          </p>
        </div>
        <button
          onClick={() => void scan()}
          disabled={scanning}
          className="flex shrink-0 items-center gap-2 rounded-btn bg-accent px-3.5 py-2 text-[12px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi disabled:opacity-60"
        >
          <RefreshCw size={14} className={scanning ? "animate-spin" : ""} />
          {scanning ? "Scanning…" : "Run Health Scan"}
        </button>
      </div>

      {!report ? (
        <p className="py-6 text-center text-[12px] text-txt3">
          Scan your PC for the settings that quietly steal 30–60% — RAM below its rated speed, a game on the
          integrated GPU, Memory Integrity on, and more.
        </p>
      ) : (
        <>
          <div
            className={`mb-3 flex items-center gap-2 rounded-chip border px-3 py-2.5 text-[12.5px] ${
              report.problems === 0 ? "border-success/25 bg-success/5 text-success" : "border-warning/25 bg-warning/5 text-warning"
            }`}
          >
            {report.problems === 0 ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {report.problems === 0
              ? "No real misconfigurations detected — your PC is well set up."
              : `${report.problems} likely performance issue${report.problems === 1 ? "" : "s"} found.`}
          </div>

          <div className="flex flex-col gap-1.5">
            {findings.map((f) => {
              const s = SEV[f.severity] ?? SEV.info;
              const Icon = s.icon;
              return (
                <div key={f.id} className={`flex items-start gap-3 rounded-chip border px-3.5 py-3 ${s.ring}`}>
                  <Icon size={16} strokeWidth={2} className={`mt-0.5 shrink-0 ${s.tone}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-[12.5px] font-semibold text-txt">{f.title}</p>
                      <span className={`rounded bg-panel2 px-1.5 py-0.5 text-[9px] font-bold uppercase ${s.tone}`}>
                        ~{f.fpsCost}
                      </span>
                      <span className="rounded bg-panel2 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-txt3">
                        {FIX_LABEL[f.fixable] ?? f.fixable}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-snug text-txt2">{f.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-3 text-[10.5px] leading-snug text-txt3">
            Detection only — one-click fixes for these arrive one at a time, each behind the confirmation modal.
            Estimates are honest ranges; the only measured number lives in the before/after report.
          </p>
        </>
      )}
    </div>
  );
}
