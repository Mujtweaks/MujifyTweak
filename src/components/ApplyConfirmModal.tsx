import { useState } from "react";
import { AlertTriangle, ShieldCheck, X, Zap } from "lucide-react";
import RiskLabel from "./RiskLabel";
import { applyTweaks } from "../lib/backend";
import { useGameStore } from "../store/gameStore";
import type { ApplyOutcome, TweakInfo } from "../lib/types";

interface ApplyConfirmModalProps {
  tweaks: TweakInfo[];
  title?: string;
  /** Optional prominent caveat (e.g. a security tradeoff) shown before applying. */
  notice?: string;
  onClose: () => void;
  onApplied: (outcome: ApplyOutcome) => void;
}

/**
 * The per-action confirmation gate. Nothing is ever applied without the user
 * clicking through this. Lists the EXACT tweaks + risk, then calls apply_tweaks
 * with confirm:true. No premium tier, no lock, no upsell — every tweak is free.
 */
export default function ApplyConfirmModal({ tweaks, title = "Apply optimizations", notice, onClose, onApplied }: ApplyConfirmModalProps) {
  const antiCheatActive = useGameStore((s) => s.antiCheatActive);
  const [phase, setPhase] = useState<"confirm" | "applying" | "done">("confirm");
  const [appliedCount, setAppliedCount] = useState(0);

  const actionable = tweaks.filter((t) => t.appliable && t.available && !t.applied);
  const blocked = antiCheatActive ? actionable.filter((t) => t.risk !== "safe") : [];
  const applying = phase === "applying";

  const confirm = async () => {
    setPhase("applying");
    const started = Date.now();
    const outcome = await applyTweaks(actionable.map((t) => t.id), antiCheatActive);
    // Let the "applying" animation breathe for at least a beat so it never flickers.
    const wait = Math.max(0, 650 - (Date.now() - started));
    await new Promise((r) => setTimeout(r, wait));
    setAppliedCount(outcome?.applied.length ?? actionable.length);
    setPhase("done");
    // Hold the success animation, then hand back + close.
    setTimeout(() => {
      if (outcome) onApplied(outcome);
      onClose();
    }, 1500);
  };

  // ---- Applying + success animation (the satisfying feedback we were missing) ----
  if (phase !== "confirm") {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-6 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-card border border-edge bg-panel px-6 py-12 text-center shadow-2xl">
          {phase === "applying" ? (
            <div className="flex flex-col items-center gap-5">
              <div className="relative grid h-20 w-20 place-items-center rounded-full bg-accent/10">
                <span className="apply-ring absolute inset-0 rounded-full border-2 border-accent" />
                <Zap size={30} strokeWidth={2.25} fill="currentColor" className="apply-zap text-accent" />
              </div>
              <p className="text-[14.5px] font-semibold text-txt">
                Applying {actionable.length} optimization{actionable.length === 1 ? "" : "s"}…
              </p>
              <div className="h-1 w-52 overflow-hidden rounded-full bg-edge">
                <span className="apply-bar block h-full w-1/3 rounded-full bg-accent" />
              </div>
              <p className="text-[11px] text-txt3">Capturing your current settings first, so every change stays reversible.</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="success-pop grid h-20 w-20 place-items-center rounded-full bg-success/15 text-success">
                <svg viewBox="0 0 52 52" className="h-11 w-11">
                  <circle className="check-circle" cx="26" cy="26" r="23" fill="none" stroke="currentColor" strokeWidth="3" />
                  <path className="check-mark" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" d="M15 27 l7.5 7.5 l15 -17" />
                </svg>
              </div>
              <p className="text-[16px] font-black text-txt">{appliedCount} applied</p>
              <p className="text-[11.5px] text-txt2">All logged — undo anytime from the Change Log.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-card border border-edge bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-edge px-5 py-4">
          <h2 className="text-[15px] font-bold text-txt">{title}</h2>
          <button onClick={onClose} className="text-txt3 hover:text-txt">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="max-h-[46vh] overflow-y-auto px-5 py-4">
          <p className="mb-3 text-[12.5px] text-txt2">
            These exact changes will be applied — each is logged in plain English and can be undone
            individually or all at once. Nothing else is touched.
          </p>

          {actionable.length === 0 ? (
            <p className="rounded-chip border border-edge bg-card px-3 py-6 text-center text-[12.5px] text-txt2">
              Nothing to apply — the selected tweaks are already active or don't have an apply path
              yet (they stay scan-only, never a fake button).
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {actionable.map((t) => {
                const willBlock = blocked.some((b) => b.id === t.id);
                return (
                  <li key={t.id} className="flex items-center gap-2.5 rounded-chip border border-edge bg-card px-3 py-2.5">
                    <Zap size={14} strokeWidth={2} className="shrink-0 text-accent" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-medium text-txt">{t.title}</p>
                      <p className="truncate text-[10.5px] text-txt2">{t.description}</p>
                    </div>
                    {willBlock ? (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-warning">
                        <AlertTriangle size={11} /> Held
                      </span>
                    ) : (
                      <RiskLabel level={t.risk} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {notice && (
            <p className="mt-3 flex items-start gap-2 rounded-chip border border-accent/30 bg-accent/10 px-3 py-2 text-[11px] text-txt">
              <AlertTriangle size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-accent" />
              {notice}
            </p>
          )}

          {antiCheatActive && (
            <p className="mt-3 flex items-start gap-2 rounded-chip border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] text-warning">
              <ShieldCheck size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
              A protected anti-cheat game is running — only Safe tweaks will apply; higher-risk ones
              are held automatically.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-edge px-5 py-4">
          <button onClick={onClose} className="rounded-btn border border-edge bg-card px-4 py-2 text-[12.5px] font-medium text-txt2 hover:text-txt">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={applying || actionable.length === 0}
            className="flex items-center gap-2 rounded-btn bg-accent px-4 py-2 text-[12.5px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi disabled:opacity-60"
          >
            <Zap size={14} strokeWidth={2.25} fill="currentColor" />
            {applying ? "Applying…" : `Apply ${actionable.length} change${actionable.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
