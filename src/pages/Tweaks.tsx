import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { scanTweaks } from "../lib/backend";
import { useSystemStore } from "../store/systemStore";
import { useTweakStore } from "../store/tweakStore";
import { CATEGORY_META } from "../lib/categories";
import RiskLabel from "../components/RiskLabel";
import Toggle from "../components/Toggle";
import ApplyConfirmModal from "../components/ApplyConfirmModal";
import type { TweakInfo } from "../lib/types";
import type { PageId } from "../lib/nav";

/** Advanced tweaks — moderate/advanced risk only, always confirmed. */
export default function Tweaks({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const scanResult = useTweakStore((s) => s.scanResult);
  const setScan = useTweakStore((s) => s.setScan);
  const hardware = useSystemStore((s) => s.hardware);
  const [scanning, setScanning] = useState(false);
  const [confirm, setConfirm] = useState<TweakInfo[] | null>(null);

  const runScan = async () => {
    setScanning(true);
    const r = await scanTweaks(hardware?.isLaptop ?? null);
    if (r) setScan(r);
    setScanning(false);
  };

  useEffect(() => {
    if (!scanResult) void runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = (scanResult?.tweaks ?? []).filter((t) => t.risk !== "safe");

  const onToggle = (t: TweakInfo) => {
    if (t.applied) return onNavigate("changelog");
    if (!t.appliable || !t.available) return;
    setConfirm([t]);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-txt">Advanced Tweaks</h1>
          <p className="mt-1 text-[12.5px] text-txt2">Higher-impact tweaks — opt-in, risk-labeled, and reversible. Free like everything else.</p>
        </div>
        <button onClick={runScan} disabled={scanning} className="flex items-center gap-2 rounded-btn border border-edge bg-card px-3.5 py-2 text-[12px] font-medium text-txt hover:border-edge2 disabled:opacity-60">
          <RefreshCw size={13} strokeWidth={2} className={scanning ? "animate-spin text-txt2" : "text-txt2"} />
          {scanning ? "Scanning…" : "Re-scan"}
        </button>
      </div>

      <div className="flex items-start gap-3 rounded-card border border-warning/30 bg-warning/10 p-4">
        <AlertTriangle size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-warning" />
        <p className="text-[12.5px] leading-snug text-warning">
          Advanced tweaks are opt-in only. Read each description before enabling. Every one shows a
          confirmation with the exact change first, is written to the Change Log, and can be undone.
          Kernel-level tweaks (v2.0) will create a Windows Restore Point before applying.
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        {rows.length === 0 && <p className="py-8 text-center text-[12px] text-txt3">{scanning ? "Scanning…" : "No advanced tweaks available."}</p>}
        {rows.map((t) => {
          const Icon = CATEGORY_META[t.category].icon;
          const scanOnly = !t.appliable || !t.available;
          return (
            <div key={t.id} className="flex items-center gap-4 rounded-card border border-edge bg-card p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-btn bg-bg">
                <Icon size={17} strokeWidth={1.75} className="text-txt2" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[14px] font-medium text-txt">{t.title}</p>
                  <RiskLabel level={t.risk} />
                  <span className="text-[10px] text-txt3">· {CATEGORY_META[t.category].label}</span>
                </div>
                <p className="mt-0.5 text-[12px] text-txt2">{t.description}</p>
                {t.applied ? (
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-success">Active — manage in Change Log</p>
                ) : scanOnly ? (
                  <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-txt3">{!t.available ? "Not available on this system" : "Scan-only (apply path coming)"}</p>
                ) : null}
              </div>
              <Toggle on={t.applied} onClick={() => onToggle(t)} disabled={scanOnly && !t.applied} />
            </div>
          );
        })}
      </div>

      {confirm && (
        <ApplyConfirmModal tweaks={confirm} title={`Apply — ${confirm[0].title}`} onClose={() => setConfirm(null)} onApplied={() => runScan()} />
      )}
    </div>
  );
}
