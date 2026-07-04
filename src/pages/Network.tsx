import { Activity, ArrowDown, ArrowUp, Globe, Wifi, Zap } from "lucide-react";
import { useSystemStore } from "../store/systemStore";
import Sparkline from "../components/Sparkline";

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: typeof Wifi;
  label: string;
  value: string;
  sub: string;
  color?: string;
}) {
  return (
    <div className="flex flex-1 items-center gap-3 rounded-2xl border border-edge bg-panel p-4">
      <span
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-edge bg-panel2"
        style={color ? { color } : undefined}
      >
        <Icon size={18} strokeWidth={1.75} className={color ? "" : "text-txt2"} />
      </span>
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-txt3">{label}</p>
        <p className="font-display text-[20px] font-bold text-txt">{value}</p>
        <p className="truncate text-[10.5px] text-txt2">{sub}</p>
      </div>
    </div>
  );
}

function quality(ping: number | null | undefined): { word: string; note: string } {
  if (ping == null) return { word: "Measuring…", note: "Pinging 1.1.1.1" };
  if (ping < 20) return { word: "Excellent", note: "Great for competitive play" };
  if (ping < 45) return { word: "Good", note: "Smooth online play" };
  if (ping < 90) return { word: "Fair", note: "Playable, some latency" };
  return { word: "High", note: "Latency may affect play" };
}

/** Live network monitor — real ICMP ping, jitter, loss and throughput. */
export default function Network() {
  const net = useSystemStore((s) => s.netStats);
  const q = quality(net?.pingMs);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-wide text-txt">Network</h1>
        <p className="mt-1 max-w-lg text-[12.5px] text-txt2">
          Live latency and throughput from real ICMP probes to 1.1.1.1 and your adapter counters —
          refreshed every ~1.5 seconds. Local QoS/latency tweaks live on the Tweaks tab.
        </p>
      </div>

      <div className="flex gap-4">
        <Stat
          icon={Wifi}
          label="Ping"
          value={net?.pingMs != null ? `${Math.round(net.pingMs)} ms` : "—"}
          sub={q.word}
          color="#e3000e"
        />
        <Stat
          icon={Activity}
          label="Jitter"
          value={net?.jitterMs != null ? `±${net.jitterMs.toFixed(1)} ms` : "—"}
          sub="Stability of latency"
        />
        <Stat
          icon={Zap}
          label="Packet Loss"
          value={net ? `${net.packetLossPercent.toFixed(0)}%` : "—"}
          sub="Over last 20 probes"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-edge bg-panel p-4">
          <div className="mb-3 flex items-center gap-2">
            <Globe size={15} strokeWidth={1.75} className="text-txt2" />
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-txt2">
              Connection Quality
            </p>
          </div>
          <div className="flex items-center gap-4 py-2">
            <div className="relative h-[72px] w-[72px]">
              <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
                <circle cx="36" cy="36" r="30" fill="none" stroke="#1c1c21" strokeWidth="6" />
                {net?.pingMs != null && (
                  <circle
                    cx="36"
                    cy="36"
                    r="30"
                    fill="none"
                    stroke="#e3000e"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${Math.max(0, 100 - Math.min(100, net.pingMs)) / 100 * 188.5} 188.5`}
                    style={{ filter: "drop-shadow(0 0 6px rgba(227,0,14,0.5))" }}
                  />
                )}
              </svg>
              <Wifi
                size={22}
                strokeWidth={1.75}
                className="absolute inset-0 m-auto text-accent"
              />
            </div>
            <div>
              <p className="text-[16px] font-bold text-accent">{q.word}</p>
              <p className="text-[11.5px] text-txt2">{q.note}</p>
              <div className="mt-1.5">
                <Sparkline value={net?.pingMs != null ? Math.min(100, net.pingMs) : null} width={140} />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-edge bg-panel p-4">
          <div className="mb-3 flex items-center gap-2">
            <Activity size={15} strokeWidth={1.75} className="text-txt2" />
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-txt2">Throughput</p>
          </div>
          <div className="flex flex-col gap-3 py-1">
            <div className="flex items-center gap-3">
              <ArrowDown size={16} strokeWidth={2} className="text-cpu" />
              <span className="w-20 text-[12px] text-txt2">Download</span>
              <span className="font-display text-[18px] font-bold text-txt">
                {net?.downMbps != null ? `${net.downMbps.toFixed(1)} Mbps` : "—"}
              </span>
              <div className="ml-auto">
                <Sparkline value={net?.downMbps != null ? Math.min(100, net.downMbps) : null} color="#3e8bff" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ArrowUp size={16} strokeWidth={2} className="text-gpu" />
              <span className="w-20 text-[12px] text-txt2">Upload</span>
              <span className="font-display text-[18px] font-bold text-txt">
                {net?.upMbps != null ? `${net.upMbps.toFixed(1)} Mbps` : "—"}
              </span>
              <div className="ml-auto">
                <Sparkline value={net?.upMbps != null ? Math.min(100, net.upMbps) : null} color="#2fd466" />
              </div>
            </div>
          </div>
          <p className="mt-3 border-t border-edge pt-2.5 text-[10.5px] text-txt3">
            Throughput is summed across active adapters. Spikes when you download or stream.
          </p>
        </div>
      </div>
    </div>
  );
}
