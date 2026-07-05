import { useEffect, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Copy,
  Globe,
  Layers,
  Network as NetworkIcon,
  Rocket,
  Router,
  Server,
  Shield,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { getNetworkInfo, scanTweaks } from "../lib/backend";
import { useSystemStore } from "../store/systemStore";
import { useTweakStore } from "../store/tweakStore";
import ApplyConfirmModal from "../components/ApplyConfirmModal";
import type { NetSample, NetworkInfo, TweakInfo } from "../lib/types";

const EMPTY: NetSample[] = Array.from({ length: 61 }, (_, t) => ({ t }));

function pingGrade(ping: number | null | undefined) {
  if (ping == null) return { label: "—", tone: "text-txt3" };
  if (ping < 20) return { label: "EXCELLENT", tone: "text-success" };
  if (ping < 45) return { label: "GOOD", tone: "text-success" };
  if (ping < 90) return { label: "FAIR", tone: "text-warning" };
  return { label: "HIGH", tone: "text-accent" };
}

function routeQuality(ping?: number | null, jitter?: number | null, loss?: number) {
  if (ping == null) return { grade: "—", tone: "text-txt3", note: "Measuring route…" };
  const l = loss ?? 0;
  const j = jitter ?? 0;
  if (ping < 25 && j < 5 && l === 0) return { grade: "A+", tone: "text-success", note: "Best path · no route issues" };
  if (ping < 50 && j < 10 && l < 1) return { grade: "A", tone: "text-success", note: "Strong, stable route" };
  if (ping < 90 && l < 3) return { grade: "B", tone: "text-warning", note: "Usable route, some latency" };
  return { grade: "C", tone: "text-accent", note: "High latency or loss" };
}

function fmtBytes(b: number): string {
  if (b < 1e6) return `${(b / 1e3).toFixed(0)} KB`;
  if (b < 1e9) return `${(b / 1e6).toFixed(1)} MB`;
  return `${(b / 1e9).toFixed(2)} GB`;
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function Ring({ icon: Icon, value }: { icon: LucideIcon; value: number | null }) {
  const frac = value == null ? 0 : Math.max(0, Math.min(100, 100 - Math.min(100, value))) / 100;
  const C = 2 * Math.PI * 26;
  return (
    <div className="relative h-[68px] w-[68px] shrink-0">
      <svg viewBox="0 0 68 68" className="h-full w-full -rotate-90">
        <circle cx="34" cy="34" r="26" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
        {value != null && (
          <circle cx="34" cy="34" r="26" fill="none" stroke="#e3000e" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${frac * C} ${C}`} style={{ filter: "drop-shadow(0 0 5px rgba(227,0,14,0.4))" }} />
        )}
      </svg>
      <Icon size={20} strokeWidth={1.75} className="absolute inset-0 m-auto text-accent" />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  badge,
  badgeTone,
  sub,
  ringValue,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  badge: string;
  badgeTone: string;
  sub: string;
  ringValue: number | null;
}) {
  return (
    <div className="flex items-center gap-4 rounded-card border border-edge bg-card p-4">
      <Ring icon={icon} value={ringValue} />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-txt3">{label}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-txt">{value}</span>
          <span className={`text-[10px] font-bold uppercase ${badgeTone}`}>{badge}</span>
        </div>
        <p className="text-[11px] text-txt2">{sub}</p>
      </div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value, copyable }: { icon: LucideIcon; label: string; value: string | null; copyable?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (value) {
      navigator.clipboard?.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  };
  return (
    <div className="flex items-center gap-3 border-b border-edge py-2.5 last:border-0">
      <Icon size={15} strokeWidth={1.5} className="shrink-0 text-txt3" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wide text-txt3">{label}</p>
        <p className="truncate text-[12.5px] text-txt">{value ?? "—"}</p>
      </div>
      {copyable && value && (
        <button onClick={copy} className="text-txt3 hover:text-txt">
          {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
        </button>
      )}
    </div>
  );
}

const NET_TWEAKS: { id: string; icon: LucideIcon; title: string; desc: string }[] = [
  { id: "tcp_optimize", icon: Layers, title: "TCP Optimizations", desc: "Congestion control and buffer settings tuned." },
  { id: "network_qos", icon: NetworkIcon, title: "QoS / Traffic Priority", desc: "Game traffic prioritized for lower latency." },
  { id: "disable_nagle", icon: Activity, title: "Background Traffic", desc: "Non-essential bandwidth minimized." },
  { id: "flush_dns", icon: Globe, title: "DNS Optimization", desc: "Faster DNS resolution for game servers." },
];

export default function Network() {
  const net = useSystemStore((s) => s.netStats);
  const netHistory = useSystemStore((s) => s.netHistory);
  const downPeak = useSystemStore((s) => s.downPeakMbps);
  const upPeak = useSystemStore((s) => s.upPeakMbps);
  const bestPing = useSystemStore((s) => s.bestPingMs);
  const worstPing = useSystemStore((s) => s.worstPingMs);
  const totalBytes = useSystemStore((s) => s.totalBytes);
  const sessionStart = useSystemStore((s) => s.netSessionStart);
  const hardware = useSystemStore((s) => s.hardware);
  const scanResult = useTweakStore((s) => s.scanResult);
  const setScan = useTweakStore((s) => s.setScan);

  const [info, setInfo] = useState<NetworkInfo | null>(null);
  const [now, setNow] = useState(Date.now());
  const [confirmTweaks, setConfirmTweaks] = useState<TweakInfo[] | null>(null);

  useEffect(() => {
    void getNetworkInfo().then(setInfo);
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const grade = pingGrade(net?.pingMs);
  const route = routeQuality(net?.pingMs, net?.jitterMs, net?.packetLossPercent);
  const hasData = netHistory.length > 0;
  const chartData = hasData ? netHistory : EMPTY;

  const optimizeNetwork = async () => {
    const r = scanResult ?? (await scanTweaks(hardware?.isLaptop ?? null));
    if (!r) return;
    if (!scanResult) setScan(r);
    setConfirmTweaks(r.tweaks.filter((t) => t.category === "network-optimization"));
  };

  const isApplied = (id: string) => scanResult?.tweaks.find((t) => t.id === id)?.applied ?? false;
  const appliedCount = NET_TWEAKS.filter((t) => isApplied(t.id)).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-txt">Network</h1>
            <span className="rounded-pill bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-accent">Live Monitoring</span>
          </div>
          <p className="mt-1 text-[12.5px] text-txt2">Real-time network performance for the lowest possible latency.</p>
          <p className="text-[11px] text-txt3">— Data refreshes every ~1.5 seconds.</p>
        </div>
        <div className="flex gap-2.5">
          <button onClick={() => void getNetworkInfo().then(setInfo)} className="flex items-center gap-2 rounded-btn border border-edge bg-card px-3.5 py-2 text-left hover:border-edge2">
            <Activity size={16} strokeWidth={1.75} className="text-txt2" />
            <span>
              <span className="block text-[12.5px] font-medium text-txt">Run Latency Test</span>
              <span className="block text-[10px] text-txt3">Test your connection</span>
            </span>
          </button>
          <button onClick={optimizeNetwork} className="flex items-center gap-2 rounded-btn bg-accent px-3.5 py-2 text-left shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi">
            <Rocket size={16} strokeWidth={1.75} className="text-white" />
            <span>
              <span className="block text-[12.5px] font-semibold text-white">Optimize Network</span>
              <span className="block text-[10px] text-white/70">Apply best settings</span>
            </span>
          </button>
        </div>
      </div>

      {/* 4 stat cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={Wifi} label="Ping" value={net?.pingMs != null ? `${Math.round(net.pingMs)} ms` : "—"} badge={grade.label} badgeTone={grade.tone} sub="to 1.1.1.1 · Cloudflare" ringValue={net?.pingMs ?? null} />
        <StatCard icon={Activity} label="Jitter" value={net?.jitterMs != null ? `±${net.jitterMs.toFixed(1)} ms` : "—"} badge={net?.jitterMs != null && net.jitterMs < 5 ? "STABLE" : net?.jitterMs != null ? "VARIABLE" : "—"} badgeTone={net?.jitterMs != null && net.jitterMs < 5 ? "text-success" : "text-warning"} sub="Stability" ringValue={net?.jitterMs != null ? net.jitterMs * 4 : null} />
        <StatCard icon={Zap} label="Packet Loss" value={net ? `${net.packetLossPercent.toFixed(1)} %` : "—"} badge={net && net.packetLossPercent === 0 ? "EXCELLENT" : net ? "DETECTED" : "—"} badgeTone={net && net.packetLossPercent === 0 ? "text-success" : "text-accent"} sub="Over last 20 probes" ringValue={net ? net.packetLossPercent : null} />
        <StatCard icon={Shield} label="Route Quality" value={route.grade} badge={route.grade === "A+" || route.grade === "A" ? "OPTIMAL" : "—"} badgeTone={route.tone} sub={route.note} ringValue={net?.pingMs ?? null} />
      </div>

      {/* Graph + details + throughput */}
      <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-4">
        {/* Latency graph */}
        <div className="rounded-card border border-edge bg-card p-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-txt3"><Activity size={13} /> Real-Time Latency</p>
            <div className="flex gap-3 text-[10px] text-txt2">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent" />Ping</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-cpu" />Jitter</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success" />Loss</span>
            </div>
          </div>
          <div className="relative h-[190px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="t" type="number" domain={[0, 60]} ticks={[0, 15, 30, 45, 60]} tickFormatter={(t: number) => (t === 60 ? "Now" : `${60 - t}s`)} tick={{ fill: "#444", fontSize: 10 }} axisLine={{ stroke: "rgba(255,255,255,0.06)" }} tickLine={false} />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: "#444", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Line type="monotone" dataKey="ping" stroke="#e3000e" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="jitter" stroke="#4a9eff" strokeWidth={1.3} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="loss" stroke="#22c55e" strokeWidth={1.3} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
            {!hasData && <div className="pointer-events-none absolute inset-0 grid place-items-center"><p className="text-[11px] uppercase tracking-[0.2em] text-txt3">Collecting…</p></div>}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 border-t border-edge pt-3">
            {[
              { l: "Best", v: bestPing != null ? `${Math.round(bestPing)} ms` : "—", tone: "text-success" },
              { l: "Average", v: net?.pingMs != null ? `${Math.round(net.pingMs)} ms` : "—", tone: "text-txt" },
              { l: "Worst", v: worstPing != null ? `${Math.round(worstPing)} ms` : "—", tone: "text-accent" },
              { l: "Uptime", v: sessionStart ? fmtDuration(now - sessionStart) : "—", tone: "text-txt" },
            ].map((x) => (
              <div key={x.l} className="text-center">
                <p className="text-[9.5px] uppercase tracking-wide text-txt3">{x.l}</p>
                <p className={`text-[13px] font-bold ${x.tone}`}>{x.v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Connection details */}
        <div className="rounded-card border border-edge bg-card p-5">
          <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-txt3"><Router size={13} /> Connection Details</p>
          <DetailRow icon={NetworkIcon} label="Adapter" value={info?.adapterName ?? null} />
          <DetailRow icon={Server} label="IP Address" value={info?.ipAddress ?? null} copyable />
          <DetailRow icon={Router} label="Gateway" value={info?.gateway ?? null} copyable />
          <DetailRow icon={Globe} label="DNS Server" value={info?.dnsServer ?? null} copyable />
          <DetailRow icon={Wifi} label="Connection Type" value={info?.connectionType ?? null} />
        </div>

        {/* Throughput */}
        <div className="rounded-card border border-edge bg-card p-5">
          <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-txt3"><Activity size={13} /> Throughput Monitor</p>
          <div className="flex items-center gap-2">
            <ArrowDown size={16} strokeWidth={2} className="text-cpu" />
            <span className="text-[10px] uppercase tracking-wide text-txt3">Download</span>
          </div>
          <p className="text-2xl font-bold text-txt">{net?.downMbps != null ? `${net.downMbps.toFixed(1)}` : "—"}<span className="ml-1 text-sm font-medium text-txt2">Mbps</span></p>
          <p className="text-[10px] text-txt3">Peak: {downPeak != null ? `${downPeak.toFixed(1)} Mbps` : "—"}</p>
          <div className="mt-3 flex items-center gap-2">
            <ArrowUp size={16} strokeWidth={2} className="text-success" />
            <span className="text-[10px] uppercase tracking-wide text-txt3">Upload</span>
          </div>
          <p className="text-2xl font-bold text-txt">{net?.upMbps != null ? `${net.upMbps.toFixed(1)}` : "—"}<span className="ml-1 text-sm font-medium text-txt2">Mbps</span></p>
          <p className="text-[10px] text-txt3">Peak: {upPeak != null ? `${upPeak.toFixed(1)} Mbps` : "—"}</p>
          <div className="mt-3 flex justify-between border-t border-edge pt-2.5 text-[11px]">
            <div><p className="text-txt3">Total Data</p><p className="font-semibold text-txt">{fmtBytes(totalBytes)}</p></div>
            <div className="text-right"><p className="text-txt3">Session</p><p className="font-semibold text-txt">{sessionStart ? fmtDuration(now - sessionStart) : "—"}</p></div>
          </div>
        </div>
      </div>

      {/* Optimization status */}
      <div className="rounded-card border border-edge bg-card p-5">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-txt3">Network Optimization Status</p>
        <div className="grid grid-cols-5 gap-3">
          {NET_TWEAKS.map((t) => {
            const applied = isApplied(t.id);
            const Icon = t.icon;
            return (
              <div key={t.id} className="rounded-chip border border-edge bg-bg p-3">
                <Icon size={16} strokeWidth={1.75} className="text-accent" />
                <p className="mt-2 text-[12px] font-semibold text-txt">{t.title}</p>
                <p className="mt-0.5 text-[10.5px] leading-snug text-txt2">{t.desc}</p>
                <p className={`mt-2 text-[9.5px] font-bold uppercase tracking-wide ${applied ? "text-success" : "text-txt3"}`}>
                  {applied ? "Active" : "Not applied"}
                </p>
              </div>
            );
          })}
          <div className="rounded-chip border border-edge bg-bg p-3">
            <p className="text-[10px] uppercase tracking-wide text-txt3">Optimization Level</p>
            <p className={`mt-1 text-lg font-bold ${appliedCount >= 3 ? "text-accent" : "text-txt2"}`}>
              {appliedCount === 0 ? "NONE" : appliedCount >= 3 ? "MAXIMUM" : "PARTIAL"}
            </p>
            <div className="mt-1.5 flex gap-1">
              {NET_TWEAKS.map((t, i) => (
                <span key={i} className={`h-1 flex-1 rounded ${isApplied(t.id) ? "bg-accent" : "bg-edge2"}`} />
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-txt3">{appliedCount} of {NET_TWEAKS.length} active</p>
          </div>
        </div>
        <button onClick={optimizeNetwork} className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-accent hover:text-accent-hi">
          Review network tweaks <ChevronRight size={14} />
        </button>
      </div>

      {confirmTweaks && (
        <ApplyConfirmModal
          tweaks={confirmTweaks}
          title="Optimize network"
          onClose={() => setConfirmTweaks(null)}
          onApplied={() => void scanTweaks(hardware?.isLaptop ?? null).then((r) => r && setScan(r))}
        />
      )}
    </div>
  );
}
