import { useEffect, useMemo, useState } from "react";
import { Monitor, Thermometer, Activity, MemoryStick, Zap } from "lucide-react";
import { scanTweaks } from "../lib/backend";
import { useSystemStore } from "../store/systemStore";
import { useTweakStore } from "../store/tweakStore";
import TweakCard from "../components/TweakCard";
import ApplyConfirmModal from "../components/ApplyConfirmModal";
import type { TweakInfo } from "../lib/types";

// Live GPU dashboard: real load/temp/VRAM from the monitor (no fake clocks — the
// sidecar doesn't expose them, so we don't invent them) plus every GPU tweak in
// one place so you can actually act, not just watch numbers.

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

export default function Gpu() {
  const stats = useSystemStore((s) => s.stats);
  const hw = useSystemStore((s) => s.hardware);
  const scanResult = useTweakStore((s) => s.scanResult);
  const setScan = useTweakStore((s) => s.setScan);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<TweakInfo[] | null>(null);

  const runScan = async () => {
    const r = await scanTweaks(hw?.isLaptop ?? null);
    if (r) setScan(r);
  };
  useEffect(() => {
    if (!scanResult) void runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gpuTweaks = useMemo(
    () => (scanResult?.tweaks ?? []).filter((t) => t.category === "graphics"),
    [scanResult],
  );
  const toggle = (t: TweakInfo) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(t.id) ? n.delete(t.id) : n.add(t.id);
      return n;
    });
  const sel = gpuTweaks.filter((t) => selected.has(t.id));
  const vcolor = vendorColor(hw?.gpuVendor);
  const temp = stats?.gpuTempC ?? null;
  const load = stats?.gpuUsagePercent ?? null;
  const vram = stats?.gpuVramUsedMb ?? null;

  return (
    <div className="flex flex-col gap-5 pb-20">
      <div className="flex items-center gap-3">
        <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ backgroundColor: `${vcolor}22` }}>
          <Monitor size={26} style={{ color: vcolor }} />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-[32px] font-black uppercase leading-none tracking-tight text-txt">{hw?.gpuName ?? "GPU"}</h1>
          <p className="mt-1 text-[13px] text-txt2">
            {hw?.gpuVendor ?? "Graphics"}{hw?.gpuDriverVersion ? ` · Driver ${hw.gpuDriverVersion}` : ""}
          </p>
        </div>
      </div>

      {/* Live GPU stats (real) */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={Thermometer} label="Temperature" value={temp == null ? "—" : temp.toFixed(0)} unit={temp == null ? undefined : "°C"} tone={tempTone(temp)} sub={temp == null ? "Needs the hardware-monitor sidecar" : "Live"} />
        <StatCard icon={Activity} label="Load" value={load == null ? "—" : load.toFixed(0)} unit={load == null ? undefined : "%"} tone={vcolor} sub={load == null ? "—" : "Render-engine utilization"} />
        <StatCard icon={MemoryStick} label="VRAM used" value={vram == null ? "—" : (vram / 1024).toFixed(1)} unit={vram == null ? undefined : "GB"} tone={vcolor} sub={vram == null ? "—" : "Dedicated GPU memory in use"} />
      </div>

      {/* GPU optimizations — actionable, unlike a read-only clock readout */}
      <div>
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-txt2">GPU optimizations</h2>
        {gpuTweaks.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-txt3">Scanning…</p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {gpuTweaks.map((t, i) => (
              <div key={t.id} className="stagger-item" style={{ animationDelay: `${40 + i * 35}ms` }}>
                <TweakCard tweak={t} selected={selected.has(t.id)} onToggle={toggle} />
              </div>
            ))}
          </div>
        )}
      </div>

      {sel.length > 0 && (
        <div className="fixed bottom-[64px] left-[64px] right-0 z-20 flex items-center justify-between border-t border-edge bg-panel/95 px-6 py-3 backdrop-blur">
          <span className="text-[12.5px] text-txt2">{sel.length} GPU tweak{sel.length === 1 ? "" : "s"} selected</span>
          <button onClick={() => setConfirm(sel)} className="glint flex items-center gap-2 rounded-btn bg-accent px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi">
            <Zap size={14} strokeWidth={2.5} fill="currentColor" /> Apply {sel.length}
          </button>
        </div>
      )}

      {confirm && (
        <ApplyConfirmModal
          tweaks={confirm}
          title="Apply — GPU"
          onClose={() => setConfirm(null)}
          onApplied={() => {
            setSelected(new Set());
            void runScan();
          }}
        />
      )}
    </div>
  );
}
