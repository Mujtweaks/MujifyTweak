import { useEffect, useState } from "react";
import { RefreshCw, Signal, Trophy } from "lucide-react";
import { pingGameServers } from "../lib/backend";
import type { GameServersResult } from "../lib/types";

// Color conventions: green <60ms, yellow 60-120ms, red >120ms, grey = no reply.
function pingTone(ms: number | null): string {
  if (ms == null) return "text-txt3";
  if (ms < 60) return "text-success";
  if (ms <= 120) return "text-warning";
  return "text-accent";
}
function pingDot(ms: number | null): string {
  if (ms == null) return "bg-txt3";
  if (ms < 60) return "bg-success";
  if (ms <= 120) return "bg-warning";
  return "bg-accent";
}

/**
 * Game Server Ping Tester — real-time ICMP latency to each game's regions, so
 * the user can see which region is fastest. Read-only: measures, applies nothing.
 */
export default function ServerPing() {
  const [games, setGames] = useState<GameServersResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastTested, setLastTested] = useState<number | null>(null);

  const run = async () => {
    setLoading(true);
    const r = await pingGameServers();
    if (r.length > 0) setGames(r);
    setLastTested(Date.now());
    setLoading(false);
  };

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lowest-latency (non-null) region per game gets the "Best" badge.
  const bestRegionOf = (g: GameServersResult): string | null => {
    let best: { region: string; ms: number } | null = null;
    for (const r of g.regions) {
      if (r.pingMs != null && (best === null || r.pingMs < best.ms)) {
        best = { region: r.region, ms: r.pingMs };
      }
    }
    return best?.region ?? null;
  };

  return (
    <div className="rounded-card border border-edge bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-txt3">
            <Signal size={13} /> Game Server Ping Tester
          </p>
          <p className="mt-1 text-[11px] text-txt2">
            Live latency to each region — find your fastest server.
            {lastTested && (
              <span className="text-txt3"> Last tested {new Date(lastTested).toLocaleTimeString()}.</span>
            )}
          </p>
        </div>
        <button
          onClick={() => void run()}
          disabled={loading}
          className="flex shrink-0 items-center gap-2 rounded-btn border border-edge bg-bg px-3.5 py-2 text-[12px] font-medium text-txt transition-colors hover:border-edge2 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {loading ? "Testing…" : "Refresh"}
        </button>
      </div>

      {games.length === 0 && loading ? (
        <p className="py-8 text-center text-[12px] text-txt3">Pinging game servers…</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
          {games.map((g) => {
            const best = bestRegionOf(g);
            return (
              <div key={g.id} className="rounded-chip border border-edge bg-bg p-4">
                <p className="mb-2.5 text-[13px] font-bold text-txt">{g.name}</p>
                <div className="flex flex-col">
                  {g.regions.map((r) => (
                    <div key={r.region} className="flex items-center gap-2 border-b border-edge py-1.5 last:border-0">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${pingDot(r.pingMs)}`} />
                      <span className="min-w-0 flex-1 truncate text-[11.5px] text-txt2" title={r.host}>{r.region}</span>
                      {best === r.region && r.pingMs != null && (
                        <span className="flex items-center gap-0.5 rounded bg-success/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-success">
                          <Trophy size={9} /> Best
                        </span>
                      )}
                      <span className={`w-[52px] shrink-0 text-right text-[12px] font-semibold tabular-nums ${pingTone(r.pingMs)}`}>
                        {r.pingMs != null ? `${r.pingMs} ms` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-[10px] leading-snug text-txt3">
        Games that block ICMP are measured via a stable reference node in the same datacenter city;
        Minecraft entries ping the real public servers. Every value is a genuine round-trip time —
        unreachable hosts show “—”, never a fabricated number.
      </p>
    </div>
  );
}
