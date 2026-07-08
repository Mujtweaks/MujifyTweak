import { useState } from "react";
import { Cpu, HardDrive, MemoryStick, Monitor, Signal, Zap, type LucideIcon } from "lucide-react";
import ScoreGauge from "../components/ScoreGauge";
import ActionCards from "../components/ActionCards";
import StatGauges from "../components/StatGauges";
import PerformanceChart from "../components/PerformanceChart";
import RecentActivity from "../components/RecentActivity";
import PingOptimizer from "../components/PingOptimizer";
import { useSystemStore } from "../store/systemStore";
import type { PageId } from "../lib/nav";

function HwRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | null }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon size={15} strokeWidth={1.5} className="shrink-0 text-txt3" />
      <div className="min-w-0 flex-1">
        <p className="text-[9.5px] font-semibold uppercase tracking-wide text-txt3">{label}</p>
        {value !== null ? (
          <p className="truncate text-[12px] text-txt">{value}</p>
        ) : (
          <span className="skeleton mt-1 block h-3 w-24 rounded" />
        )}
      </div>
    </div>
  );
}

function HardwareStrip() {
  const hw = useSystemStore((s) => s.hardware);
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-card border border-edge bg-card p-4">
      <HwRow icon={Cpu} label="Processor" value={hw?.cpuName ?? null} />
      <HwRow icon={Monitor} label="Graphics" value={hw?.gpuName ?? null} />
      <HwRow
        icon={MemoryStick}
        label="Memory"
        value={
          hw
            ? `${hw.ramTotalGb.toFixed(0)}GB${hw.ramType ? ` ${hw.ramType}` : ""}${hw.ramSpeedMhz ? ` ${hw.ramSpeedMhz}MHz` : ""}`
            : null
        }
      />
      <HwRow icon={HardDrive} label="Storage" value={hw?.storageSummary ?? null} />
    </div>
  );
}

export default function Dashboard({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const [pingOpen, setPingOpen] = useState(false);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="grid min-h-0 flex-1 grid-cols-[1.62fr_1fr] gap-4">
        <section className="flex min-h-0 flex-col gap-4">
          <ScoreGauge />
          <ActionCards onNavigate={onNavigate} />
          <StatGauges />
          <HardwareStrip />
        </section>
        <section className="flex min-h-0 flex-col gap-4">
          <PerformanceChart />
          <RecentActivity onNavigate={onNavigate} />
        </section>
      </div>

      {/* Ping Optimizer launcher */}
      <button
        onClick={() => setPingOpen(true)}
        className="glint flex shrink-0 items-center gap-3 rounded-card border border-edge bg-card px-5 py-3 text-left transition-colors hover:border-accent/40"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/10">
          <Signal size={18} strokeWidth={1.75} className="text-accent" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-txt">Ping Optimizer</p>
          <p className="text-[11px] text-txt2">Find your fastest game server and optimize your connection to it.</p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-btn bg-accent px-3.5 py-2 text-[12px] font-semibold text-white">
          <Zap size={13} strokeWidth={2.5} fill="currentColor" /> Open
        </span>
      </button>

      {pingOpen && <PingOptimizer onClose={() => setPingOpen(false)} />}
    </div>
  );
}
