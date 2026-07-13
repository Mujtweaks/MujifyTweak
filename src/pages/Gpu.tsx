import { useEffect, useMemo, useState } from "react";
import { Activity, MemoryStick, Monitor, Sliders, Thermometer, Zap } from "lucide-react";
import { scanTweaks } from "../lib/backend";
import { useSystemStore } from "../store/systemStore";
import { useTweakStore } from "../store/tweakStore";
import ApplyConfirmModal from "../components/ApplyConfirmModal";
import type { TweakInfo } from "../lib/types";
import type { PageId } from "../lib/nav";

// A focused "tune your GPU" page: live GPU state + one-click General/vendor
// optimize. Individual toggles live in the Tweaks tab — this is not a copy of it.

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
  return (
    <div className="flex flex-col rounded-2xl border border-edge bg-card p-5">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-txt3">
        <Icon size={14} /> {label}
      </div>
      <div className="mt-3 flex items-end gap-1">
        <span className="text-[34px] font-black leading-none" style={{ color: tone }}>{value}</span>
        {unit && <span className="mb-1 text-[14px] font-semibold text-txt3">{unit}</span>}
      </div>
      {sub && <p className="mt-1 text-[11px] text-txt3">{sub}</p>}
    </div>
  );
}

export default function Gpu({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const stats = useSystemStore((s) => s.stats);
  const hw = useSystemStore((s) => s.hardware);
  const scanResult = useTweakStore((s) => s.scanResult);
  const setScan = useTweakStore((s) => s.setScan);
  const [confirm, setConfirm] = useState<TweakInfo[] | null>(null);

  const runScan = async () => {
    const r = await scanTweaks(hw?.isLaptop ?? null);
    if (r) setScan(r);
  };
  useEffect(() => {
    if (!scanResult) void runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byId = useMemo(() => new Map((scanResult?.tweaks ?? []).map((t) => [t.id, t])), [scanResult]);
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((t): t is TweakInfo => !!t);
  const actionable = (ids: string[]) => pick(ids).filter((t) => t.appliable && t.available && !t.applied && t.risk !== "advanced");

  const vcolor = vendorColor(hw?.gpuVendor);
  const v = (hw?.gpuVendor ?? "").toLowerCase();
  const generalIds = ["hags", "disable_fso", "disable_game_bar", "disable_gamedvr", "gpu_priority"];
  const vendorIds = v.includes("nvidia")
    ? ["nvidia_max_performance", "nvidia_disable_telemetry"]
    : v.includes("amd")
      ? ["amd_disable_ulps"]
      : [];
  const vendorName = v.includes("nvidia") ? "NVIDIA" : v.includes("amd") ? "AMD" : v.includes("intel") ? "Intel" : "";

  const genRows = pick(generalIds);
  const genActive = genRows.filter((t) => t.applied).length;
  const genTodo = actionable(generalIds);
  const venRows = pick(vendorIds);
  const venActive = venRows.filter((t) => t.applied).length;
  const venTodo = actionable(vendorIds);

  const temp = stats?.gpuTempC ?? null;
  const load = stats?.gpuUsagePercent ?? null;
  const vram = stats?.gpuVramUsedMb ?? null;

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ backgroundColor: `${vcolor}22` }}>
          <Monitor size={26} style={{ color: vcolor }} />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-[32px] font-black uppercase leading-none tracking-tight text-txt">{hw?.gpuName ?? "GPU"}</h1>
          <p className="mt-1 text-[13px] text-txt2">{hw?.gpuVendor ?? "Graphics"}{hw?.gpuDriverVersion ? ` · Driver ${hw.gpuDriverVersion}` : ""}</p>
        </div>
      </div>

      {/* Live GPU stats (real) */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={Thermometer} label="Temperature" value={temp == null ? "—" : temp.toFixed(0)} unit={temp == null ? undefined : "°C"} tone={tempTone(temp)} sub={temp == null ? "Needs the hardware-monitor sidecar" : "Live"} />
        <StatCard icon={Activity} label="Load" value={load == null ? "—" : load.toFixed(0)} unit={load == null ? undefined : "%"} tone={vcolor} sub={load == null ? "—" : "Render-engine utilization"} />
        <StatCard icon={MemoryStick} label="VRAM used" value={vram == null ? "—" : (vram / 1024).toFixed(1)} unit={vram == null ? undefined : "GB"} tone={vcolor} sub={vram == null ? "—" : "Dedicated GPU memory in use"} />
      </div>

      {/* How it works (honest, brief) */}
      <div className="rounded-2xl border border-edge bg-card p-5">
        <h2 className="text-[14px] font-bold text-txt">How GPU tuning works</h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-txt2">
          What you feel in-game is frame <span className="text-txt">latency and pacing</span>, not just peak FPS. These tweaks steady the path a frame takes through Windows, the driver and your GPU — hardware-accelerated scheduling, no capture/DVR overhead, exclusive fullscreen, and a higher GPU scheduling priority. Every one is applied through the same confirmed, fully-reversible pipeline as the rest of the app. No overclocking, nothing that touches anti-cheat.
        </p>
      </div>

      {/* Optimize cards — the actionable part */}
      <div className={`grid gap-4 ${vendorIds.length ? "grid-cols-2" : "grid-cols-1"}`}>
        <div className="flex flex-col rounded-2xl border border-edge bg-card p-5">
          <p className="text-[15px] font-bold text-txt">General GPU Optimize</p>
          <p className="mt-1 flex-1 text-[12px] leading-snug text-txt2">Vendor-neutral graphics baseline — scheduling, low-latency fullscreen, no capture overhead, higher GPU priority.</p>
          <p className="mt-2 text-[11px] text-txt3">{genActive} of {genRows.length} active</p>
          <button
            onClick={() => genTodo.length && setConfirm(genTodo)}
            disabled={genTodo.length === 0}
            className="glint mt-3 flex items-center justify-center gap-2 rounded-btn bg-accent px-4 py-2.5 text-[13px] font-bold text-white hover:bg-accent-hi disabled:opacity-50"
          >
            <Zap size={14} strokeWidth={2.5} fill="currentColor" /> {genTodo.length === 0 ? "All applied" : `Optimize (${genTodo.length})`}
          </button>
        </div>

        {vendorIds.length > 0 && (
          <div className="flex flex-col rounded-2xl border border-edge bg-card p-5">
            <p className="text-[15px] font-bold text-txt" style={{ color: vcolor }}>{vendorName} Optimize</p>
            <p className="mt-1 flex-1 text-[12px] leading-snug text-txt2">Tuned for your {vendorName} card — holds high clocks instead of down-clocking mid-game{v.includes("nvidia") ? " and disables NVIDIA telemetry" : ""}.</p>
            <p className="mt-2 text-[11px] text-txt3">{venActive} of {venRows.length} active</p>
            <button
              onClick={() => venTodo.length && setConfirm(venTodo)}
              disabled={venTodo.length === 0}
              className="mt-3 flex items-center justify-center gap-2 rounded-btn px-4 py-2.5 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: vcolor }}
            >
              <Zap size={14} strokeWidth={2.5} fill="currentColor" /> {venTodo.length === 0 ? "All applied" : `Optimize (${venTodo.length})`}
            </button>
          </div>
        )}
      </div>

      <button onClick={() => onNavigate("tweaks")} className="flex w-fit items-center gap-1.5 text-[12px] font-medium text-txt2 hover:text-accent">
        <Sliders size={13} /> Fine-tune individual GPU tweaks in the Tweaks tab
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
