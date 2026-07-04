import { useMemo, useState } from "react";
import {
  BatteryLow,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Gauge,
  Rocket,
  RotateCcw,
  Scale,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useTweakStore } from "../store/tweakStore";
import { useSystemStore } from "../store/systemStore";
import { scanTweaks } from "../lib/backend";
import { CATEGORY_META, CATEGORY_ORDER, PRESET_RISK } from "../lib/categories";
import type { TweakInfo } from "../lib/types";

const PRESETS: {
  id: string;
  title: string;
  desc: string;
  icon: LucideIcon;
}[] = [
  {
    id: "ultimate",
    title: "Ultimate Performance",
    desc: "Maximum FPS and responsiveness. Best for high-end setups.",
    icon: Gauge,
  },
  {
    id: "balanced",
    title: "Balanced",
    desc: "Balanced performance and stability for all-round use.",
    icon: Scale,
  },
  {
    id: "power_saving",
    title: "Power Saving",
    desc: "Reduce power usage and heat. Best for laptops.",
    icon: BatteryLow,
  },
];

const STEPS: { n: number; title: string; desc: string; icon: LucideIcon }[] = [
  { n: 1, title: "SCAN SYSTEM", desc: "We'll check your system for issues and opportunities.", icon: Search },
  { n: 2, title: "APPLY TWEAKS", desc: "Safe tweaks will be applied based on your preset.", icon: SlidersHorizontal },
  { n: 3, title: "OPTIMIZE", desc: "System settings and services will be optimized.", icon: Rocket },
  { n: 4, title: "FINALIZE", desc: "Changes are verified and tested for stability.", icon: ShieldCheck },
];

