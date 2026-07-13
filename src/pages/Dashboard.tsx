import { BrainCircuit, Cpu, HardDrive, Laptop, MemoryStick, Monitor, type LucideIcon } from "lucide-react";
import ScoreGauge from "../components/ScoreGauge";
import ActionCards from "../components/ActionCards";
import StatGauges from "../components/StatGauges";
import PerformanceChart from "../components/PerformanceChart";
import RecentActivity from "../components/RecentActivity";
import RestorePointCard from "../components/RestorePointCard";
import DetectiveCard from "../components/DetectiveCard";
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
  // Show every real GPU (iGPU + dGPU), not just the primary.
  const gpuValue =
    hw && hw.gpus?.length > 1 ? hw.gpus.map((g) => g.name).join("  +  ") : (hw?.gpuName ?? null);
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-card border border-edge bg-card p-4">
      <HwRow icon={Cpu} label="Processor" value={hw?.cpuName ?? null} />
      <HwRow icon={Monitor} label="Graphics" value={gpuValue} />
      {/* NPU — only shown when the machine actually has one. */}
      {hw?.npuName && <HwRow icon={BrainCircuit} label="Neural (NPU)" value={hw.npuName} />}
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
      {/* Form factor + OS — so the machine is fully described. */}
      <HwRow
        icon={Laptop}
        label="System"
        value={
          hw
            ? `${hw.chassis || (hw.isLaptop ? "Laptop" : "Desktop")}${hw.onBattery ? " · on battery" : ""}${hw.osEdition ? ` · ${hw.osEdition}` : ""}`
            : null
        }
      />
    </div>
  );
}

export default function Dashboard({ onNavigate }: { onNavigate: (page: PageId) => void }) {

  return (
    <div className="flex h-full flex-col gap-4">
      {/* FPS Drop Detective — only renders when a game regressed below baseline */}
      <DetectiveCard onNavigate={onNavigate} />

      <div className="grid min-h-0 flex-1 grid-cols-[1.62fr_1fr] gap-4">
        <section className="flex min-h-0 flex-col gap-4">
          <ScoreGauge />
          <ActionCards onNavigate={onNavigate} />
          <StatGauges />
          <HardwareStrip />
        </section>
        <section className="flex min-h-0 flex-col gap-4">
          <PerformanceChart />
          <RestorePointCard />
          <RecentActivity onNavigate={onNavigate} />
        </section>
      </div>

    </div>
  );
}
