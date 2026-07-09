import { useState } from "react";
import { ArrowRight, RotateCcw, ShieldCheck, Sparkles, X } from "lucide-react";
import { useSettingsStore } from "../store/settingsStore";
import { DISCORD_INVITE, openExternal } from "../lib/links";

// Official Discord mark, inline (brand color #5865F2) — no external asset.
function DiscordMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#5865F2"
        d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.445.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.6 12.6 0 0 0-.617-1.25.077.077 0 0 0-.079-.036A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.291.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.291a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03zM8.02 15.331c-1.182 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.332-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.332-.946 2.418-2.157 2.418z"
      />
    </svg>
  );
}

/**
 * First-run wizard — three quick, skippable steps shown once (App persists the
 * flag): ① welcome + safety promise → ② "what should we call you?" (local only)
 * → ③ join the Discord. Honest and short; the Discord step has a tasteful
 * floating/glow animation that respects prefers-reduced-motion.
 */
export default function WelcomeModal({ onClose }: { onClose: () => void }) {
  const setUserName = useSettingsStore((s) => s.setUserName);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");

  const next = () => setStep((s) => s + 1);
  const saveName = () => {
    const n = name.trim();
    if (n) setUserName(n);
    next();
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/75 p-6 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-card border border-edge bg-panel shadow-2xl">
        <button onClick={onClose} className="absolute right-4 top-4 z-10 text-txt3 hover:text-txt" aria-label="Close">
          <X size={18} strokeWidth={2} />
        </button>

        {/* Step 1 — welcome + safety */}
        {step === 0 && (
          <>
            <div className="px-6 pt-7 text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent/10 shadow-[0_0_28px_rgba(227,0,14,0.2)]">
                <Sparkles size={26} strokeWidth={1.75} className="text-accent" />
              </span>
              <h2 className="mt-4 text-[20px] font-black uppercase tracking-tight text-txt">Welcome to Mujify Tweaks</h2>
              <p className="mt-2 text-[12.5px] leading-relaxed text-txt2">
                Mujify finds what's actually slowing your PC down, tells you the exact fix, and proves the gain with a
                real before/after benchmark — not guesses.
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
                  <span className="font-semibold text-txt">System Restore point</span> — a belt-and-braces safety net.
                </p>
              </div>
              <p className="px-1 text-center text-[11px] leading-relaxed text-txt3">
                No personal data. No tracking. No account. Mujify sends a single anonymous "online" ping (app version
                only) so we can see how many gamers it's helping — turn it off anytime in Settings.
              </p>
            </div>
          </>
        )}

        {/* Step 2 — name */}
        {step === 1 && (
          <div className="px-6 pt-8">
            <h2 className="text-center text-[20px] font-black uppercase tracking-tight text-txt">
              What should we call you?
            </h2>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
              maxLength={24}
              placeholder="Your name or gamertag"
              className="mt-5 w-full rounded-btn border border-edge bg-bg px-4 py-3 text-center text-[15px] text-txt placeholder:text-txt3 focus:border-accent focus:outline-none"
            />
            <p className="mt-2 text-center text-[11px] text-txt3">
              This stays on your PC — it never leaves your machine.
            </p>
          </div>
        )}

        {/* Step 3 — Discord */}
        {step === 2 && (
          <div className="px-6 pt-8 text-center">
            <div className="relative mx-auto grid h-20 w-20 place-items-center">
              <span className="glow-pulse absolute inset-0 rounded-full bg-[#5865F2]/25 blur-xl" />
              <DiscordMark className="float-y relative h-12 w-12" />
            </div>
            <h2 className="mt-4 text-[20px] font-black uppercase tracking-tight text-txt">Join the crew</h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-txt2">
              Free human help, updates, and a say in what gets built next.
            </p>
            <button
              onClick={() => void openExternal(DISCORD_INVITE)}
              className="glint mt-5 flex w-full items-center justify-center gap-2 rounded-btn bg-[#5865F2] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_20px_rgba(88,101,242,0.35)] hover:brightness-110"
            >
              <DiscordMark className="h-4 w-4 [&_path]:fill-white" /> Join the Discord
            </button>
          </div>
        )}

        {/* Footer — progress dots + advance */}
        <div className="flex items-center justify-between px-6 pb-6 pt-5">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-4 bg-accent" : "w-1.5 bg-edge2"}`} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step === 1 && (
              <button onClick={next} className="rounded-btn px-3 py-2 text-[12.5px] font-medium text-txt3 hover:text-txt">
                Skip
              </button>
            )}
            {step < 2 ? (
              <button
                onClick={step === 1 ? saveName : next}
                className="glint flex items-center gap-2 rounded-btn bg-accent px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi"
              >
                {step === 0 ? "Next" : "Continue"} <ArrowRight size={14} />
              </button>
            ) : (
              <button
                onClick={onClose}
                className="rounded-btn bg-accent px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi"
              >
                Let's go
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
