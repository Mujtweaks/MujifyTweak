import { useState } from "react";
import { AlertTriangle, ShieldCheck, X, Zap } from "lucide-react";
import RiskLabel from "./RiskLabel";
import { applyTweaks } from "../lib/backend";
import { useGameStore } from "../store/gameStore";
import type { ApplyOutcome, TweakInfo } from "../lib/types";

interface ApplyConfirmModalProps {
  tweaks: TweakInfo[];
  title?: string;
  onClose: () => void;
  onApplied: (outcome: ApplyOutcome) => void;
}

/**
 * The per-action confirmation gate. Nothing is ever applied without the user
 * clicking through this. Lists the EXACT tweaks + risk, then calls apply_tweaks
 * with confirm:true. No premium tier, no lock, no upsell — every tweak is free.
 */
export default function ApplyConfirmModal({ tweaks, title = "Apply optimizations", onClose, onApplied }: ApplyConfirmModalProps) {
  const antiCheatActive = useGameStore((s) => s.antiCheatActive);
  const [applying, setApplying] = useState(false);

  const actionable = tweaks.filter((t) => t.appliable && t.available && !t.applied);
  const blocked = antiCheatActive ? actionable.filter((t) => t.risk !== "safe") : [];

  const confirm = async () => {
    setApplying(true);
    const outcome = await applyTweaks(actionable.map((t) => t.id), antiCheatActive);
    setApplying(false);
    if (outcome) onApplied(outcome);
    onClose();
  };

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
