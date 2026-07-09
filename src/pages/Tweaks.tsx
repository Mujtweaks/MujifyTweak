import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RotateCcw, Search, Sparkles, Zap } from "lucide-react";
import { scanTweaks } from "../lib/backend";
import { useSystemStore } from "../store/systemStore";
import { useTweakStore } from "../store/tweakStore";
import { CATEGORY_META, CATEGORY_ORDER } from "../lib/categories";
import TweakCard from "../components/TweakCard";
import ApplyConfirmModal from "../components/ApplyConfirmModal";
import SlidingPills from "../components/SlidingPills";
import type { TweakCategory, TweakInfo } from "../lib/types";

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="flex flex-1 items-center gap-3.5 rounded-2xl border border-edge bg-card p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-bg text-accent">{icon}</span>
      <div className="min-w-0">
        <p className="text-[9.5px] font-semibold uppercase tracking-wide text-txt3">{label}</p>
        <p className="text-[19px] font-bold text-txt">{value}</p>
        <p className="truncate text-[10.5px] text-txt2">{sub}</p>
      </div>
    </div>
  );
}

export default function Tweaks() {
  const scanResult = useTweakStore((s) => s.scanResult);
  const setScan = useTweakStore((s) => s.setScan);
  const hardware = useSystemStore((s) => s.hardware);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState<"all" | TweakCategory>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
  const filtered = useMemo(() => {
    let list = tweaks.filter((t) => filter === "all" || t.category === filter);
    if (search) list = list.filter((t) => (t.title + t.description).toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [tweaks, filter, search]);

  const boostWord = (() => {
    const total = tweaks.reduce((s, t) => s + t.impact, 0);
    const sel = tweaks.filter((t) => selected.has(t.id)).reduce((s, t) => s + t.impact, 0);
    const b = total ? (sel / total) * 130 : 0;
    return b >= 60 ? "High" : b >= 30 ? "Medium" : b > 0 ? "Low" : "—";
  })();

  const toggleSelect = (t: TweakInfo) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(t.id) ? n.delete(t.id) : n.add(t.id);
      return n;
    });

  const selectedTweaks = tweaks.filter((t) => selected.has(t.id));
  const groups = CATEGORY_ORDER.filter((c) => (filter === "all" || filter === c) && filtered.some((t) => t.category === c));

  return (
    <div className="flex flex-col gap-5 pb-20">
      <div>
        <h1 className="text-[42px] font-black uppercase leading-none tracking-tight text-txt">Tweaks</h1>
        <p className="mt-1.5 text-[14px] text-txt2">All {tweaks.length} optimizations — every one free, logged, reversible.</p>
      </div>

      <div className="flex gap-4">
        <Stat icon={<Zap size={18} strokeWidth={2} />} label="Total Tweaks" value={`${tweaks.length}`} sub="100% Free" />
        <Stat icon={<CheckCircle2 size={18} strokeWidth={2} />} label="Selected" value={`${selected.size}`} sub="Ready to apply" />
        <Stat icon={<Sparkles size={18} strokeWidth={2} />} label="Selected Impact" value={boostWord} sub="Impact tier of your selection" />
        <Stat icon={<RotateCcw size={18} strokeWidth={2} />} label="Applied" value={`${tweaks.filter((t) => t.applied).length}`} sub="Active on this PC" />
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 rounded-full border border-edge bg-card px-5 py-2.5">
        <Search size={15} strokeWidth={2} className="text-txt3" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tweaks..." className="flex-1 bg-transparent text-[13px] text-txt placeholder:text-txt3 focus:outline-none" />
      </div>

      {/* Filter pills — the active red pill slides between categories */}
      <SlidingPills
        pills={(["all", ...CATEGORY_ORDER] as const).map((c) => ({
          id: c,
          label: c === "all" ? "All" : CATEGORY_META[c].label,
        }))}
        active={filter}
        onChange={(id) => setFilter(id as "all" | TweakCategory)}
      />

      {/* Grouped tweak cards */}
      {filtered.length === 0 && <p className="py-10 text-center text-[13px] text-txt3">{scanning ? "Scanning your system…" : "No tweaks match."}</p>}
      {groups.map((c) => {
        const meta = CATEGORY_META[c];
        const Icon = meta.icon;
        const rows = filtered.filter((t) => t.category === c);
        return (
          <div key={c}>
            <div className="mb-3 flex items-center gap-2.5">
              <span className="grid place-items-center rounded-lg p-2" style={{ backgroundColor: `${meta.color}20` }}>
                <Icon size={16} style={{ color: meta.color }} />
              </span>
              <span className="text-[16px] font-bold text-txt">{meta.label}</span>
              <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[11px] font-bold text-blue-400">{rows.length}</span>
              <span className="text-[12px] text-txt2">· {meta.subtitle}</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {rows.map((t) => <TweakCard key={t.id} tweak={t} selected={selected.has(t.id)} onToggle={toggleSelect} />)}
            </div>
          </div>
        );
      })}

      {/* Apply bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-[64px] left-[64px] right-0 z-20 flex items-center justify-between border-t border-edge bg-panel/95 px-6 py-3 backdrop-blur">
          <span className="text-[12.5px] text-txt2">{selected.size} selected · all free, all reversible</span>
          <button onClick={() => setConfirm(selectedTweaks)} className="glint flex items-center gap-2 rounded-btn bg-accent px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi">
            <Zap size={14} strokeWidth={2.5} fill="currentColor" /> Apply {selected.size} Tweak{selected.size === 1 ? "" : "s"}
          </button>
        </div>
      )}

      {confirm && (
        <ApplyConfirmModal tweaks={confirm} title="Apply tweaks" onClose={() => setConfirm(null)} onApplied={() => { setSelected(new Set()); runScan(); }} />
      )}
    </div>
  );
}
