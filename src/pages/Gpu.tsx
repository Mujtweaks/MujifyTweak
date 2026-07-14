import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Activity, CheckCircle2, Cpu, Gauge, MemoryStick, Monitor, Server, Sliders,
  Thermometer, TrendingUp, XCircle, Zap,
} from "lucide-react";
import { scanTweaks } from "../lib/backend";
import { useSystemStore } from "../store/systemStore";
import { useTweakStore } from "../store/tweakStore";
import ApplyConfirmModal from "../components/ApplyConfirmModal";
import type { HardwareTier, TweakInfo } from "../lib/types";
import type { PageId } from "../lib/nav";

// A real-data GPU dashboard. EVERY value is live telemetry or derived from the
// real tweak scan — anything the hardware doesn't expose (fan RPM, board power,
// per-stage latency without a running game) is shown honestly as "Not detected",
// never invented.

function vendorColor(v: string | undefined): string {
  const s = (v ?? "").toLowerCase();
  if (s.includes("nvidia")) return "#76b900";
  if (s.includes("amd")) return "#ed1c24";
  if (s.includes("intel")) return "#0071c5";
  return "#a855f7";
}
function tempTone(t: number | null | undefined): string {
  if (t == null) return "#6b7280";
  if (t >= 85) return "#e3000e";
  if (t >= 72) return "#f59e0b";
  return "#22c55e";
}

function StatCard({ icon: Icon, label, value, unit, tone, sub }: { icon: typeof Monitor; label: string; value: string; unit?: string; tone: string; sub?: string }) {
  const detected = value !== "Not detected";
  return (
    <div className="flex flex-col rounded-2xl border border-edge bg-card p-4">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-txt3">
        <Icon size={13} /> {label}
      </div>
      {detected ? (
        <div className="mt-2 flex items-end gap-1">
          <span className="text-[26px] font-black leading-none" style={{ color: tone }}>{value}</span>
          {unit && <span className="mb-0.5 text-[13px] font-semibold text-txt3">{unit}</span>}
        </div>
      ) : (
        <div className="mt-2 text-[15px] font-bold text-txt3">Not detected</div>
      )}
      {sub && <p className="mt-1 text-[10.5px] text-txt3">{detected ? sub : "Hardware sensor unavailable"}</p>}
    </div>
  );
}

// A small check/cross row for the readiness + health lists.
function CheckRow({ ok, label, value }: { ok: boolean | null; label: string; value: string }) {
  const Icon = ok === null ? Activity : ok ? CheckCircle2 : XCircle;
  const tone = ok === null ? "text-txt3" : ok ? "text-success" : "text-accent";
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="flex items-center gap-2 text-[12px] text-txt2">
        <Icon size={13} className={tone} /> {label}
      </span>
      <span className={`text-[11.5px] font-semibold ${ok === null ? "text-txt3" : ok ? "text-success" : "text-accent"}`}>{value}</span>
    </div>
  );
}

