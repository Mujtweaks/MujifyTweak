import { useEffect, useMemo, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { scanTweaks } from "../lib/backend";
import { useSystemStore } from "../store/systemStore";
import { useTweakStore } from "../store/tweakStore";
import { CATEGORY_META, CATEGORY_ORDER } from "../lib/categories";
import RiskLabel from "../components/RiskLabel";
import Toggle from "../components/Toggle";
import ApplyConfirmModal from "../components/ApplyConfirmModal";
import type { TweakCategory, TweakInfo } from "../lib/types";
import type { PageId } from "../lib/nav";

export default function Optimizer({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const scanResult = useTweakStore((s) => s.scanResult);
  const setScan = useTweakStore((s) => s.setScan);
  const hardware = useSystemStore((s) => s.hardware);

  const [cat, setCat] = useState<TweakCategory>("system");
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

  const tweaks = scanResult?.tweaks ?? [];
  const countFor = useMemo(() => {
    const m = new Map<string, number>();
    CATEGORY_ORDER.forEach((c) => m.set(c, tweaks.filter((t) => t.category === c).length));
    return m;
  }, [tweaks]);
  const appliedFor = (c: TweakCategory) => tweaks.filter((t) => t.category === c && t.applied).length;

  const rows = tweaks.filter((t) => t.category === cat);
  const meta = CATEGORY_META[cat];

  const onToggle = (t: TweakInfo) => {
    if (t.applied) {
      onNavigate("changelog"); // manage/undo an active tweak in the log
      return;
    }
    if (!t.appliable || !t.available) return;
    setConfirm([t]);
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-txt">Optimizer</h1>
          <p className="mt-1 text-[12.5px] text-txt2">
            {tweaks.length} tweaks across {CATEGORY_ORDER.length} categories — all free. Pick a
            category, flip what you want; every change is confirmed, logged and reversible.
          </p>
        </div>
        <button onClick={runScan} disabled={scanning} className="flex items-center gap-2 rounded-btn border border-edge bg-card px-3.5 py-2 text-[12px] font-medium text-txt hover:border-edge2 disabled:opacity-60">
          <RefreshCw size={13} strokeWidth={2} className={scanning ? "animate-spin text-txt2" : "text-txt2"} />
          {scanning ? "Scanning…" : "Re-scan"}
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[210px_1fr] gap-4">
        {/* Category rail */}
        <div className="flex flex-col gap-2 overflow-y-auto">
          {CATEGORY_ORDER.map((c) => {
            const m = CATEGORY_META[c];
            const Icon = m.icon;
            const active = c === cat;
            const applied = appliedFor(c);
            return (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`flex items-center gap-3 rounded-chip border p-3 text-left transition-colors ${
                  active ? "border-accent/40 bg-accent/10" : "border-edge bg-card hover:border-edge2"
                }`}
              >
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-btn ${active ? "bg-accent/15" : "bg-bg"}`}>
                  <Icon size={15} strokeWidth={1.75} className={active ? "text-accent" : "text-txt2"} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-[12.5px] font-medium ${active ? "text-txt" : "text-txt2"}`}>{m.label}</p>
                  <p className="text-[10px] text-txt3">{applied > 0 ? `${applied} active · ` : ""}{countFor.get(c) ?? 0} tweaks</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Tweak list */}
        <div className="flex min-h-0 flex-col overflow-y-auto rounded-card border border-edge bg-card p-5">
          <div className="mb-3">
            <div className="flex items-center gap-2.5">
              <meta.icon size={18} strokeWidth={1.75} className="text-accent" />
              <h2 className="text-[15px] font-bold text-txt">{meta.label}</h2>
            </div>
            <p className="mt-0.5 text-[12px] text-txt2">{meta.subtitle}</p>
          </div>

          <div className="flex flex-col gap-2.5">
            {rows.length === 0 && <p className="py-8 text-center text-[12px] text-txt3">{scanning ? "Scanning…" : "No tweaks in this category."}</p>}
            {rows.map((t) => {
              const Icon = CATEGORY_META[t.category].icon;
              const scanOnly = !t.appliable || !t.available;
              return (
                <div key={t.id} className="flex items-center gap-4 rounded-chip border border-edge bg-bg p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-btn bg-card">
                    <Icon size={17} strokeWidth={1.75} className="text-txt2" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-medium text-txt">{t.title}</p>
                      <RiskLabel level={t.risk} />
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

          <div className="mt-4 flex items-center gap-2 rounded-chip border border-edge bg-bg px-3.5 py-2.5">
            <ShieldCheck size={14} className="shrink-0 text-success" />
            <p className="text-[11px] text-txt2">Every toggle opens a confirmation showing the exact change first. Nothing is applied silently, and all of it is free.</p>
          </div>
        </div>
      </div>

      {confirm && (
        <ApplyConfirmModal
          tweaks={confirm}
          title={`Apply — ${confirm[0].title}`}
          onClose={() => setConfirm(null)}
          onApplied={() => runScan()}
        />
      )}
    </div>
  );
}