function timeAgo(ts: number | null): string {
  if (!ts) return "Never";
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

function StatCell({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex flex-1 items-center gap-2.5 px-3 py-0.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-accent/25 bg-accent/10">
        <Icon size={14} strokeWidth={2} className="text-accent" />
      </span>
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-txt3">{label}</p>
        <p className="text-[13px] font-semibold text-txt">{value}</p>
      </div>
    </div>
  );
}

export default function Optimizer() {
  const scanResult = useTweakStore((s) => s.scanResult);
  const lastScanAt = useTweakStore((s) => s.lastScanAt);
  const setScan = useTweakStore((s) => s.setScan);
  const selected = useTweakStore((s) => s.selected);
  const setSelected = useTweakStore((s) => s.setSelected);
  const hardware = useSystemStore((s) => s.hardware);

  const [preset, setPreset] = useState("ultimate");
  const [scanning, setScanning] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const total = scanResult?.total ?? 0;
  const applied = scanResult?.applied ?? 0;
  const potentialCount = total - applied;

  const runScan = async () => {
    setScanning(true);
    setNotice(null);
    const result = await scanTweaks(hardware?.isLaptop ?? null);
    if (result) {
      setScan(result);
      // Auto-select everything the chosen preset is willing to enable.
      applyPresetSelection(preset, result.tweaks);
    } else {
      setNotice("Scan needs the desktop app (backend not reachable in browser preview).");
    }
    setScanning(false);
  };

  const applyPresetSelection = (presetId: string, tweaks: TweakInfo[]) => {
    const allowed = PRESET_RISK[presetId] ?? [];
    const next = new Set(
      tweaks
        .filter((t) => t.available && !t.applied && allowed.includes(t.risk))
        .map((t) => t.id),
    );
    setSelected(next);
  };

  const choosePreset = (id: string) => {
    setPreset(id);
    if (scanResult) applyPresetSelection(id, scanResult.tweaks);
  };

  const countByCategory = useMemo(() => {
    const map = new Map<string, number>();
    scanResult?.categories.forEach((c) => map.set(c.category, c.available - c.applied));
    return map;
  }, [scanResult]);

  const gatedNotice = () =>
    setNotice(
      "Scanning is fully live. Applying tweaks is intentionally gated — the apply engine (Checkpoint 8b) isn't enabled, so nothing is changed on your PC.",
    );

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Left */}
      <section className="col-span-7 flex flex-col gap-4">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border border-edge bg-panel p-5">
          <div className="flex items-center gap-5">
            <div className="relative grid h-[120px] w-[120px] shrink-0 place-items-center">
              <div className="absolute inset-0 rounded-full border-2 border-accent/25" />
              <div className="absolute inset-2 rounded-full border border-accent/40 shadow-[0_0_30px_rgba(227,0,14,0.35)_inset]" />
              <Rocket size={40} strokeWidth={1.5} className="text-accent" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="font-display text-3xl font-bold tracking-wide text-txt">Optimizer</h1>
                <span className="rounded-md bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
                  {applied > 0 ? `${applied} applied` : "Ready"}
                </span>
              </div>
              <p className="mt-2 max-w-md text-[13px] leading-relaxed text-txt2">
                One-click per-game optimization with a full plain-English change log. Scanning is
                live now; applying stays gated until you enable it — nothing runs on your PC by
                surprise.
              </p>
            </div>
          </div>
        </div>

        {/* Stat row */}
        <div className="flex divide-x divide-edge rounded-2xl border border-edge bg-panel py-3">
          <StatCell icon={Clock} label="Last Scan" value={timeAgo(lastScanAt)} />
          <StatCell icon={SlidersHorizontal} label="Available Tweaks" value={`${potentialCount}`} />
          <StatCell
            icon={TrendingUp}
            label="Potential Boost"
            value={potentialCount > 12 ? "High" : potentialCount > 4 ? "Medium" : scanResult ? "Low" : "—"}
          />
          <StatCell icon={Clock} label="Estimated Time" value="2–4 min" />
        </div>

        {/* Preset */}
        <div className="rounded-2xl border border-edge bg-panel p-4">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-txt2">
            Optimization Preset
          </p>
          <div className="grid grid-cols-3 gap-3">
            {PRESETS.map(({ id, title, desc, icon: Icon }) => {
              const active = preset === id;
              return (
                <button
                  key={id}
                  onClick={() => choosePreset(id)}
                  className={`relative rounded-xl border p-3.5 text-left transition-colors ${
                    active
                      ? "border-accent/60 bg-accent/10 shadow-[0_0_20px_rgba(227,0,14,0.18)]"
                      : "border-edge bg-panel2 hover:border-edge2"
                  }`}
                >
                  <span
                    className={`absolute right-3 top-3 grid h-4 w-4 place-items-center rounded-full border ${
                      active ? "border-accent bg-accent" : "border-edge2"
                    }`}
                  >
                    {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                  <Icon size={20} strokeWidth={1.75} className={active ? "text-accent" : "text-txt2"} />
                  <p className="mt-2 text-[13px] font-semibold text-txt">{title}</p>
                  <p className="mt-1 text-[11px] leading-snug text-txt2">{desc}</p>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setAdvancedOpen((v) => !v)}
            className="mt-3 flex w-full items-center gap-2 rounded-xl border border-edge bg-panel2 px-3.5 py-2.5 text-[12.5px] font-medium text-txt transition-colors hover:border-edge2"
          >
            <Settings2Icon />
            Advanced Settings
            <ChevronDown
              size={15}
              strokeWidth={2}
              className={`ml-auto text-txt3 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
            />
          </button>
          {advancedOpen && (
            <p className="mt-2 rounded-lg border border-edge bg-panel2 px-3 py-2 text-[11.5px] leading-snug text-txt2">
              Per-tweak toggles with risk labels live on the Tweaks tab. Advanced kernel tweaks
              (timer resolution, BCD, affinity) arrive in v2.0 — all opt-in, all reversible.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="rounded-2xl border border-edge bg-panel p-4">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-txt2">
            Optimization Action
          </p>
          <div className="grid grid-cols-4 gap-3">
            {STEPS.map(({ n, title, desc, icon: Icon }) => (
              <div key={n} className="rounded-xl border border-edge bg-panel2 p-3">
                <div className="flex items-center gap-1.5">
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-accent/15 text-[9px] font-bold text-accent">
                    {n}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-txt">
                    {title}
                  </span>
                </div>
                <p className="mt-2 text-[10.5px] leading-snug text-txt2">{desc}</p>
                <Icon size={18} strokeWidth={1.75} className="mt-3 text-accent" />
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-[1.6fr_1fr_1fr] gap-3">
            <button
              onClick={runScan}
              disabled={scanning}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-accent to-[#a3000a] py-3 text-[13px] font-semibold text-white shadow-[0_0_22px_rgba(227,0,14,0.3)] transition-transform active:scale-[0.99] disabled:opacity-70"
            >
              <Zap size={15} strokeWidth={2.25} fill="currentColor" />
              {scanning ? "Scanning…" : scanResult ? "Re-Scan System" : "Start Optimization"}
            </button>
            <button
              onClick={gatedNotice}
              className="flex items-center justify-center gap-2 rounded-xl border border-edge bg-panel2 py-3 text-[12.5px] font-medium text-txt transition-colors hover:border-edge2"
            >
              <FileText size={14} strokeWidth={2} className="text-txt2" />
              Preview Changes
            </button>
            <button
              onClick={gatedNotice}
              className="flex items-center justify-center gap-2 rounded-xl border border-edge bg-panel2 py-3 text-[12.5px] font-medium text-txt transition-colors hover:border-edge2"
            >
              <RotateCcw size={14} strokeWidth={2} className="text-txt2" />
              Revert All
            </button>
          </div>
          {notice && (
            <p className="mt-3 rounded-lg border border-accent/25 bg-accent/5 px-3 py-2 text-[11.5px] leading-snug text-txt2">
              {notice}
            </p>
          )}
        </div>
      </section>

      {/* Right */}
      <section className="col-span-5 flex flex-col gap-4">
        <div className="rounded-2xl border border-edge bg-panel p-4">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-txt2">Categories</p>
          <div className="flex flex-col gap-2">
            {CATEGORY_ORDER.map((cat) => {
              const meta = CATEGORY_META[cat];
              const Icon = meta.icon;
              const count = countByCategory.get(cat) ?? 0;
              return (
                <button
                  key={cat}
                  className="flex items-center gap-3 rounded-xl border border-edge bg-panel2 px-3.5 py-3 text-left transition-colors hover:border-edge2"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-edge bg-panel">
                    <Icon size={16} strokeWidth={1.75} className="text-txt2" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold text-txt">{meta.label}</p>
                    <p className="truncate text-[10.5px] text-txt2">{meta.subtitle}</p>
                  </div>
                  <span className="text-[11px] font-medium text-txt2">
                    {scanResult ? `${count} tweaks` : "—"}
                  </span>
                  <ChevronRight size={15} strokeWidth={2} className="text-txt3" />
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-edge pt-3">
            <span className="text-[11.5px] text-txt2">
              {selected.size}/{total} tweaks selected
            </span>
            <button
              onClick={() => {
                if (!scanResult) return;
                const all = new Set(
                  scanResult.tweaks.filter((t) => t.available && !t.applied).map((t) => t.id),
                );
                setSelected(selected.size >= all.size ? new Set() : all);
              }}
              className="text-[11.5px] font-semibold text-accent transition-colors hover:text-accent-hi"
            >
              {selected.size > 0 ? "Clear" : "Select All"}
            </button>
          </div>
        </div>

        <div className="flex min-h-[220px] flex-1 flex-col rounded-2xl border border-edge bg-panel p-4">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-txt2">
            Applied Tweaks Preview
          </p>
          {applied === 0 ? (
            <div className="grid flex-1 place-items-center">
              <div className="text-center">
                <FileText size={26} strokeWidth={1.5} className="mx-auto text-txt3" />
                <p className="mt-2 text-[13px] font-semibold text-txt">No tweaks applied yet</p>
                <p className="mt-1 text-[11.5px] text-txt2">
                  {scanResult ? "Nothing applied on this system yet." : "Run a scan to see what can be improved."}
                </p>
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {scanResult?.tweaks
                .filter((t) => t.applied)
                .map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2.5 rounded-lg border border-edge bg-panel2 px-3 py-2"
                  >
                    <ShieldCheck size={14} strokeWidth={2} className="text-good" />
                    <span className="flex-1 text-[12px] text-txt">{t.title}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-good">
                      Active
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Settings2Icon() {
  return <SlidersHorizontal size={14} strokeWidth={2} className="text-txt2" />;
}
