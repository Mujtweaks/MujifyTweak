import { Cpu, HardDrive, MemoryStick, Monitor, type LucideIcon } from "lucide-react";
import ScoreGauge from "../components/ScoreGauge";
import ActionCards from "../components/ActionCards";
import StatGauges from "../components/StatGauges";
import PerformanceChart from "../components/PerformanceChart";
import RecentActivity from "../components/RecentActivity";
import { useSystemStore } from "../store/systemStore";
import type { PageId } from "../lib/nav";

function HwRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | null }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon size={15} strokeWidth={1.5} className="shrink-0 text-txt3" />
      <div className="min-w-0">
        <p className="text-[9.5px] font-semibold uppercase tracking-wide text-txt3">{label}</p>
        <p className="truncate text-[12px] text-txt">{value ?? "Detecting…"}</p>
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
  return (
    <div className="grid h-full grid-cols-[1.62fr_1fr] gap-4">
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
  );
}
