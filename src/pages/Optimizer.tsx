import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BrainCircuit, Cpu, MemoryStick, Monitor, Zap, type LucideIcon } from "lucide-react";
import { scanTweaks } from "../lib/backend";
import { useSystemStore } from "../store/systemStore";
import { useTweakStore } from "../store/tweakStore";
import { PRESET_RISK } from "../lib/categories";
import TweakCard from "../components/TweakCard";
import ApplyConfirmModal from "../components/ApplyConfirmModal";
import { usePendingStore, useShakeSignal } from "../store/pendingStore";
import type { TweakInfo } from "../lib/types";
import type { PageId } from "../lib/nav";

// A hardware-component group = a curated set of tweak ids for that part of the
// PC. GPU pulls in the vendor tweaks that match the detected card. The NPU group
// is honest: the NPU doesn't affect FPS, so it only quiets background Windows AI.
interface HwGroup {
  id: string;
  label: string;
  subtitle: string;
  icon: LucideIcon;
  color: string;
  ids: string[];
}

function hardwareGroups(gpuVendor: string | undefined): HwGroup[] {
  const vendor = (gpuVendor ?? "").toLowerCase();
  const vendorGpu =
    vendor === "nvidia"
      ? ["nvidia_max_performance", "nvidia_disable_telemetry"]
      : vendor === "amd"
        ? ["amd_disable_ulps"]
        : [];
  return [
    {
      id: "cpu",
      label: "CPU",
      subtitle: "Keep every core awake and prioritise your game.",
      icon: Cpu,
      color: "#f97316",
      ids: ["disable_core_parking", "disable_power_throttling", "win32_priority", "power_high_perf", "power_ultimate", "mmcss_gaming", "large_system_cache"],
    },
    {
      id: "gpu",
      label: "GPU",
      subtitle: "Low latency, no capture overhead, no down-clocking.",
      icon: Monitor,
      color: "#a855f7",
      ids: ["hags", "disable_fso", "disable_game_bar", "disable_gamedvr", "gpu_priority", ...vendorGpu],
    },
    {
      id: "ram",
      label: "RAM",
      subtitle: "Free memory back to the game, cut background caching.",
      icon: MemoryStick,
      color: "#6366f1",
      ids: ["disable_memory_compression", "disable_sysmain"],
    },
    {
      id: "npu",
      label: "NPU / Windows AI",
      subtitle: "The NPU doesn't affect FPS — this just quiets background AI.",
      icon: BrainCircuit,
      color: "#14b8a6",
      ids: ["disable_recall", "disable_copilot"],
    },
  ];
}

