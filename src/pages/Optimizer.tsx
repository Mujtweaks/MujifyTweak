import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowLeft, Cpu, MemoryStick, Monitor, Shield, Trash2, Zap, type LucideIcon } from "lucide-react";
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
      ids: ["disable_core_parking", "disable_power_throttling", "win32_priority", "power_ultimate", "mmcss_gaming", "large_system_cache"],
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
  ];
}

export default function Optimizer({ onNavigate: _onNavigate }: { onNavigate: (page: PageId) => void }) {
  const scanResult = useTweakStore((s) => s.scanResult);
  const setScan = useTweakStore((s) => s.setScan);
  const hardware = useSystemStore((s) => s.hardware);
  const [openGroup, setOpenGroup] = useState<HwGroup | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<TweakInfo[] | null>(null);
  // How hard to push. "balanced" = safe + moderate (the sensible default);
  // "ultimate" also includes advanced-risk tweaks for maximum effect. Every
  // tweak is still confirmed, warned, and reversible — this only changes which
  // risk tiers the one-click actions are ALLOWED to include. The old Optimizer
  // was hardcoded to balanced, so advanced tweaks could never be applied here.
  const [level, setLevel] = useState<"balanced" | "ultimate">("balanced");

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
  const optimizeGroup = (g: HwGroup) => optimizeIds(groupRows(g).map((t) => t.id));
  const optimizeIds = (ids: string[]) => {
    const allowed = PRESET_RISK[level];
    const picks = ids
      .map((id) => byId.get(id))
      .filter((t): t is TweakInfo => !!t)
      .filter((t) => t.appliable && t.available && !t.applied && allowed.includes(t.risk));
    if (picks.length) setConfirm(picks);
  };

  // Everything actionable at the current level, across the WHOLE catalog — the
  // single "make my PC as fast as it safely can be" button.
  const everythingActionable = useMemo(() => {
    const allowed = PRESET_RISK[level];
    return tweaks.filter((t) => t.appliable && t.available && !t.applied && allowed.includes(t.risk));
  }, [tweaks, level]);
  const optimizeEverything = () => {
    if (everythingActionable.length) setConfirm(everythingActionable);
  };

  // Live counts across the whole catalog (real, from the scan).
  const appliedCount = tweaks.filter((t) => t.applied).length;
  const availableCount = tweaks.filter((t) => t.appliable && t.available && !t.applied).length;
  const categoryCount = scanResult?.categories.length ?? 0;

  // One-click goal presets — each a curated set of real, reversible tweak ids.
  // "howMany" counts how many are still actionable so the card can show progress.
  const GOALS: { id: string; label: string; desc: string; icon: LucideIcon; color: string; ids: string[] }[] = [
    { id: "fps", label: "Competitive FPS", desc: "Max frames & steady pacing for shooters.", icon: Zap, color: "#e3000e",
      ids: ["disable_fso", "disable_gamedvr", "disable_game_bar", "hags", "gpu_priority", "mmcss_gaming", "win32_priority", "disable_core_parking", "disable_power_throttling", "power_ultimate", "network_throttling_index", "disable_nagle"] },
    { id: "latency", label: "Lowest Latency", desc: "Cut input lag & network delay.", icon: Activity, color: "#f59e0b",
      ids: ["disable_nagle", "tcp_ack_frequency", "network_qos", "tcp_optimize", "disable_mpo", "mouse_accel_off", "usb_selective_suspend_off"] },
    { id: "privacy", label: "Privacy Lockdown", desc: "Kill telemetry, ads & tracking.", icon: Shield, color: "#22c55e",
      ids: ["disable_telemetry", "disable_ad_id", "disable_activity_history", "disable_location", "disable_feedback", "disable_wer", "disable_recall", "disable_wpbt"] },
    { id: "debloat", label: "Debloat & Clean", desc: "Remove suggested apps & background bloat.", icon: Trash2, color: "#6366f1",
      ids: ["disable_consumer_features", "disable_content_delivery", "disable_background_apps", "disable_widgets", "disable_storage_sense", "disable_tips", "disable_bing_search"] },
  ];
  const goalActionable = (ids: string[]) =>
    ids.map((id) => byId.get(id)).filter((t): t is TweakInfo => !!t).filter((t) => t.appliable && t.available && !t.applied).length;

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

      {/* Aggressiveness + Optimize Everything — the big one-click. */}
      <div className="rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/[0.08] to-transparent p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-accent">One click · everything</p>
            <h2 className="mt-1 text-[22px] font-black leading-tight text-txt">Optimize your whole PC</h2>
            <p className="mt-1 max-w-[52ch] text-[12.5px] leading-snug text-txt2">
              Applies every recommended tweak for your hardware at once — all listed before they run,
              all logged, all reversible from the Change Log.
            </p>
          </div>

          {/* Level selector */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-txt3">How hard</span>
            <div className="flex rounded-btn border border-edge bg-bg p-1">
              <button
                onClick={() => setLevel("balanced")}
                className={`rounded-[6px] px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${level === "balanced" ? "bg-card text-txt shadow" : "text-txt3 hover:text-txt2"}`}
              >
                Balanced
              </button>
              <button
                onClick={() => setLevel("ultimate")}
                className={`rounded-[6px] px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${level === "ultimate" ? "bg-accent text-white shadow" : "text-txt3 hover:text-txt2"}`}
              >
                Maximum
              </button>
            </div>
          </div>
        </div>

        {level === "ultimate" && (
          <p className="mt-3 flex items-start gap-2 rounded-chip border border-warning/30 bg-warning/10 px-3 py-2 text-[11.5px] leading-snug text-warning">
            <Shield size={13} className="mt-0.5 shrink-0" />
            Maximum includes advanced tweaks with the biggest impact — and the most caution. Each one
            still shows its warning in the confirmation, and everything stays reversible. Recommended
            for a plugged-in desktop; on a laptop, watch your temperatures.
          </p>
        )}

        <button
          onClick={optimizeEverything}
          disabled={everythingActionable.length === 0}
          className="glint mt-4 flex w-full items-center justify-center gap-2 rounded-btn bg-accent px-4 py-3 text-[14px] font-bold text-white shadow-[0_4px_24px_rgba(227,0,14,0.35)] hover:bg-accent-hi disabled:opacity-50"
        >
          <Zap size={16} strokeWidth={2.5} fill="currentColor" />
          {everythingActionable.length === 0
            ? "Everything's already optimized"
            : `Optimize Everything (${everythingActionable.length})`}
        </button>
      </div>

      {/* Live optimization summary (real counts from the scan) */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-edge bg-card p-5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-txt3">Optimizations active</p>
          <p className="mt-2 text-[30px] font-black leading-none text-success">{appliedCount}</p>
        </div>
        <div className="rounded-2xl border border-edge bg-card p-5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-txt3">Ready to apply</p>
          <p className="mt-2 text-[30px] font-black leading-none text-accent">{availableCount}</p>
        </div>
        <div className="rounded-2xl border border-edge bg-card p-5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-txt3">Categories</p>
          <p className="mt-2 text-[30px] font-black leading-none text-txt">{categoryCount}</p>
        </div>
      </div>

      {/* One-click goals */}
      <div>
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-txt2">By goal — one click</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {GOALS.map((g) => {
            const todo = goalActionable(g.ids);
            return (
              <div key={g.id} className="flex flex-col rounded-2xl border border-edge bg-card p-5">
                <span className="grid h-12 w-12 place-items-center rounded-2xl" style={{ backgroundColor: `${g.color}20` }}>
                  <g.icon size={22} style={{ color: g.color }} />
                </span>
                <p className="mt-3 text-[15px] font-bold text-txt">{g.label}</p>
                <p className="mt-0.5 flex-1 text-[11.5px] leading-snug text-txt2">{g.desc}</p>
                <button
                  onClick={() => optimizeIds(g.ids)}
                  disabled={todo === 0}
                  className="glint mt-3 flex items-center justify-center gap-1.5 rounded-btn bg-accent px-3 py-2 text-[12px] font-bold text-white hover:bg-accent-hi disabled:opacity-50"
                >
                  <Zap size={13} strokeWidth={2.5} fill="currentColor" /> {todo === 0 ? "All applied" : `Apply (${todo})`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* By hardware component */}
      <div>
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-txt2">By hardware</h2>
        <div className="grid grid-cols-3 gap-4">
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
