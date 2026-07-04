import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, Search, Zap } from "lucide-react";
import { scanTweaks } from "../lib/backend";
import { useSystemStore } from "../store/systemStore";
import { useTweakStore } from "../store/tweakStore";
import { CATEGORY_META, CATEGORY_ORDER } from "../lib/categories";
import RiskLabel from "../components/RiskLabel";
import ApplyConfirmModal from "../components/ApplyConfirmModal";
import type { ApplyOutcome, TweakInfo } from "../lib/types";

/**
 * Real tweak catalog. Live-scanned state (applied/available), per-tweak select,
 * and a confirm-gated apply. Tweaks without a real apply path are shown clearly
 * as "scan-only" — never a fake button. No tiers, no locks: everything here is
 * free and applies the same way.
 */
export default function Tweaks() {
  const scanResult = useTweakStore((s) => s.scanResult);
  const setScan = useTweakStore((s) => s.setScan);
  const hardware = useSystemStore((s) => s.hardware);

  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult] = useState<ApplyOutcome | null>(null);

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
  const filtered = useMemo(
    () =>
      tweaks.filter(
        (t) =>
          t.title.toLowerCase().includes(search.toLowerCase()) ||
          t.description.toLowerCase().includes(search.toLowerCase()),
      ),
    [tweaks, search],
  );

  const byCategory = (cat: string) => filtered.filter((t) => t.category === cat);
  const selectedTweaks = tweaks.filter((t) => selected.has(t.id));

  const toggle = (t: TweakInfo) => {
    if (!t.appliable || t.applied || !t.available) return;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(t.id) ? next.delete(t.id) : next.add(t.id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-wide text-txt">Tweaks</h1>
          <p className="mt-1 max-w-lg text-[12.5px] text-txt2">
            The full catalog — {tweaks.length} tweaks, all free. Live state read from your system.
            Select what you want; every apply is confirmed, logged, and fully reversible.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-lg border border-edge bg-panel px-2.5 py-1.5">
            <Search size={13} strokeWidth={2} className="text-txt3" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tweaks…"
              className="w-32 bg-transparent text-[12px] text-txt placeholder:text-txt3 focus:outline-none"
            />
          </div>
          <button
            onClick={runScan}
            disabled={scanning}
            className="flex items-center gap-2 rounded-xl border border-edge bg-panel px-3 py-2 text-[12px] font-medium text-txt hover:border-edge2 disabled:opacity-60"
          >
            <RefreshCw size={13} strokeWidth={2} className={scanning ? "animate-spin text-txt2" : "text-txt2"} />
            {scanning ? "Scanning…" : "Re-scan"}
          </button>
        </div>
      </div>

      {result && (
        <div className="rounded-xl border border-good/30 bg-good/10 px-3.5 py-2.5 text-[12px] text-txt">
          Applied {result.applied.length} change{result.applied.length === 1 ? "" : "s"}.
          {result.blocked.length > 0 && ` ${result.blocked.length} held or skipped.`} See the Change
          Log to undo anything.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {CATEGORY_ORDER.map((cat) => {
          const meta = CATEGORY_META[cat];
          const Icon = meta.icon;
          const items = byCategory(cat);
          if (items.length === 0) return null;
          return (
            <div key={cat} className="rounded-2xl border border-edge bg-panel p-4">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg border border-edge bg-panel2">
                  <Icon size={15} strokeWidth={1.75} className="text-txt2" />
                </span>
                <div>
                  <p className="text-[12.5px] font-semibold text-txt">{meta.label}</p>
                  <p className="text-[10px] text-txt3">
                    {items.filter((t) => t.applied).length} active · {items.length} total
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                {items.map((t) => {
                  const isSelected = selected.has(t.id);
                  const locked = !t.appliable || t.applied || !t.available;
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggle(t)}
                      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        isSelected
                          ? "border-accent/50 bg-accent/5"
                          : "border-edge bg-panel2 hover:border-edge2"
                      } ${locked ? "cursor-default" : ""}`}
                    >
                      <span
                        className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${
                          t.applied
                            ? "border-good bg-good/20"
                            : isSelected
                              ? "border-accent bg-accent"
                              : "border-edge2"
                        }`}
                      >
                        {t.applied ? (
                          <CheckCircle2 size={11} className="text-good" />
                        ) : isSelected ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-white" />
                        ) : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-[12px] font-medium text-txt">{t.title}</p>
                          <RiskLabel level={t.risk} />
                        </div>
                        <p className="text-[10.5px] leading-snug text-txt2">{t.description}</p>
                        {t.applied ? (
                          <span className="text-[9.5px] font-semibold uppercase tracking-wider text-good">
                            Already active
                          </span>
                        ) : !t.appliable ? (
                          <span className="text-[9.5px] font-medium uppercase tracking-wider text-txt3">
                            Scan-only (apply path coming)
                          </span>
                        ) : !t.available ? (
                          <span className="text-[9.5px] font-medium uppercase tracking-wider text-txt3">
                            Not available on this system
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sticky apply bar */}
      <div className="sticky bottom-0 flex items-center justify-between rounded-2xl border border-edge bg-panel/95 px-4 py-3 backdrop-blur">
        <span className="text-[12.5px] text-txt2">
          {selected.size} selected · all free, all reversible
        </span>
        <button
          onClick={() => setShowConfirm(true)}
          disabled={selected.size === 0}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-b from-accent to-[#a3000a] px-4 py-2 text-[12.5px] font-semibold text-white shadow-[0_0_18px_rgba(227,0,14,0.3)] disabled:opacity-50"
        >
          <Zap size={14} strokeWidth={2.25} fill="currentColor" />
          Apply selected
        </button>
      </div>

      {showConfirm && (
        <ApplyConfirmModal
          tweaks={selectedTweaks}
          onClose={() => setShowConfirm(false)}
          onApplied={(o) => {
            setResult(o);
            setSelected(new Set());
            void runScan();
          }}
        />
      )}
    </div>
  );
}
