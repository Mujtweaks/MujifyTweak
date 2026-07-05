import { useState } from "react";
import { Zap } from "lucide-react";
import { scanTweaks } from "../lib/backend";
import { useSystemStore } from "../store/systemStore";
import { useTweakStore } from "../store/tweakStore";
import ApplyConfirmModal from "./ApplyConfirmModal";
import type { TweakInfo } from "../lib/types";

/**
 * Self-contained Boost control (used in the TopBar). Scans, then opens the
 * confirmation modal with the recommended safe/moderate tweaks. Never applies
 * without the modal — nothing runs silently.
 */
export default function BoostButton({ compact }: { compact?: boolean }) {
  const hardware = useSystemStore((s) => s.hardware);
  const setScan = useTweakStore((s) => s.setScan);
  const scanResult = useTweakStore((s) => s.scanResult);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<TweakInfo[] | null>(null);

  const boost = async () => {
    setBusy(true);
    const r = scanResult ?? (await scanTweaks(hardware?.isLaptop ?? null));
    setBusy(false);
    if (!r) return;
    if (!scanResult) setScan(r);
    const recs = r.tweaks.filter((t) => t.available && !t.applied && t.risk !== "advanced");
    setConfirm(recs);
  };

  return (
    <>
      <button
        onClick={boost}
        disabled={busy}
        className={`glint flex items-center gap-1.5 rounded-btn bg-accent font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] transition-transform active:scale-[0.98] hover:bg-accent-hi disabled:opacity-70 ${
          compact ? "px-3 py-1.5 text-[12px]" : "px-4 py-2 text-[13px]"
        }`}
      >
        <Zap size={compact ? 13 : 15} strokeWidth={2.5} fill="currentColor" />
        {busy ? "Scanning…" : "Quick Optimize"}
      </button>
      {confirm && (
        <ApplyConfirmModal
          tweaks={confirm}
          title="Quick Optimize"
          onClose={() => setConfirm(null)}
          onApplied={() => void scanTweaks(hardware?.isLaptop ?? null).then((r) => r && setScan(r))}
        />
      )}
    </>
  );
}
