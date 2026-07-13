import { useState } from "react";
import {
  CheckCircle2,
  Cpu,
  FileDown,
  Gauge,
  HardDrive,
  Lightbulb,
  MemoryStick,
  Monitor,
  Network,
  Radar,
  ShieldCheck,
  Thermometer,
  type LucideIcon,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useSystemStore } from "../store/systemStore";
import { scanDeviceHealth, getChangeLog } from "../lib/backend";
import { toast } from "../store/toastStore";
import Sparkline from "../components/Sparkline";
import DriverHealth from "../components/DriverHealth";
import HealthScan from "../components/HealthScan";

// Temps come from the LibreHardwareMonitor sidecar, which needs ring0 (admin)
// to read the sensors. Unelevated (dev) builds get null; the installed UAC-
// elevated app gets real °C. Show that honestly instead of a bare dash.
function tempDisplay(temp: number | string | null | undefined): string {
  if (temp == null || temp === "admin") return "Requires admin";
  if (typeof temp === "number") return `${Math.round(temp)}°C`;
  return temp;
}

function healthWord(score: number): { word: string; note: string } {
  if (score >= 85) return { word: "Excellent", note: "Your system is in great shape." };
  if (score >= 70) return { word: "Good", note: "Running well with minor headroom." };
  if (score >= 50) return { word: "Fair", note: "Some pressure detected." };
  return { word: "Needs attention", note: "One or more subsystems are strained." };
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-1 items-start gap-3 px-4 py-1">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${
          accent ? "border-accent/30 bg-accent/10" : "border-edge bg-panel2"
        }`}
      >
        <Icon size={16} strokeWidth={1.75} className={accent ? "text-accent" : "text-txt2"} />
      </span>
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-txt3">{label}</p>
        <p className="text-[14px] font-bold text-txt">{value}</p>
        <p className="text-[10.5px] leading-snug text-txt2">{sub}</p>
      </div>
    </div>
  );
}

function MonitorRow({
  icon: Icon,
  label,
  value,
  percent,
  color,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  percent: number | null;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-[7px]">
      <Icon size={15} strokeWidth={1.75} className="shrink-0 text-txt2" />
      <span className="w-[92px] shrink-0 text-[12px] text-txt2">{label}</span>
      <span className="w-[52px] shrink-0 text-[13px] font-semibold text-txt">{value}</span>
      <div className="ml-auto">
        <Sparkline value={percent} color={color} />
      </div>
    </div>
  );
}

export default function Diagnostics() {
  const stats = useSystemStore((s) => s.stats);
  const hardware = useSystemStore((s) => s.hardware);
  const [exporting, setExporting] = useState(false);

  // Build a real HTML system report from live data and save it to Documents.
  const exportReport = async () => {
    setExporting(true);
    try {
      const [devices, changes] = await Promise.all([scanDeviceHealth(), getChangeLog()]);
      const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] ?? c));
      const row = (k: string, v: string | null | undefined) =>
        `<tr><td>${esc(k)}</td><td>${esc(v ?? "—")}</td></tr>`;
      const html = `<!doctype html><meta charset="utf-8"><title>Mujify System Report</title>
