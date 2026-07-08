import { useState } from "react";
import { ArrowDown, ArrowUp, Gauge } from "lucide-react";
import { speedTestDownload, speedTestUpload } from "../lib/backend";
import { toast } from "../store/toastStore";

function speedBadge(mbps: number | null): { label: string; tone: string } {
  if (mbps == null) return { label: "—", tone: "text-txt3" };
  if (mbps >= 100) return { label: "FAST", tone: "text-success" };
  if (mbps >= 25) return { label: "GOOD", tone: "text-success" };
  if (mbps >= 5) return { label: "OK", tone: "text-warning" };
  return { label: "SLOW", tone: "text-accent" };
}

// Same chrome/typography as the Ping/Jitter StatCards, with a speed-appropriate
// icon disc instead of the (ping-oriented, inverted) ring.
function SpeedCard({
  icon: Icon,
  label,
  mbps,
  running,
  tone,
  sub,
}: {
  icon: typeof ArrowDown;
  label: string;
  mbps: number | null;
  running: boolean;
  tone: string;
  sub: string;
}) {
  const badge = speedBadge(mbps);
  return (
    <div className="flex items-center gap-4 rounded-card border border-edge bg-card p-4">
      <span className="grid h-[68px] w-[68px] shrink-0 place-items-center rounded-full border-2 border-edge">
        <Icon size={22} strokeWidth={1.75} className={running ? "animate-pulse text-txt2" : tone} />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-txt3">{label}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-txt">
            {running ? "…" : mbps != null ? mbps.toFixed(1) : "—"}
          </span>
          <span className="text-sm font-medium text-txt2">Mbps</span>
          <span className={`text-[10px] font-bold uppercase ${running ? "text-txt2" : badge.tone}`}>
            {running ? "TESTING" : badge.label}
          </span>
        </div>
        <p className="text-[11px] text-txt2">{sub}</p>
      </div>
    </div>
  );
}

/**
 * Bandwidth speed test. Runs a real download then upload transfer (Cloudflare)
 * and shows the result as two cards matching the Ping/Jitter stat cards.
 * Measurement only — nothing on the system changes.
 */
export default function SpeedTest() {
  const [down, setDown] = useState<number | null>(null);
  const [up, setUp] = useState<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "down" | "up">("idle");
  const [lastAt, setLastAt] = useState<number | null>(null);

  const run = async () => {
    setDown(null);
    setUp(null);
    setPhase("down");
    const d = await speedTestDownload();
    setDown(d);
    setPhase("up");
    const u = await speedTestUpload();
    setUp(u);
    setPhase("idle");
    setLastAt(Date.now());
    if (d != null || u != null) {
      toast.success(
        "Speed test complete",
        `Down ${d != null ? d.toFixed(0) : "—"} Mbps · Up ${u != null ? u.toFixed(0) : "—"} Mbps`,
      );
    }
  };

  const running = phase !== "idle";

  return (
    <div className="grid grid-cols-[minmax(200px,1fr)_1.3fr_1.3fr] gap-4">
      <button
        onClick={() => void run()}
        disabled={running}
        className="glint flex flex-col items-start justify-center gap-1 rounded-card bg-gradient-to-br from-accent to-[#a3000a] p-4 text-left shadow-[0_4px_20px_rgba(227,0,14,0.3)] transition-opacity hover:opacity-95 disabled:opacity-70"
      >
        <Gauge size={20} strokeWidth={2} className="text-white" />
        <span className="text-[14px] font-bold text-white">{running ? "Testing…" : "Run Speed Test"}</span>
        <span className="text-[10.5px] text-white/70">
          {running
            ? phase === "down"
              ? "Measuring download…"
              : "Measuring upload…"
            : lastAt
              ? `Last: ${new Date(lastAt).toLocaleTimeString()}`
              : "Download & upload · real transfer"}
        </span>
      </button>
      <SpeedCard icon={ArrowDown} label="Download" mbps={down} running={phase === "down"} tone="text-cpu" sub="Real HTTP transfer" />
      <SpeedCard icon={ArrowUp} label="Upload" mbps={up} running={phase === "up"} tone="text-success" sub="Real HTTP transfer" />
    </div>
  );
}
