import { RotateCcw, ShieldCheck, Sparkles, X } from "lucide-react";

/**
 * One-time first-run welcome. Explains what Mujify does, states the safety
 * promise in a single line, recommends a restore point before the first Boost,
 * and makes the no-telemetry stance explicit. Shown once, then never again
 * (App persists a flag). Honest and short — no marketing fluff.
 */
export default function WelcomeModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/75 p-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-card border border-edge bg-panel shadow-2xl">
        <div className="relative px-6 pt-7 text-center">
          <button onClick={onClose} className="absolute right-4 top-4 text-txt3 hover:text-txt" aria-label="Close">
            <X size={18} strokeWidth={2} />
          </button>
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent/10 shadow-[0_0_28px_rgba(227,0,14,0.2)]">
            <Sparkles size={26} strokeWidth={1.75} className="text-accent" />
          </span>
          <h2 className="mt-4 text-[20px] font-black uppercase tracking-tight text-txt">Welcome to Mujify Tweaks</h2>
          <p className="mt-2 text-[12.5px] leading-relaxed text-txt2">
            Mujify finds what's actually slowing your PC down, tells you the exact fix, and proves the
            gain with a real before/after benchmark — not guesses.
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-2.5 px-6">
          <div className="flex items-start gap-3 rounded-chip border border-accent/25 bg-accent/5 px-3.5 py-3">
            <ShieldCheck size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-accent" />
            <p className="text-[12px] leading-snug text-txt">
              <span className="font-semibold">Every change is logged and one-click reversible</span> — nothing is
              applied without your confirmation.
            </p>
          </div>
          <div className="flex items-start gap-3 rounded-chip border border-edge bg-card px-3.5 py-3">
            <RotateCcw size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-txt2" />
            <p className="text-[12px] leading-snug text-txt2">
              Before your first Boost, we recommend letting Windows create a{" "}
              <span className="font-semibold text-txt">System Restore point</span> (System Properties → System
              Protection) — a belt-and-braces safety net.
            </p>
          </div>
          <p className="px-1 text-center text-[11px] text-txt3">
            No telemetry, ever. No account required. 100% free.
          </p>
        </div>

        <div className="px-6 pb-6 pt-4">
          <button
            onClick={onClose}
            className="glint w-full rounded-btn bg-accent px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi"
          >
            Get started
          </button>
        </div>
      </div>
    </div>
  );
}
