import { useEffect, useState } from "react";
import { RotateCcw, Zap } from "lucide-react";
import { scanTweaks } from "../lib/backend";
import { useSystemStore } from "../store/systemStore";
import { useTweakStore } from "../store/tweakStore";
import ApplyConfirmModal from "./ApplyConfirmModal";
import type { TweakInfo } from "../lib/types";

/**
 * The prominent one-click Booster on Home. Scans, then opens the confirm modal
 * with the recommended safe + balanced tweaks for this machine. Nothing applies
 * without the modal, and everything it applies is reversible — no silent changes.
 */
export default function BoosterCard() {
  const hardware = useSystemStore((s) => s.hardware);
  const scanResult = useTweakStore((s) => s.scanResult);
  const setScan = useTweakStore((s) => s.setScan);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<TweakInfo[] | null>(null);

  useEffect(() => {
    if (!scanResult) void scanTweaks(hardware?.isLaptop ?? null).then((r) => r && setScan(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tweaks = scanResult?.tweaks ?? [];
  const recommended = tweaks.filter((t) => t.available && !t.applied && t.appliable && t.risk !== "advanced");
  const appliedCount = tweaks.filter((t) => t.applied).length;

  const boost = async () => {
    setBusy(true);
    const r = scanResult ?? (await scanTweaks(hardware?.isLaptop ?? null));
    setBusy(false);
    if (!r) return;
    if (!scanResult) setScan(r);
    setConfirm(r.tweaks.filter((t) => t.available && !t.applied && t.appliable && t.risk !== "advanced"));
  };

  return (
    <>
      <div className="relative overflow-hidden rounded-card border border-accent/30 bg-gradient-to-br from-accent/15 via-card to-card p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/20">
                <Zap size={20} className="text-accent" fill="currentColor" />
              </span>
              <div className="min-w-0">
                <p className="text-[17px] font-black text-txt">Boost your PC</p>
                <p className="truncate text-[11.5px] text-txt2">One click applies the safe + balanced optimizations for your hardware.</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-txt3">
              <span><span className="font-bold text-accent">{recommended.length}</span> recommended</span>
              <span>·</span>
              <span><span className="font-semibold text-success">{appliedCount}</span> already active</span>
              <span className="flex items-center gap-1"><RotateCcw size={11} /> fully reversible</span>
            </div>
          </div>
          <button
            onClick={boost}
            disabled={busy || recommended.length === 0}
            className="glint flex shrink-0 items-center gap-2 rounded-btn bg-accent px-6 py-3 text-[14px] font-bold text-white shadow-[0_4px_24px_rgba(227,0,14,0.4)] transition-transform active:scale-[0.98] hover:bg-accent-hi disabled:opacity-50"
          >
            <Zap size={16} strokeWidth={2.5} fill="currentColor" />
            {busy ? "Scanning…" : recommended.length === 0 ? "All optimized" : "Boost Now"}
          </button>
        </div>
      </div>
      {confirm && (
        <ApplyConfirmModal
          tweaks={confirm}
          title="Boost your PC"
          onClose={() => setConfirm(null)}
          onApplied={() => void scanTweaks(hardware?.isLaptop ?? null).then((r) => r && setScan(r))}
        />
      )}
    </>
  );
}
