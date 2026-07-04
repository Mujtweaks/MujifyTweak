import { Cpu, HardDrive, MemoryStick, Monitor, type LucideIcon } from "lucide-react";
import ScoreGauge from "../components/ScoreGauge";
import ActionCards from "../components/ActionCards";
import StatGauges from "../components/StatGauges";
import PerformanceChart from "../components/PerformanceChart";
import RecentActivity from "../components/RecentActivity";
import { useSystemStore } from "../store/systemStore";
import type { PageId } from "../lib/nav";

function HardwareItem({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex flex-1 items-center gap-2.5 px-3 py-1">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-edge bg-panel2">
        <Icon size={13} strokeWidth={1.75} className="text-txt2" />
      </span>
      <div className="min-w-0">
        <p className="text-[8.5px] font-semibold uppercase tracking-[0.14em] text-txt3">
          {label}
        </p>
        <p className="truncate text-[11.5px] font-medium text-txt">
          {value ?? "Detecting… (Checkpoint 2)"}
        </p>
      </div>
    </div>
  );
}

/** Hardware identity strip — values come from HardwareProfiler (Checkpoint 2). */
function HardwareStrip() {
  const hw = useSystemStore((s) => s.hardware);
  return (
    <div className="flex divide-x divide-edge rounded-2xl border border-edge bg-panel px-1 py-2">
      <HardwareItem icon={Cpu} label="Processor" value={hw?.cpuName ?? null} />
      <HardwareItem icon={Monitor} label="Graphics Card" value={hw?.gpuName ?? null} />
      <HardwareItem
        icon={MemoryStick}
        label="Memory"
        value={
          hw
            ? `${hw.ramTotalGb.toFixed(0)}GB${hw.ramType ? ` ${hw.ramType}` : ""}${
                hw.ramSpeedMhz ? ` ${hw.ramSpeedMhz}MHz` : ""
              }`
            : null
        }
      />
      <HardwareItem icon={HardDrive} label="Storage" value={hw?.storageSummary ?? null} />
    </div>
  );
}

interface DashboardProps {
  onNavigate: (page: PageId) => void;
}

/** Home — the command center, laid out per the dashboard mockup. */
export default function Dashboard({ onNavigate }: DashboardProps) {
  return (
    <div className="grid h-full grid-cols-12 gap-4">
      <section className="col-span-7 flex min-h-0 flex-col gap-4">
        <ScoreGauge />
        <ActionCards onNavigate={onNavigate} />
        <StatGauges />
        <HardwareStrip />
      </section>

      <section className="col-span-5 flex min-h-0 flex-col gap-4">
        <PerformanceChart />
        <RecentActivity onNavigate={onNavigate} />
      </section>
    </div>
  );
}