export default function Gpu({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const stats = useSystemStore((s) => s.stats);
  const frameStats = useSystemStore((s) => s.frameStats);
  const hw = useSystemStore((s) => s.hardware);
  const scanResult = useTweakStore((s) => s.scanResult);
  const setScan = useTweakStore((s) => s.setScan);
  const [confirm, setConfirm] = useState<TweakInfo[] | null>(null);
  const [tier, setTier] = useState<HardwareTier | null>(null);

  const runScan = async () => {
    const r = await scanTweaks(hw?.isLaptop ?? null);
    if (r) setScan(r);
  };
  useEffect(() => {
    if (!scanResult) void runScan();
    void invoke<HardwareTier>("get_hardware_tier").then(setTier).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byId = useMemo(() => new Map((scanResult?.tweaks ?? []).map((t) => [t.id, t])), [scanResult]);
  const applied = (id: string) => byId.get(id)?.applied ?? false;
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((t): t is TweakInfo => !!t);
  const actionable = (ids: string[]) => pick(ids).filter((t) => t.appliable && t.available && !t.applied);

  const vcolor = vendorColor(hw?.gpuVendor);
  const v = (hw?.gpuVendor ?? "").toLowerCase();
  const vendorIds = v.includes("nvidia")
    ? ["nvidia_max_performance", "nvidia_disable_telemetry"]
    : v.includes("amd")
      ? ["amd_disable_ulps"]
      : [];
  // The tweaks that make a GPU "game ready". Applied ones lift the score.
  const readinessIds = ["hags", "disable_fso", "disable_gamedvr", "disable_game_bar", "gpu_priority", ...vendorIds];
  const readyRows = pick(readinessIds);
  const readyApplied = readyRows.filter((t) => t.applied).length;
  const readyScore = readyRows.length ? Math.round((readyApplied / readyRows.length) * 100) : 0;
  const scoreLabel = readyScore >= 85 ? "Excellent" : readyScore >= 60 ? "Good" : readyScore >= 35 ? "Fair" : "Needs work";
  const scoreTone = readyScore >= 85 ? "#22c55e" : readyScore >= 60 ? "#84cc16" : readyScore >= 35 ? "#f59e0b" : "#e3000e";

  const recs = actionable(readinessIds);

  const temp = stats?.gpuTempC ?? null;
  const load = stats?.gpuUsagePercent ?? null;
  const vramUsed = stats?.gpuVramUsedMb ?? null;
  const vramTotalGb = tier?.vramGb ?? null;
  const vramPct = vramUsed != null && vramTotalGb ? Math.min(100, Math.round((vramUsed / 1024 / vramTotalGb) * 100)) : null;

  const plan = (stats?.activePowerPlan ?? "").toLowerCase();
  const maxPerf = plan.includes("ultimate") || plan.includes("high");
  const driver = hw?.gpuDriverVersion;

  // Readiness radar axes — all from REAL signals (0..100). Thermals only if a
  // temp sensor is present; otherwise it's omitted rather than faked.
  const radar: { label: string; pct: number }[] = [
    { label: "GPU tweaks", pct: readyScore },
    { label: "Power", pct: maxPerf ? 100 : 40 },
    { label: "Capture off", pct: applied("disable_gamedvr") && applied("disable_game_bar") ? 100 : 40 },
    { label: "Scheduling", pct: applied("hags") ? 100 : applied("gpu_priority") ? 70 : 30 },
    ...(temp != null ? [{ label: "Thermals", pct: Math.max(0, Math.min(100, Math.round(100 - Math.max(0, temp - 45) * 2.2))) }] : []),
  ];

  return (
    <div className="flex flex-col gap-4 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ backgroundColor: `${vcolor}22` }}>
          <Monitor size={26} style={{ color: vcolor }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[28px] font-black uppercase leading-none tracking-tight text-txt">{hw?.gpuName ?? "GPU"}</h1>
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase text-success">Active</span>
          </div>
          <p className="mt-1 text-[12.5px] text-txt2">
            {hw?.gpuVendor ?? "Graphics"}{driver ? ` · Driver ${driver}` : " · Driver version not detected"}
          </p>
        </div>
      </div>

      {/* Live stat cards — real telemetry, "Not detected" when the sensor is absent */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Thermometer} label="Temperature" value={temp == null ? "Not detected" : temp.toFixed(0)} unit={temp == null ? undefined : "°C"} tone={tempTone(temp)} sub={temp == null ? undefined : temp >= 85 ? "Hot" : temp >= 72 ? "Warm" : "Normal"} />
        <StatCard icon={Activity} label="GPU Load" value={load == null ? "Not detected" : load.toFixed(0)} unit={load == null ? undefined : "%"} tone={vcolor} sub={load == null ? undefined : "Live utilization"} />
        <StatCard icon={MemoryStick} label="VRAM Used" value={vramUsed == null ? "Not detected" : (vramUsed / 1024).toFixed(1)} unit={vramUsed == null ? undefined : vramTotalGb ? `/ ${vramTotalGb} GB` : "GB"} tone={vcolor} sub={vramPct != null ? `${vramPct}% of dedicated memory` : vramUsed == null ? undefined : "Total not detected"} />
        <StatCard icon={Zap} label="Power Draw" value="Not detected" tone="#6b7280" sub="No board-power sensor" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* GPU Ready Score + checklist */}
        <div className="rounded-2xl border border-edge bg-card p-5">
          <div className="flex items-center gap-2 text-[13px] font-bold text-txt"><Gauge size={15} /> GPU Ready Score</div>
          <div className="mt-3 flex items-center gap-5">
            <div className="relative grid h-28 w-28 shrink-0 place-items-center">
              <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="9" />
                <circle cx="50" cy="50" r="42" fill="none" stroke={scoreTone} strokeWidth="9" strokeLinecap="round"
                  strokeDasharray={`${(readyScore / 100) * 264} 264`} />
              </svg>
              <div className="absolute grid place-items-center text-center">
                <span className="text-[26px] font-black leading-none" style={{ color: scoreTone }}>{readyScore}</span>
                <span className="text-[9px] font-bold uppercase tracking-wide text-txt3">{scoreLabel}</span>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <CheckRow ok={driver ? true : null} label="Driver" value={driver ? "Installed" : "Unknown"} />
              <CheckRow ok={applied("hags")} label="HAGS" value={applied("hags") ? "Enabled" : "Off"} />
              <CheckRow ok={applied("disable_fso")} label="Fullscreen Opt" value={applied("disable_fso") ? "Disabled" : "On"} />
              <CheckRow ok={applied("disable_gamedvr")} label="Game DVR / Capture" value={applied("disable_gamedvr") ? "Disabled" : "On"} />
              <CheckRow ok={maxPerf} label="Power Mode" value={maxPerf ? "Max Performance" : stats?.activePowerPlan ?? "Balanced"} />
              <CheckRow ok={applied("gpu_priority") || applied("mmcss_gaming")} label="GPU Priority" value={applied("gpu_priority") || applied("mmcss_gaming") ? "High" : "Default"} />
            </div>
          </div>
        </div>

        {/* Readiness radar — every axis derived from real state */}
        <div className="rounded-2xl border border-edge bg-card p-5">
          <div className="flex items-center gap-2 text-[13px] font-bold text-txt"><TrendingUp size={15} /> Optimization Radar</div>
          <p className="mt-1 text-[11px] text-txt3">How ready each area is — from your live settings, not a benchmark.</p>
          <div className="mt-3 flex flex-col gap-2.5">
            {radar.map((r) => (
              <div key={r.label}>
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="text-txt2">{r.label}</span>
                  <span className="font-semibold tabular-nums" style={{ color: r.pct >= 80 ? "#22c55e" : r.pct >= 50 ? "#f59e0b" : "#e3000e" }}>{r.pct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full transition-all" style={{ width: `${r.pct}%`, backgroundColor: r.pct >= 80 ? "#22c55e" : r.pct >= 50 ? "#f59e0b" : "#e3000e" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Frame pipeline — honest: real GPU frame time when a game runs, else prompts */}
      <div className="rounded-2xl border border-edge bg-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[13px] font-bold text-txt"><Server size={15} /> Frame Pipeline</div>
          <span className="text-[11px] text-txt3">
            {frameStats?.gpuBusyMs != null
              ? `GPU busy ${frameStats.gpuBusyMs.toFixed(1)} ms/frame · ${frameStats.avgFps.toFixed(0)} FPS`
              : "Live per-frame timing needs a running game"}
          </span>
        </div>
        <div className="mt-4 flex items-center gap-2 overflow-x-auto">
          {[
            { icon: Cpu, label: "CPU" },
            { icon: Sliders, label: "Scheduler" },
            { icon: MemoryStick, label: "GPU Queue" },
            { icon: Monitor, label: "Render" },
            { icon: Activity, label: "Display" },
          ].map((s, i, arr) => (
            <div key={s.label} className="flex items-center gap-2">
              <div className="grid h-14 w-[92px] shrink-0 place-items-center rounded-xl border border-edge bg-bg text-center">
                <s.icon size={16} style={{ color: vcolor }} />
                <span className="mt-1 text-[10.5px] font-semibold text-txt2">{s.label}</span>
              </div>
              {i < arr.length - 1 && <span className="text-txt3">→</span>}
            </div>
          ))}
        </div>
      </div>

      {/* VRAM bar + Smart recommendations */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-edge bg-card p-5">
          <div className="flex items-center gap-2 text-[13px] font-bold text-txt"><MemoryStick size={15} /> VRAM Usage</div>
          {vramUsed == null ? (
            <p className="mt-4 text-[13px] text-txt3">Not detected — your GPU driver isn't reporting live VRAM.</p>
          ) : (
            <>
              <div className="mt-3 flex items-end gap-1.5">
                <span className="text-[30px] font-black leading-none" style={{ color: vcolor }}>{(vramUsed / 1024).toFixed(1)}</span>
                <span className="mb-1 text-[13px] text-txt3">GB{vramTotalGb ? ` / ${vramTotalGb} GB` : " used"}</span>
              </div>
              {vramPct != null && (
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full" style={{ width: `${vramPct}%`, backgroundColor: vcolor }} />
                </div>
              )}
              <p className="mt-2 text-[11px] text-txt3">{vramTotalGb ? `${vramPct}% used · ${(vramTotalGb - vramUsed / 1024).toFixed(1)} GB free` : "Total VRAM not detected"}</p>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-edge bg-card p-5">
          <div className="flex items-center gap-2 text-[13px] font-bold text-txt"><Zap size={15} /> Smart Recommendations</div>
          {recs.length === 0 ? (
            <div className="mt-4 flex items-center gap-2 text-[13px] text-success"><CheckCircle2 size={15} /> Your GPU is fully optimized.</div>
          ) : (
            <>
              <div className="mt-3 flex flex-col gap-2">
                {recs.slice(0, 3).map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-edge bg-bg px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-semibold text-txt">{t.title}</p>
                      <p className="truncate text-[11px] text-txt3">{t.description}</p>
                    </div>
                    <button onClick={() => setConfirm([t])} className="shrink-0 rounded-btn border border-edge px-3 py-1 text-[11.5px] font-semibold text-txt2 hover:text-accent">Apply</button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setConfirm(recs)}
                className="glint mt-3 flex w-full items-center justify-center gap-2 rounded-btn bg-accent px-4 py-2.5 text-[13px] font-bold text-white hover:bg-accent-hi"
              >
                <Zap size={14} strokeWidth={2.5} fill="currentColor" /> Apply All ({recs.length})
              </button>
            </>
          )}
        </div>
      </div>

      <button onClick={() => onNavigate("tweaks")} className="flex w-fit items-center gap-1.5 text-[12px] font-medium text-txt2 hover:text-accent">
        <Sliders size={13} /> Fine-tune every GPU tweak in the Tweaks tab
      </button>

      {confirm && (
        <ApplyConfirmModal
          tweaks={confirm}
          title="Apply — GPU"
          onClose={() => setConfirm(null)}
          onApplied={() => void runScan()}
        />
      )}
    </div>
  );
}