export default function Optimizer({ onNavigate: _onNavigate }: { onNavigate: (page: PageId) => void }) {
  const scanResult = useTweakStore((s) => s.scanResult);
  const setScan = useTweakStore((s) => s.setScan);
  const hardware = useSystemStore((s) => s.hardware);
  const [openGroup, setOpenGroup] = useState<HwGroup | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<TweakInfo[] | null>(null);

  const runScan = async () => {
    const r = await scanTweaks(hardware?.isLaptop ?? null);
    if (r) setScan(r);
  };
  useEffect(() => {
    if (!scanResult) void runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Publish the selected-but-not-applied count so tab navigation can warn before
  // it's lost, and shake the pending-changes bar when that happens.
  const shake = useShakeSignal();
  useEffect(() => {
    usePendingStore.getState().setCount(selected.size);
  }, [selected]);
  useEffect(() => () => usePendingStore.getState().setCount(0), []);

  const tweaks = scanResult?.tweaks ?? [];
  const byId = useMemo(() => new Map(tweaks.map((t) => [t.id, t])), [tweaks]);
  const groups = useMemo(() => hardwareGroups(hardware?.gpuVendor), [hardware?.gpuVendor]);
  const groupRows = (g: HwGroup) => g.ids.map((id) => byId.get(id)).filter((t): t is TweakInfo => !!t);

  const toggleSelect = (t: TweakInfo) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(t.id) ? n.delete(t.id) : n.add(t.id);
      return n;
    });

  // One-click "Optimize {component}" — selects the safe, appliable, not-applied
  // members and opens the confirm modal. Never applies directly.
  const optimizeGroup = (g: HwGroup) => {
    const allowed = PRESET_RISK["balanced"];
    const picks = groupRows(g).filter((t) => t.appliable && t.available && !t.applied && allowed.includes(t.risk));
    if (picks.length) setConfirm(picks);
  };

  // ---- Sub-page: a hardware group's tweaks ----
  if (openGroup) {
    const rows = groupRows(openGroup);
    const sel = rows.filter((t) => selected.has(t.id));
    return (
      <div className="flex flex-col gap-5 pb-20">
        <button onClick={() => setOpenGroup(null)} className="flex w-fit items-center gap-2 text-[13px] font-medium text-txt2 hover:text-txt">
          <ArrowLeft size={16} /> All components
        </button>
        <div className="flex items-center gap-3">
          <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ backgroundColor: `${openGroup.color}20` }}>
            <openGroup.icon size={26} style={{ color: openGroup.color }} />
          </span>
          <div>
            <h1 className="text-[32px] font-black uppercase leading-none tracking-tight text-txt">{openGroup.label}</h1>
            <p className="mt-1 text-[13px] text-txt2">{openGroup.subtitle}</p>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-txt3">Scanning…</p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {rows.map((t, i) => (
              <div key={t.id} className="stagger-item" style={{ animationDelay: `${50 + i * 40}ms` }}>
                <TweakCard tweak={t} selected={selected.has(t.id)} onToggle={toggleSelect} />
              </div>
            ))}
          </div>
        )}
        {sel.length > 0 && (
          <div className={`fixed bottom-[64px] left-[64px] right-0 z-20 flex items-center justify-between border-t border-edge bg-panel/95 px-6 py-3 backdrop-blur ${shake ? "shake" : ""}`}>
            <span className="text-[12.5px] text-txt2">{sel.length} selected in {openGroup.label}</span>
            <button onClick={() => setConfirm(sel)} className="glint flex items-center gap-2 rounded-btn bg-accent px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi">
              <Zap size={14} strokeWidth={2.5} fill="currentColor" /> Apply {sel.length}
            </button>
          </div>
        )}
        {confirm && <ApplyConfirmModal tweaks={confirm} title={`Apply — ${openGroup.label}`} onClose={() => setConfirm(null)} onApplied={() => { setSelected(new Set()); runScan(); }} />}
      </div>
    );
  }

  // ---- Landing: hardware components (full categorized list lives in the Tweaks tab) ----
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[42px] font-black uppercase leading-none tracking-tight text-txt">Optimizer</h1>
        <p className="mt-1.5 text-[14px] text-txt2">Tune each part of your PC — every tweak free, confirmed, and reversible.</p>
      </div>

      {/* By hardware component */}
      <div>
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-txt2">By hardware</h2>
        <div className="grid grid-cols-4 gap-4">
          {groups.map((g, i) => {
            const rows = groupRows(g);
            const applied = rows.filter((t) => t.applied).length;
            const spec =
              g.id === "cpu" ? hardware?.cpuName : g.id === "gpu" ? hardware?.gpuName : g.id === "ram" ? (hardware ? `${hardware.ramTotalGb.toFixed(0)}GB${hardware.ramType ? ` ${hardware.ramType}` : ""}` : null) : g.id === "npu" ? (hardware?.npuName ?? "No NPU detected") : null;
            return (
              <div
                key={g.id}
                style={{ animationDelay: `${50 + i * 40}ms` }}
                className="stagger-item flex flex-col rounded-2xl border border-edge bg-card p-5"
              >
                <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ backgroundColor: `${g.color}20` }}>
                  <g.icon size={26} style={{ color: g.color }} />
                </span>
                <p className="mt-4 text-[17px] font-bold text-txt">{g.label}</p>
                <p className="mt-0.5 truncate text-[11.5px] text-txt3" title={spec ?? undefined}>{spec ?? "—"}</p>
                <p className="mt-2 flex-1 text-[12px] leading-snug text-txt2">{g.subtitle}</p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => optimizeGroup(g)}
                    className="glint flex flex-1 items-center justify-center gap-1.5 rounded-btn bg-accent px-3 py-2 text-[12px] font-bold text-white hover:bg-accent-hi"
                  >
                    <Zap size={13} strokeWidth={2.5} fill="currentColor" /> Optimize
                  </button>
                  <button onClick={() => { setSelected(new Set()); setOpenGroup(g); }} className="rounded-btn border border-edge bg-bg px-3 py-2 text-[12px] font-medium text-txt2 hover:text-txt" title="See all tweaks">
                    {rows.length}
                  </button>
                </div>
                {applied > 0 && <p className="mt-2 text-[10.5px] text-success">{applied} active</p>}
              </div>
            );
          })}
        </div>
      </div>

      {confirm && <ApplyConfirmModal tweaks={confirm} title="Apply optimizations" onClose={() => setConfirm(null)} onApplied={() => { setSelected(new Set()); runScan(); }} />}
    </div>
  );
}
