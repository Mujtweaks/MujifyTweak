import { useEffect, useMemo, useState } from "react";
import {
  Bluetooth,
  Cpu,
  Gamepad2,
  Globe,
  Plus,
  Search,
  ShieldCheck,
  Volume2,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { applyFix, scanFixes } from "../lib/backend";
import { ACTION_LABEL, RISK_DEF, RISK_WORD, type TweakAction } from "../lib/tweakDetails";
import type { FixInfo } from "../lib/types";
import DebloatSection from "../components/DebloatSection";

const FIX_CAT: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  gaming: { label: "Gaming", color: "#e3000e", icon: Gamepad2 },
  network: { label: "Network", color: "#4a9eff", icon: Globe },
  system: { label: "System", color: "#a855f7", icon: Cpu },
  audio: { label: "Audio", color: "#22c55e", icon: Volume2 },
  hardware: { label: "Hardware", color: "#f59e0b", icon: Bluetooth },
};
const CAT_ORDER = ["gaming", "network", "system", "audio", "hardware"];
const RISK_TONE: Record<string, string> = {
  safe: "bg-success/10 text-success",
  moderate: "bg-warning/10 text-warning",
  advanced: "bg-purple-500/10 text-purple-400",
};

function FixCard({ fix, onApply }: { fix: FixInfo; onApply: (f: FixInfo) => void }) {
  const [expanded, setExpanded] = useState(false);
  const cat = FIX_CAT[fix.category] ?? { label: fix.category, color: "#888888", icon: Wrench };
  const Icon = cat.icon;
  return (
    <div className="rounded-2xl border border-edge bg-card p-5 transition-all duration-150 hover:-translate-y-px hover:scale-[1.005] hover:border-white/20">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: `${cat.color}20` }}>
            <Icon size={18} strokeWidth={1.75} style={{ color: cat.color }} />
          </span>
          <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase" style={{ backgroundColor: `${cat.color}18`, color: cat.color }}>
            {cat.label}
          </span>
        </div>
        <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${RISK_TONE[fix.risk] ?? "text-txt2"}`}>
          {RISK_WORD[fix.risk] ?? fix.risk}
        </span>
      </div>

      <p className="mt-3 text-[15px] font-bold text-txt">{fix.title}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-txt2">{fix.description}</p>

      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={() => setExpanded((v) => !v)}
          title="What this does"
          className={`grid h-7 w-7 place-items-center rounded-full border border-edge bg-bg transition-colors ${expanded ? "text-accent" : "text-txt2 hover:text-txt"}`}
        >
          <Plus size={13} strokeWidth={2} className={`transition-transform ${expanded ? "rotate-45" : ""}`} />
        </button>
        <button
          onClick={() => onApply(fix)}
          className="glint flex items-center gap-2 rounded-btn bg-accent px-4 py-2 text-[12.5px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi"
        >
          <Wrench size={13} strokeWidth={2.25} /> Apply Fix
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2.5 rounded-chip border border-edge bg-bg px-3.5 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-txt3">What this does</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-txt2">{fix.what}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded bg-panel2 px-2 py-0.5 text-[10px] font-semibold text-txt2">
              {ACTION_LABEL[fix.action as TweakAction] ?? fix.action}
            </span>
            <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${RISK_TONE[fix.risk] ?? "text-txt2"}`}>
              {RISK_WORD[fix.risk] ?? fix.risk}
            </span>
          </div>
          <p className="text-[10.5px] leading-snug text-txt3">{RISK_DEF[fix.risk]}</p>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-txt3">Exactly what changes</p>
            <p className="mt-0.5 break-words font-mono text-[10.5px] leading-relaxed text-txt2">{fix.changes}</p>
          </div>
          <p className="text-[10.5px] text-txt3">
            {fix.reversible
              ? "Reversible — revert it from the Change Log."
              : "One-shot repair — safe, but not auto-reversible."}
          </p>
        </div>
      )}
    </div>
  );
}

function FixConfirmModal({
  fix,
  applying,
  onClose,
  onConfirm,
}: {
  fix: FixInfo;
  applying: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-card border border-edge bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-edge px-5 py-4">
          <h2 className="text-[15px] font-bold text-txt">Apply fix — {fix.title}</h2>
          <button onClick={onClose} className="text-txt3 hover:text-txt">
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto px-5 py-4">
          <p className="text-[12.5px] leading-relaxed text-txt2">{fix.what}</p>
          <div className="mt-3 rounded-chip border border-edge bg-card px-3.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-txt3">Exactly what changes</p>
            <p className="mt-0.5 break-words font-mono text-[11px] leading-relaxed text-txt2">{fix.changes}</p>
          </div>
          <p className="mt-3 flex items-start gap-2 text-[11.5px] text-txt2">
            <ShieldCheck size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-accent" />
            {fix.reversible
              ? "This change is logged and can be reverted from the Change Log."
              : "This is a one-shot repair (safe, but not auto-reversible). It's still logged in the Change Log."}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2.5 border-t border-edge px-5 py-4">
          <button onClick={onClose} className="rounded-btn border border-edge bg-card px-4 py-2 text-[12.5px] font-medium text-txt2 hover:text-txt">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={applying}
            className="flex items-center gap-2 rounded-btn bg-accent px-4 py-2 text-[12.5px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi disabled:opacity-60"
          >
            <Wrench size={14} strokeWidth={2.25} /> {applying ? "Applying…" : "Apply Fix"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Fixes Hub — real, reversible Windows repairs, styled like the Tweaks page.
 * Every fix routes through the SAME confirmation modal + ChangeLog + rollback as
 * tweaks. Nothing runs without the user clicking Apply Fix in the confirm modal.
 */
export default function Fixes() {
  const [fixes, setFixes] = useState<FixInfo[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<FixInfo | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    void scanFixes().then(setFixes);
  }, []);

  const filtered = useMemo(() => {
    let list = fixes.filter((f) => filter === "all" || f.category === filter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((f) => (f.title + f.description).toLowerCase().includes(q));
    }
    return list;
  }, [fixes, filter, search]);

  const doApply = async () => {
    if (!confirm) return;
    setApplying(true);
    await applyFix(confirm.id);
    setApplying(false);
    setConfirm(null);
  };

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div>
        <h1 className="text-[42px] font-black uppercase leading-none tracking-tight text-txt">Fixes</h1>
        <p className="mt-1.5 text-[14px] text-txt2">
          Real, documented Windows repairs — each confirmed, logged, and reversible where possible.
        </p>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 rounded-full border border-edge bg-card px-5 py-2.5">
        <Search size={15} strokeWidth={2} className="text-txt3" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search fixes..."
          className="flex-1 bg-transparent text-[13px] text-txt placeholder:text-txt3 focus:outline-none"
        />
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {["all", ...CAT_ORDER].map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`rounded-full border px-4 py-1.5 text-[12px] font-medium transition-colors ${
              filter === c ? "border-accent bg-accent text-white" : "border-edge bg-transparent text-txt2 hover:text-txt"
            }`}
          >
            {c === "all" ? "All" : FIX_CAT[c]?.label ?? c}
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-txt3">{fixes.length === 0 ? "Loading fixes…" : "No fixes match."}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {filtered.map((f, i) => (
            <div key={f.id} className="stagger-item" style={{ animationDelay: `${50 + i * 40}ms` }}>
              <FixCard fix={f} onApply={setConfirm} />
            </div>
          ))}
        </div>
      )}

      <DebloatSection />

      {confirm && (
        <FixConfirmModal fix={confirm} applying={applying} onClose={() => setConfirm(null)} onConfirm={() => void doApply()} />
      )}
    </div>
  );
}
