import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { scanTweaks } from "../lib/backend";
import { useSystemStore } from "../store/systemStore";
import { useTweakStore } from "../store/tweakStore";
import { CATEGORY_META, CATEGORY_ORDER } from "../lib/categories";
import Toggle from "../components/Toggle";
import ApplyConfirmModal from "../components/ApplyConfirmModal";
import type { TweakCategory, TweakInfo } from "../lib/types";
import type { PageId } from "../lib/nav";

function ImpactBar({ impact }: { impact: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`h-1.5 w-4 rounded-full ${i <= impact ? "bg-accent" : "bg-edge2"}`} />
      ))}
    </div>
  );
}

function StatCard({ icon, label, value, sub, iconTone = "text-accent" }: { icon: React.ReactNode; label: string; value: string; sub: string; iconTone?: string }) {
  return (
    <div className="flex flex-1 items-center gap-3.5 rounded-card border border-edge bg-card p-4">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-btn bg-bg ${iconTone}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[9.5px] font-semibold uppercase tracking-wide text-txt3">{label}</p>
        <p className="text-[19px] font-bold text-txt">{value}</p>
        <p className="truncate text-[10.5px] text-txt2">{sub}</p>
      </div>
    </div>
  );
}

export default function Tweaks({ onNavigate }: { onNavigate: (page: PageId) => void }) {
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

  const visible = useMemo(() => {
    let list = tweaks.filter((t) => filter === "all" || t.category === filter);
    if (search) list = list.filter((t) => (t.title + t.description).toLowerCase().includes(search.toLowerCase()));
    return [...list].sort((a, b) => b.impact - a.impact);
  }, [tweaks, filter, search]);

  const totalImpact = tweaks.reduce((s, t) => s + t.impact, 0);
  const selImpact = tweaks.filter((t) => selected.has(t.id)).reduce((s, t) => s + t.impact, 0);
  const boost = totalImpact > 0 ? Math.min(99, Math.round((selImpact / totalImpact) * 130)) : 0;
  const boostWord = boost >= 60 ? "High" : boost >= 30 ? "Medium" : boost > 0 ? "Low" : "—";

  const selectedTweaks = tweaks.filter((t) => selected.has(t.id));
  const selPerCat = (c: TweakCategory) => tweaks.filter((t) => t.category === c && selected.has(t.id)).length;

  const toggleSelect = (t: TweakInfo) => {
    if (t.applied) return onNavigate("changelog");
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(t.id) ? n.delete(t.id) : n.add(t.id);
      return n;
    });
  };

  const selectRecommended = () => {
    // Safe + moderate, available, not applied — the sensible default set.
    const recs = tweaks.filter((t) => t.available && !t.applied && t.risk !== "advanced");
    setSelected(new Set(recs.map((t) => t.id)));
  };

  const C = 2 * Math.PI * 52;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-txt">Tweaks</h1>
            <span className="rounded-pill bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-accent">Advanced Control</span>
          </div>
          <p className="mt-1 text-[12.5px] text-txt2">Fine-tune Windows for maximum performance. All tweaks are 100% free, confirmed, and reversible.</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex gap-2.5">
            <button onClick={runScan} disabled={scanning} className="flex items-center gap-2 rounded-btn border border-edge bg-card px-3.5 py-2 text-[12px] font-medium text-txt hover:border-edge2 disabled:opacity-60">
              <RotateCcw size={13} strokeWidth={2} className={scanning ? "animate-spin text-txt2" : "text-txt2"} />
              {scanning ? "Scanning…" : "Re-scan Tweaks"}
            </button>
            <button onClick={() => { if (selected.size === 0) selectRecommended(); setConfirm(selectedTweaks.length ? selectedTweaks : tweaks.filter((t) => t.available && !t.applied && t.risk !== "advanced")); }} className="glint flex items-center gap-2 rounded-btn bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi">
              <Sparkles size={14} strokeWidth={2} /> Apply Recommended
            </button>
          </div>
          <p className="text-[11px] text-txt3">{selected.size} of {tweaks.length} tweaks selected</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="flex gap-4">
        <StatCard icon={<Zap size={18} strokeWidth={2} />} label="Total Tweaks" value={`${tweaks.length}`} sub="100% Free" />
        <StatCard icon={<CheckCircle2 size={18} strokeWidth={2} />} label="Selected" value={`${selected.size}`} sub="Ready to apply" />
        <StatCard icon={<Sparkles size={18} strokeWidth={2} />} label="Potential Boost" value={boostWord} sub="Estimated, from your selection" />
        <StatCard icon={<RotateCcw size={18} strokeWidth={2} />} label="Last Applied" value="Never" sub="No tweaks applied yet" iconTone="text-txt2" />
      </div>

      <div className="grid grid-cols-[1fr_300px] gap-4">
        {/* Left: filters + list */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-card border border-edge bg-card p-2">
            <div className="flex flex-1 items-center gap-1 overflow-x-auto">
              {(["all", ...CATEGORY_ORDER] as const).map((c) => (
                <button key={c} onClick={() => setFilter(c)} className={`shrink-0 rounded-btn px-3 py-1.5 text-[12px] font-medium transition-colors ${filter === c ? "bg-accent/15 text-accent" : "text-txt2 hover:text-txt"}`}>
                  {c === "all" ? "All Tweaks" : CATEGORY_META[c].label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-btn border border-edge bg-bg px-2.5 py-1.5">
              <Search size={13} strokeWidth={2} className="text-txt3" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tweaks…" className="w-32 bg-transparent text-[12px] text-txt placeholder:text-txt3 focus:outline-none" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {visible.length === 0 && <p className="py-8 text-center text-[12px] text-txt3">{scanning ? "Scanning…" : "No tweaks match."}</p>}
            {visible.map((t) => {
              const Icon = CATEGORY_META[t.category].icon;
              const isSel = selected.has(t.id);
              return (
                <div key={t.id} className="flex items-center gap-4 rounded-card border border-edge bg-card p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-btn bg-bg">
                    <Icon size={17} strokeWidth={1.75} className="text-accent" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium text-txt">{t.title}</p>
                    <p className="mt-0.5 text-[12px] leading-snug text-txt2">{t.description}</p>
                    {!t.appliable && !t.applied && <p className="mt-0.5 text-[10px] text-txt3">Scan-only for now — no risk of a fake apply.</p>}
                  </div>
                  <div className="shrink-0">
                    <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-txt3">Impact</p>
                    <ImpactBar impact={t.impact} />
                  </div>
                  <div className="w-[92px] shrink-0 text-right">
                    {t.applied ? (
                      <div className="flex items-center justify-end gap-2">
                        <Toggle on onClick={() => onNavigate("changelog")} />
                      </div>
                    ) : (
                      <button onClick={() => toggleSelect(t)} className="inline-flex items-center gap-1.5">
                        <span className={`grid h-4 w-4 place-items-center rounded border ${isSel ? "border-accent bg-accent" : "border-edge2"}`}>
                          {isSel && <Check size={11} className="text-white" strokeWidth={3} />}
                        </span>
                        <span className={`text-[11px] ${isSel ? "text-txt" : "text-txt3"}`}>{isSel ? "Selected" : "Select"}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom bar */}
          <div className="flex items-center gap-4 rounded-card border border-edge bg-card px-4 py-3 text-[11.5px]">
            <span className="text-txt3">{tweaks.length} tweaks available</span>
            <span className="flex items-center gap-1.5 text-txt2"><Check size={13} className="text-success" /> Safe to apply</span>
            <span className="flex items-center gap-1.5 text-txt2"><ShieldCheck size={13} className="text-success" /> Restore point ready</span>
            <span className="flex items-center gap-1.5 text-txt2"><RotateCcw size={13} className="text-success" /> Easy to revert</span>
            <span className="ml-auto flex items-center gap-3">
              <button onClick={() => setSelected(new Set())} className="flex items-center gap-1 text-txt2 hover:text-txt"><X size={13} /> Deselect All</button>
            </span>
          </div>
        </div>

        {/* Right: overview */}
        <div className="flex flex-col gap-3">
          <div className="rounded-card border border-edge bg-card p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-txt3">Tweaks Overview</p>
            <div className="relative mx-auto h-[128px] w-[128px]">
              <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
                <circle cx="64" cy="64" r="52" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="9" />
                <circle cx="64" cy="64" r="52" fill="none" stroke="#e3000e" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(boost / 100) * C} ${C}`} style={{ filter: "drop-shadow(0 0 12px rgba(227,0,14,0.35))", transition: "stroke-dasharray .4s" }} />
              </svg>
              <div className="absolute inset-0 grid place-items-center">
                <span className="text-3xl font-bold text-txt">{boost}%</span>
              </div>
            </div>
            <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-widest text-txt3">Performance Boost</p>
            <p className="text-center text-[10.5px] text-txt2">Estimated from your selection</p>

            <div className="mt-4 flex flex-col gap-1.5 border-t border-edge pt-3">
              {CATEGORY_ORDER.map((c) => {
                const Icon = CATEGORY_META[c].icon;
                return (
                  <div key={c} className="flex items-center gap-2.5 text-[12px]">
                    <Icon size={13} strokeWidth={1.75} className="text-txt3" />
                    <span className="flex-1 text-txt2">{CATEGORY_META[c].label}</span>
                    <span className="text-txt">{selPerCat(c)} selected</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-card border border-edge bg-card p-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-txt3">Recommended Action</p>
            <div className="mt-2 flex items-start gap-2">
              <Zap size={16} className="mt-0.5 shrink-0 text-accent" />
              <div>
                <p className="text-[13px] font-bold text-txt">Apply Recommended</p>
                <p className="text-[11px] text-txt2">Apply the safe/moderate tweaks selected for the best boost.</p>
              </div>
            </div>
            <button onClick={() => { if (selected.size === 0) selectRecommended(); setConfirm(selectedTweaks.length ? selectedTweaks : tweaks.filter((t) => t.available && !t.applied && t.risk !== "advanced")); }} className="glint mt-3 w-full rounded-btn bg-accent py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi">
              Apply Now
            </button>
          </div>
        </div>
      </div>

      {confirm && (
        <ApplyConfirmModal tweaks={confirm} title="Apply tweaks" onClose={() => setConfirm(null)} onApplied={() => { setSelected(new Set()); runScan(); }} />
      )}
    </div>
  );
}
