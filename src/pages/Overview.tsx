import { useEffect, useState } from "react";
import { Activity, ChevronRight, Cpu, HardDrive, MemoryStick, Monitor, Package, ShieldAlert, Sparkles, Thermometer, Zap } from "lucide-react";
import { useSystemStore } from "../store/systemStore";
import { scanJunk, scanBloatware, scanDeviceHealth, getChangeLog } from "../lib/backend";
import type { PageId } from "../lib/nav";

// Live "at a glance" system view: real temps, usage and hardware from the same
// monitor that feeds the rest of the app — nothing here is estimated or faked.

function tempTone(t: number | null | undefined): string {
  if (t == null) return "#6b7280";
  if (t >= 85) return "#e3000e";
  if (t >= 72) return "#f59e0b";
  return "#22c55e";
}
function usageTone(v: number | null | undefined): string {
  if (v == null) return "#6b7280";
  if (v >= 90) return "#e3000e";
  if (v >= 70) return "#f59e0b";
  return "#a855f7";
}

function Bar({ value, tone }: { value: number | null | undefined; tone: string }) {
  const v = value == null ? null : Math.max(0, Math.min(100, value));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-edge">
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: v == null ? "0%" : `${v}%`, backgroundColor: tone }}
      />
    </div>
  );
}

// One of the three big live cards (CPU / GPU / RAM).
function MetricCard({
  icon: Icon,
  label,
  spec,
  bigValue,
  bigUnit,
  bigTone,
  usage,
  usageLabel,
}: {
  icon: typeof Cpu;
  label: string;
  spec: string;
  bigValue: string;
  bigUnit?: string;
  bigTone: string;
  usage: number | null;
  usageLabel: string;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-edge bg-card p-5">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-txt3">
        <Icon size={14} /> {label}
      </div>
      <p className="mt-1 truncate text-[11.5px] text-txt2" title={spec}>{spec}</p>
      <div className="mt-3 flex items-end gap-1">
        <span className="text-[34px] font-black leading-none" style={{ color: bigTone }}>{bigValue}</span>
        {bigUnit && <span className="mb-1 text-[14px] font-semibold text-txt3">{bigUnit}</span>}
      </div>
      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="text-txt2">{usageLabel}</span>
          <span className="font-semibold text-txt">{usage == null ? "—" : `${usage.toFixed(0)}%`}</span>
        </div>
        <Bar value={usage} tone={usageTone(usage)} />
      </div>
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-edge/60 py-2 last:border-0">
      <span className="text-[11.5px] text-txt3">{label}</span>
      <span className="truncate text-right text-[12px] font-medium text-txt" title={value ?? undefined}>{value ?? "—"}</span>
    </div>
  );
}

interface Health {
  tweaks: number;
  junkGb: number;
  removable: number;
  deviceIssues: number;
}