<style>body{font:14px/1.6 system-ui,Segoe UI,Arial;background:#0d0d0d;color:#e7e7e7;max-width:820px;margin:40px auto;padding:0 24px}
h1{color:#e3000e}h2{margin-top:32px;border-bottom:1px solid #2a2a2a;padding-bottom:6px}
table{border-collapse:collapse;width:100%}td{padding:6px 10px;border-bottom:1px solid #1e1e1e}td:first-child{color:#8a8a8a;width:220px}
.muted{color:#8a8a8a;font-size:12px}.ok{color:#22c55e}.warn{color:#f59e0b}</style>
<h1>Mujify System Report</h1><p class="muted">Generated ${esc(new Date().toLocaleString())} · Mujify Score ${score ?? "—"}/100</p>
<h2>Hardware</h2><table>
${row("CPU", hardware ? `${hardware.cpuName} (${hardware.cpuCores}C/${hardware.cpuThreads}T)` : null)}
${row("GPU", hardware?.gpuName)}${row("GPU driver", hardware?.gpuDriverVersion)}
${row("Memory", hardware ? `${hardware.ramTotalGb.toFixed(0)} GB${hardware.ramType ? " " + hardware.ramType : ""}${hardware.ramSpeedMhz ? " @ " + hardware.ramSpeedMhz + " MHz" : ""}` : null)}
${row("Storage", hardware?.storageSummary)}${row("Motherboard", hardware?.motherboard)}
${row("OS", hardware ? `${hardware.osEdition ?? "Windows"}${hardware.osBuild ? " (build " + hardware.osBuild + ")" : ""}` : null)}</table>
<h2>Live snapshot</h2><table>
${row("CPU usage", stats ? stats.cpuUsagePercent.toFixed(0) + " %" : null)}${row("CPU temp", stats?.cpuTempC != null ? stats.cpuTempC.toFixed(0) + " °C" : null)}
${row("GPU usage", stats?.gpuUsagePercent != null ? stats.gpuUsagePercent.toFixed(0) + " %" : null)}${row("GPU temp", stats?.gpuTempC != null ? stats.gpuTempC.toFixed(0) + " °C" : null)}
${row("Memory in use", stats ? stats.ramUsedGb.toFixed(1) + " / " + stats.ramTotalGb.toFixed(0) + " GB (" + stats.ramUsagePercent.toFixed(0) + "%)" : null)}
${row("Bottleneck", stats?.bottleneckDetail || stats?.bottleneck)}${row("Power plan", stats?.activePowerPlan)}</table>
<h2>Device &amp; driver health</h2>${devices.length === 0 ? '<p class="ok">No device problems detected.</p>' : "<table>" + devices.map((d) => row(esc(d.name), `${d.errorText} (code ${d.errorCode})`)).join("") + "</table>"}
<h2>Applied tweaks (${changes.filter((c) => !c.undone).length} active)</h2>${changes.length === 0 ? '<p class="muted">Nothing applied yet.</p>' : "<table>" + changes.slice(-40).reverse().map((c) => row(new Date(c.timestamp).toLocaleString(), `${c.description}${c.undone ? " — reverted" : ""}`)).join("") + "</table>"}
<p class="muted" style="margin-top:40px">Every value above is real, read live from your PC by Mujify Tweaks. Nothing here was estimated.</p>`;
      const path = await invoke<string>("save_report", { html });
      toast.success("Report exported", `Saved to ${path}`);
    } catch (e) {
      toast.error("Export failed", String(e));
    } finally {
      setExporting(false);
    }
  };

  const score = stats?.systemScore ?? null;
  const health = score !== null ? healthWord(score) : null;

  const componentRows: { icon: LucideIcon; label: string; detail: string | null }[] = [
    { icon: Cpu, label: "CPU", detail: hardware?.cpuName ?? null },
    { icon: Monitor, label: "GPU", detail: hardware?.gpuName ?? null },
    {
      icon: MemoryStick,
      label: "RAM",
      detail: hardware
        ? `${hardware.ramTotalGb.toFixed(0)}GB${hardware.ramType ? ` ${hardware.ramType}` : ""}${
            hardware.ramSpeedMhz ? ` ${hardware.ramSpeedMhz}MHz` : ""
          }`
        : null,
    },
    { icon: HardDrive, label: "Storage", detail: hardware?.storageSummary ?? null },
    { icon: Cpu, label: "Motherboard", detail: hardware?.motherboard ?? null },
  ];

  const scoreBars: { label: string; value: number | null }[] = [
    { label: "CPU Performance", value: stats?.health.cpu ?? null },
    { label: "GPU Performance", value: stats?.health.gpu ?? null },
    { label: "Memory Performance", value: stats?.health.memory ?? null },
    { label: "Storage Performance", value: stats?.health.storage ?? null },
    { label: "System Stability", value: stats?.health.stability ?? null },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[42px] font-black uppercase leading-none tracking-tight text-txt">Diagnostics</h1>
            <span className="rounded-md bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
              Live
            </span>
          </div>
          <p className="mt-1.5 max-w-lg text-[12.5px] leading-relaxed text-txt2">
            Real-time monitoring with bottleneck and stability analysis across your whole system.
            Every reading is live Windows data.
          </p>
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={() => void exportReport()}
            disabled={exporting}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-b from-accent to-[#a3000a] px-3.5 py-2 text-[12px] font-semibold text-white shadow-[0_0_18px_rgba(227,0,14,0.3)] disabled:opacity-60"
          >
            <FileDown size={14} strokeWidth={2} />
            {exporting ? "Exporting…" : "Export Report"}
          </button>
        </div>
      </div>

      {/* Bottleneck / Health Scan — the diagnosis centerpiece */}
      <HealthScan />

      {/* Summary row */}
      <div className="flex items-center divide-x divide-edge rounded-2xl border border-edge bg-panel py-4">
        {/* score ring */}
        <div className="flex items-center gap-3 px-5">
          <div className="relative h-[62px] w-[62px]">
            <svg viewBox="0 0 62 62" className="h-full w-full -rotate-90">
              <circle cx="31" cy="31" r="26" fill="none" stroke="#1c1c21" strokeWidth="5" />
              {score !== null && (
                <circle
                  cx="31"
                  cy="31"
                  r="26"
                  fill="none"
                  stroke="#e3000e"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={`${(score / 100) * 163.4} 163.4`}
                  style={{ filter: "drop-shadow(0 0 6px rgba(227,0,14,0.5))" }}
                />
              )}
            </svg>
            <span className="font-display absolute inset-0 grid place-items-center text-[16px] font-bold text-txt">
              {score !== null ? `${score}%` : "--"}
            </span>
          </div>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-txt3">Overall Health</p>
            <p className="text-[14px] font-bold text-accent">{health?.word ?? "Awaiting data"}</p>
            <p className="max-w-[120px] text-[10.5px] leading-snug text-txt2">
              {health?.note ?? "Monitoring is starting…"}
            </p>
          </div>
        </div>

        <SummaryCard
          icon={Cpu}
          label="Bottleneck"
          value={stats?.bottleneck ?? "—"}
          sub={stats?.bottleneckDetail ?? "Analyzing load…"}
          accent
        />
        <SummaryCard
          icon={ShieldCheck}
          label="Stability"
          value={
            stats ? (stats.health.stability >= 85 ? "Very Stable" : stats.health.stability >= 60 ? "Stable" : "Strained") : "—"
          }
          sub="Based on thermals and memory pressure."
        />
        <SummaryCard
          icon={Thermometer}
          label="Temperature"
          value={tempDisplay(stats?.cpuTempC)}
          sub={
            stats?.cpuTempC != null
              ? "Within safe limits."
              : "CPU temp reads live in the installed (admin) app."
          }
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Driver Status"
          value={hardware?.gpuDriverVersion ? "Detected" : "—"}
          sub={hardware?.gpuDriverVersion ? `GPU driver ${hardware.gpuDriverVersion}` : "Reading driver…"}
        />
      </div>

      {/* Three panels */}
      <div className="grid grid-cols-3 gap-4">
        {/* Real-time monitor */}
        <div className="rounded-2xl border border-edge bg-panel p-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-txt2">
            Real-Time System Monitor
          </p>
          <MonitorRow icon={Cpu} label="CPU Usage" value={stats ? `${Math.round(stats.cpuUsagePercent)}%` : "--"} percent={stats?.cpuUsagePercent ?? null} />
          <MonitorRow icon={Monitor} label="GPU Usage" value={stats?.gpuUsagePercent != null ? `${Math.round(stats.gpuUsagePercent)}%` : "--"} percent={stats?.gpuUsagePercent ?? null} color="#2fd466" />
          <MonitorRow icon={MemoryStick} label="VRAM Usage" value={stats?.gpuVramUsedMb != null ? `${(stats.gpuVramUsedMb / 1024).toFixed(1)}GB` : "--"} percent={stats?.gpuVramUsedMb != null ? Math.min(100, (stats.gpuVramUsedMb / 1024 / 16) * 100) : null} color="#3e8bff" />
          <MonitorRow icon={MemoryStick} label="RAM Usage" value={stats ? `${Math.round(stats.ramUsagePercent)}%` : "--"} percent={stats?.ramUsagePercent ?? null} />
          <MonitorRow icon={Thermometer} label="CPU Temp" value={tempDisplay(stats?.cpuTempC)} percent={stats?.cpuTempC != null ? stats.cpuTempC : null} />
          <MonitorRow icon={Thermometer} label="GPU Temp" value={tempDisplay(stats?.gpuTempC)} percent={stats?.gpuTempC != null ? stats.gpuTempC : null} color="#2fd466" />
          <MonitorRow icon={HardDrive} label="Storage Activity" value={stats?.diskActivityPercent != null ? `${Math.round(stats.diskActivityPercent)}%` : "--"} percent={stats?.diskActivityPercent ?? null} color="#3e8bff" />
        </div>

        {/* Component status */}
        <div className="rounded-2xl border border-edge bg-panel p-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-txt2">
            Component Status
          </p>
          <div className="flex flex-col divide-y divide-edge">
            {componentRows.map(({ icon: Icon, label, detail }) => (
              <div key={label} className="flex items-center gap-3 py-2.5">
                <Icon size={15} strokeWidth={1.75} className="shrink-0 text-txt2" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-txt">{label}</p>
                  <p className="truncate text-[10.5px] text-txt2">{detail ?? "Detecting…"}</p>
                </div>
                {detail ? (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-good">
                    Good <CheckCircle2 size={13} strokeWidth={2} />
                  </span>
                ) : (
                  <span className="text-[11px] text-txt3">—</span>
                )}
              </div>
            ))}
            <div className="flex items-center gap-3 py-2.5">
              <Network size={15} strokeWidth={1.75} className="shrink-0 text-txt2" />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-txt">PSU / Power</p>
                <p className="truncate text-[10.5px] text-txt2">Not software-detectable</p>
              </div>
              <span className="text-[11px] text-txt3">—</span>
            </div>
          </div>
        </div>

        {/* Radar scan (idle) */}
        <div className="flex flex-col rounded-2xl border border-edge bg-panel p-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-txt2">
            Diagnostic Scan
          </p>
          <div className="grid flex-1 place-items-center">
            <div className="text-center">
              <div className="relative mx-auto grid h-[150px] w-[150px] place-items-center">
                <div className="absolute inset-0 rounded-full border border-accent/15" />
                <div className="absolute inset-[22px] rounded-full border border-accent/15" />
                <div className="absolute inset-[44px] rounded-full border border-accent/15" />
                <Radar size={30} strokeWidth={1.5} className="text-accent/70" />
              </div>
              <p className="mt-3 text-[12.5px] font-semibold text-txt">No scan running</p>
              <p className="mt-1 max-w-[190px] text-[10.5px] leading-snug text-txt2">
                Click “Run Full Scan” to analyze your system for issues and opportunities.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="flex items-center gap-3 rounded-2xl border border-edge bg-panel p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-good/25 bg-good/10">
            <CheckCircle2 size={20} strokeWidth={1.75} className="text-good" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-txt3">Detected Issues</p>
            <p className="text-[13px] font-semibold text-txt">
              {stats && stats.bottleneck !== "None detected" ? stats.bottleneck : "No critical issues detected"}
            </p>
            <p className="text-[11px] text-txt2">
              {stats?.bottleneck && stats.bottleneck !== "None detected" ? stats.bottleneckDetail : "Your system is running optimally."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-edge bg-panel p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-accent/25 bg-accent/10">
            <Lightbulb size={20} strokeWidth={1.75} className="text-accent" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-txt3">Suggestions</p>
            <p className="text-[13px] font-semibold text-txt">
              {stats && stats.systemScore >= 85 ? "System is optimized" : "Room to optimize"}
            </p>
            <p className="text-[11px] text-txt2">
              {stats && stats.systemScore >= 85 ? "No recommendations at this time." : "Run the Optimizer to see available tweaks."}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-edge bg-panel p-4">
          <div className="mb-2 flex items-center gap-2">
            <Gauge size={14} strokeWidth={2} className="text-txt2" />
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-txt2">
              Performance Score Breakdown
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {scoreBars.map(({ label, value }) => (
              <div key={label} className="flex items-center gap-2.5">
                <span className="w-[124px] shrink-0 text-[11px] text-txt2">{label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel2">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#a3000a] to-accent transition-all duration-500"
                    style={{ width: `${value ?? 0}%` }}
                  />
                </div>
                <span className="w-[46px] shrink-0 text-right text-[11px] font-semibold text-txt">
                  {value !== null ? `${value}/100` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <DriverHealth />
    </div>
  );
}
