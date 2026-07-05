import { useState } from "react";
import { BarChart3, LineChart, ListChecks, RotateCcw, Search, Zap, type LucideIcon } from "lucide-react";
import { scanTweaks } from "../lib/backend";
import { useSystemStore } from "../store/systemStore";
import { useTweakStore } from "../store/tweakStore";
import ApplyConfirmModal from "./ApplyConfirmModal";
import { PRESET_RISK } from "../lib/categories";
import type { ApplyOutcome, TweakInfo } from "../lib/types";
import type { PageId } from "../lib/nav";

interface ActionCardsProps {
  onNavigate: (page: PageId) => void;
}

function Card({
  title,
  desc,
  icon: Icon,
  primary,
  onClick,
  busy,
}: {
  title: string;
  desc: string;
  icon: LucideIcon;
  primary?: boolean;
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`flex items-start gap-4 rounded-card border p-5 text-left transition-all active:scale-[0.99] ${
        primary
          ? "border-accent bg-accent shadow-[0_4px_20px_rgba(227,0,14,0.3)]"
          : "border-edge bg-card hover:border-accent/40"
      }`}
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-btn ${primary ? "bg-white/15" : "bg-bg"}`}>
        <Icon size={20} strokeWidth={2} className={primary ? "text-white" : "text-accent"} />
      </span>
      <span>
        <span className={`block text-[15px] font-bold ${primary ? "text-white" : "text-txt"}`}>{title}</span>
        <span className={`mt-0.5 block text-[12.5px] leading-snug ${primary ? "text-white/75" : "text-txt2"}`}>
          {busy ? "Scanning…" : desc}
        </span>
      </span>
    </button>
  );
}

export default function ActionCards({ onNavigate }: ActionCardsProps) {
  const hardware = useSystemStore((s) => s.hardware);
  const scanResult = useTweakStore((s) => s.scanResult);
  const setScan = useTweakStore((s) => s.setScan);
  const setSelected = useTweakStore((s) => s.setSelected);
  const [scanning, setScanning] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [boostTweaks, setBoostTweaks] = useState<TweakInfo[]>([]);

  const boost = async () => {
    setScanning(true);
    const r = scanResult ?? (await scanTweaks(hardware?.isLaptop ?? null));
    setScanning(false);
    if (!r) return;
    if (!scanResult) setScan(r);
    // Balanced preset selection — safe + moderate, available, not applied.
    const allowed = PRESET_RISK["balanced"];
    const picks = r.tweaks.filter((t) => t.appliable && t.available && !t.applied && allowed.includes(t.risk));
    setBoostTweaks(picks);
    setShowConfirm(true);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Card title="BOOST" desc="Apply optimizations — confirmed, logged, reversible." icon={Zap} primary onClick={boost} busy={scanning} />
        <Card title="SCAN" desc="Check your system for issues." icon={Search} onClick={() => onNavigate("optimizer")} />
        <Card title="ANALYZE" desc="See what's slowing you down." icon={BarChart3} onClick={() => onNavigate("diagnostics")} />
        <Card title="REVERT ALL" desc="Undo every change instantly." icon={RotateCcw} onClick={() => onNavigate("changelog")} />
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => onNavigate("report")}
          className="flex flex-1 items-center justify-center gap-2 rounded-chip border border-edge bg-card px-4 py-2.5 text-[13px] text-txt2 transition-colors hover:text-txt"
        >
          <LineChart size={14} strokeWidth={2} />
          Before/After Report
          <span className="text-accent">→</span>
        </button>
        <button
          onClick={() => onNavigate("changelog")}
          className="flex flex-1 items-center justify-center gap-2 rounded-chip border border-edge bg-card px-4 py-2.5 text-[13px] text-txt2 transition-colors hover:text-txt"
        >
          <ListChecks size={14} strokeWidth={2} />
          Change Log
          <span className="text-accent">→</span>
        </button>
      </div>

      {showConfirm && (
        <ApplyConfirmModal
          tweaks={boostTweaks}
          title="Boost — apply optimizations"
          onClose={() => setShowConfirm(false)}
          onApplied={(_o: ApplyOutcome) => {
            setSelected(new Set());
            onNavigate("changelog");
          }}
        />
      )}
    </div>
  );
}
