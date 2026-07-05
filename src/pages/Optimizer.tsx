import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, Zap } from "lucide-react";
import { scanTweaks } from "../lib/backend";
import { useSystemStore } from "../store/systemStore";
import { useTweakStore } from "../store/tweakStore";
import { CATEGORY_META, CATEGORY_ORDER } from "../lib/categories";
import TweakCard from "../components/TweakCard";
import ApplyConfirmModal from "../components/ApplyConfirmModal";
import type { TweakCategory, TweakInfo } from "../lib/types";
import type { PageId } from "../lib/nav";

export default function Optimizer({ onNavigate: _onNavigate }: { onNavigate: (page: PageId) => void }) {
  const scanResult = useTweakStore((s) => s.scanResult);
  const setScan = useTweakStore((s) => s.setScan);
  const hardware = useSystemStore((s) => s.hardware);
  const [openCat, setOpenCat] = useState<TweakCategory | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<TweakInfo[] | null>(null);

  const runScan = async () => {
    const r = await scanTweaks(hardware?.isLaptop ?? null);
    if (r) setScan(r);
  };
  useEffect(() => {
    if (!scanResult) void runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tweaks = scanResult?.tweaks ?? [];
  const inCat = (c: TweakCategory) => tweaks.filter((t) => t.category === c);

  const toggleSelect = (t: TweakInfo) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(t.id) ? n.delete(t.id) : n.add(t.id);
      return n;
    });

  // ---- Sub-page: one category's tweaks ----
  if (openCat) {
    const meta = CATEGORY_META[openCat];
    const rows = inCat(openCat);
    const sel = tweaks.filter((t) => selected.has(t.id) && t.category === openCat);
    return (
      <div className="flex flex-col gap-5 pb-20">
        <button onClick={() => setOpenCat(null)} className="flex w-fit items-center gap-2 text-[13px] font-medium text-txt2 hover:text-txt">
          <ArrowLeft size={16} /> All categories
        </button>
        <div className="flex items-center gap-3">
          <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ backgroundColor: `${meta.color}20` }}>
            <meta.icon size={26} style={{ color: meta.color }} />
          </span>
          <div>
            <h1 className="text-[32px] font-black uppercase leading-none tracking-tight text-txt">{meta.label}</h1>
            <p className="mt-1 text-[13px] text-txt2">{meta.subtitle}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {rows.map((t) => <TweakCard key={t.id} tweak={t} selected={selected.has(t.id)} onToggle={toggleSelect} />)}
        </div>
        {sel.length > 0 && (
          <div className="fixed bottom-[64px] left-[64px] right-0 z-20 flex items-center justify-between border-t border-edge bg-panel/95 px-6 py-3 backdrop-blur">
            <span className="text-[12.5px] text-txt2">{sel.length} selected in {meta.label}</span>
            <button onClick={() => setConfirm(sel)} className="glint flex items-center gap-2 rounded-btn bg-accent px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi">
              <Zap size={14} strokeWidth={2.5} fill="currentColor" /> Apply {sel.length}
            </button>
          </div>
        )}
        {confirm && <ApplyConfirmModal tweaks={confirm} title={`Apply — ${meta.label}`} onClose={() => setConfirm(null)} onApplied={() => { setSelected(new Set()); runScan(); }} />}
      </div>
    );
  }

  // ---- Category picker grid ----
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[42px] font-black uppercase leading-none tracking-tight text-txt">Optimizer</h1>
        <p className="mt-1.5 text-[14px] text-txt2">Choose a category to optimize — every tweak free, confirmed, and reversible.</p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {CATEGORY_ORDER.map((c) => {
          const meta = CATEGORY_META[c];
          const rows = inCat(c);
          const hasAdvanced = rows.some((t) => t.risk === "advanced");
          const applied = rows.filter((t) => t.applied).length;
          return (
            <button key={c} onClick={() => setOpenCat(c)} className="relative flex flex-col items-start rounded-2xl border border-edge bg-card p-6 text-left transition-all hover:border-accent/30 hover:shadow-[0_0_20px_rgba(227,0,14,0.08)]">
              {hasAdvanced && <span className="absolute right-4 top-4 rounded-full bg-purple-500/15 px-2 py-0.5 text-[9px] font-bold uppercase text-purple-400">Advanced</span>}
              <span className="grid h-16 w-16 place-items-center rounded-2xl" style={{ backgroundColor: `${meta.color}20` }}>
                <meta.icon size={28} style={{ color: meta.color }} />
              </span>
              <p className="mt-4 text-[18px] font-bold text-txt">{meta.label}</p>
              <p className="mt-1 text-[13px] text-txt2">{meta.subtitle}</p>
              <div className="mt-4 flex w-full items-center justify-between">
                <span className="text-[11px] text-txt3">{rows.length} tweaks{applied > 0 ? ` · ${applied} active` : ""}</span>
                <ChevronRight size={16} className="text-txt3" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