export default function Overview({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const stats = useSystemStore((s) => s.stats);
  const hw = useSystemStore((s) => s.hardware);
  const connected = useSystemStore((s) => s.backendConnected);

  const cpuTemp = stats?.cpuTempC ?? null;
  const gpuTemp = stats?.gpuTempC ?? null;
  const score = stats?.systemScore ?? null;

  // Quick-health counts, fetched once (all off-thread now, so no freeze).
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all([getChangeLog(), scanJunk(), scanBloatware(), scanDeviceHealth()])
      .then(([log, junk, bloat, devices]) => {
        if (!alive) return;
        setHealth({
          tweaks: log.filter((e) => !e.undone).length,
          junkGb: junk.reduce((s, c) => s + c.bytes, 0) / 1_073_741_824,
          removable: bloat.length,
          deviceIssues: devices.length,
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const healthCards = [
    { icon: Zap, label: "Tweaks active", value: health?.tweaks, tone: "#a855f7", page: "tweaks" as PageId },
    { icon: Sparkles, label: "Reclaimable junk", value: health ? `${health.junkGb.toFixed(1)} GB` : undefined, tone: "#22c55e", page: "cleaner" as PageId },
    { icon: Package, label: "Removable apps", value: health?.removable, tone: "#f59e0b", page: "cleaner" as PageId },
    { icon: ShieldAlert, label: "Device issues", value: health?.deviceIssues, tone: health && health.deviceIssues > 0 ? "#e3000e" : "#22c55e", page: "diagnostics" as PageId },
  ];

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div>
        <h1 className="text-[42px] font-black uppercase leading-none tracking-tight text-txt">System Overview</h1>
        <p className="mt-1.5 text-[14px] text-txt2">Live temps, usage and hardware at a glance — all real, nothing estimated.</p>
      </div>

      {!connected && (
        <p className="rounded-xl border border-edge bg-card px-4 py-3 text-[12.5px] text-txt2">Connecting to the system monitor…</p>
      )}

      {/* Three live metric cards */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard
          icon={Cpu}
          label="CPU"
          spec={hw?.cpuName ?? "Processor"}
          bigValue={cpuTemp == null ? "—" : cpuTemp.toFixed(0)}
          bigUnit={cpuTemp == null ? undefined : "°C"}
          bigTone={tempTone(cpuTemp)}
          usage={stats?.cpuUsagePercent ?? null}
          usageLabel="Usage"
        />
        <MetricCard
          icon={Monitor}
          label="GPU"
          spec={hw?.gpuName ?? "Graphics"}
          bigValue={gpuTemp == null ? "—" : gpuTemp.toFixed(0)}
          bigUnit={gpuTemp == null ? undefined : "°C"}
          bigTone={tempTone(gpuTemp)}
          usage={stats?.gpuUsagePercent ?? null}
          usageLabel="Usage"
        />
        <MetricCard
          icon={MemoryStick}
          label="Memory"
          spec={hw ? `${hw.ramTotalGb.toFixed(0)} GB${hw.ramType ? ` ${hw.ramType}` : ""}${hw.ramSpeedMhz ? ` · ${hw.ramSpeedMhz} MHz` : ""}` : "RAM"}
          bigValue={stats ? stats.ramUsedGb.toFixed(1) : "—"}
          bigUnit={stats ? `/ ${stats.ramTotalGb.toFixed(0)} GB` : undefined}
          bigTone={usageTone(stats?.ramUsagePercent)}
          usage={stats?.ramUsagePercent ?? null}
          usageLabel="In use"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Utilization + temps */}
        <div className="rounded-2xl border border-edge bg-card p-5">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-txt3">
            <Activity size={14} /> Utilization
          </div>
          <div className="mt-4 flex flex-col gap-3.5">
            {[
              { label: "CPU", value: stats?.cpuUsagePercent ?? null },
              { label: "GPU", value: stats?.gpuUsagePercent ?? null },
              { label: "Memory", value: stats?.ramUsagePercent ?? null },
              { label: "Disk", value: stats?.diskActivityPercent ?? null },
            ].map((r) => (
              <div key={r.label}>
                <div className="mb-1 flex items-center justify-between text-[11.5px]">
                  <span className="text-txt2">{r.label}</span>
                  <span className="font-semibold text-txt">{r.value == null ? "—" : `${r.value.toFixed(0)}%`}</span>
                </div>
                <Bar value={r.value} tone={usageTone(r.value)} />
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-4 border-t border-edge/60 pt-3 text-[11.5px]">
            <span className="flex items-center gap-1.5 text-txt2"><Thermometer size={13} style={{ color: tempTone(cpuTemp) }} /> CPU {cpuTemp == null ? "—" : `${cpuTemp.toFixed(0)}°C`}</span>
            <span className="flex items-center gap-1.5 text-txt2"><Thermometer size={13} style={{ color: tempTone(gpuTemp) }} /> GPU {gpuTemp == null ? "—" : `${gpuTemp.toFixed(0)}°C`}</span>
          </div>
        </div>

        {/* Specifications */}
        <div className="col-span-2 rounded-2xl border border-edge bg-card p-5">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-txt3">
            <HardDrive size={14} /> Specifications
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-8">
            <SpecRow label="CPU" value={hw ? `${hw.cpuName} · ${hw.cpuCores}C/${hw.cpuThreads}T` : null} />
            <SpecRow label="GPU" value={hw?.gpuName ?? null} />
            <SpecRow label="GPU driver" value={hw?.gpuDriverVersion ?? null} />
            <SpecRow label="Memory" value={hw ? `${hw.ramTotalGb.toFixed(0)} GB${hw.ramType ? ` ${hw.ramType}` : ""}${hw.ramSpeedMhz ? ` @ ${hw.ramSpeedMhz} MHz` : ""}` : null} />
            <SpecRow label="Storage" value={hw?.storageSummary ?? null} />
            <SpecRow label="Motherboard" value={hw?.motherboard ?? null} />
            <SpecRow label="OS" value={hw ? `${hw.osEdition ?? "Windows"}${hw.osBuild ? ` (build ${hw.osBuild})` : ""}` : null} />
            <SpecRow label="Power plan" value={stats?.activePowerPlan ?? null} />
          </div>
        </div>
      </div>

      {/* Quick health — real counts, each a shortcut to the tab that acts on it */}
      <div>
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-txt2">Quick health</h2>
        <div className="grid grid-cols-4 gap-4">
          {healthCards.map((c) => (
            <button
              key={c.label}
              onClick={() => onNavigate(c.page)}
              className="group flex flex-col rounded-2xl border border-edge bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent/30"
            >
              <div className="flex items-center justify-between">
                <c.icon size={16} style={{ color: c.tone }} />
                <ChevronRight size={14} className="text-txt3 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              {c.value === undefined ? (
                <span className="skeleton mt-3 block h-7 w-16 rounded" />
              ) : (
                <span className="mt-2 text-[26px] font-black leading-none" style={{ color: c.tone }}>{c.value}</span>
              )}
              <span className="mt-1.5 text-[11.5px] text-txt2">{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* System score + bottleneck */}
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-edge bg-card p-5">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-accent/10">
            <span className="text-[26px] font-black text-accent">{score ?? "—"}</span>
          </div>
          <div>
            <p className="text-[15px] font-bold text-txt">Mujify Score{score != null ? ` · ${score}/100` : ""}</p>
            <p className="mt-0.5 text-[12px] text-txt2">
              {stats?.bottleneckDetail || (stats ? "System looks healthy." : "Measuring…")}
            </p>
          </div>
        </div>
        {stats?.bottleneck && stats.bottleneck !== "balanced" && (
          <span className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-[11px] font-bold uppercase text-warning">
            {stats.bottleneck} bottleneck
          </span>
        )}
      </div>
    </div>
  );
}
