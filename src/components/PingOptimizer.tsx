import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, Signal, Trophy, X, Zap } from "lucide-react";
import GameArt from "./GameArt";
import ApplyConfirmModal from "./ApplyConfirmModal";
import { getGameCatalog, pingGameServers, scanTweaks } from "../lib/backend";
import { useSystemStore } from "../store/systemStore";
import { useTweakStore } from "../store/tweakStore";
import type { GameCatalogEntry, GameServersResult, TweakInfo } from "../lib/types";

// green <60ms, yellow 60-120ms, red >120ms, grey = no reply.
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
 * Ping Optimizer — pick a game, see live latency to every server region, and
 * optimize your connection toward the fastest one. "Optimize" applies the real,
 * reversible network tweaks through the confirm gate (nothing auto-applies), and
 * honestly points you at the best region to select in-game (no fake server-switch).
 */
export default function PingOptimizer({ onClose }: { onClose: () => void }) {
  const scanResult = useTweakStore((s) => s.scanResult);
  const setScan = useTweakStore((s) => s.setScan);
  const hardware = useSystemStore((s) => s.hardware);

  const [catalog, setCatalog] = useState<GameCatalogEntry[]>([]);
  const [selected, setSelected] = useState<GameCatalogEntry | null>(null);
  const [result, setResult] = useState<GameServersResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<TweakInfo[] | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    void getGameCatalog().then(setCatalog);
    if (!scanResult) void scanTweaks(hardware?.isLaptop ?? null).then((r) => r && setScan(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickGame = async (g: GameCatalogEntry) => {
    setSelected(g);
    setResult(null);
    setSuccess(null);
    setLoading(true);
    const r = await pingGameServers(g.id);
    setResult(r[0] ?? null);
    setLoading(false);
  };

  const best = useMemo(() => {
    if (!result) return null;
    let b: { region: string; ms: number } | null = null;
    for (const rg of result.regions) {
      if (rg.pingMs != null && (b === null || rg.pingMs < b.ms)) b = { region: rg.region, ms: rg.pingMs };
    }
    return b;
  }, [result]);

  // The real, reversible latency tweaks the "Optimize" button applies.
  const networkTweaks = useMemo(
    () => (scanResult?.tweaks ?? []).filter((t) => t.category === "network" && t.appliable),
    [scanResult],
  );
  const actionableCount = networkTweaks.filter((t) => t.available && !t.applied).length;

  const back = () => {
    setSelected(null);
    setResult(null);
    setSuccess(null);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-card border border-edge bg-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-edge px-5 py-4">
          {selected ? (
            <button onClick={back} className="text-txt2 transition-colors hover:text-txt">
              <ChevronLeft size={18} />
            </button>
          ) : (
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/10">
              <Signal size={16} className="text-accent" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-bold text-txt">{selected ? selected.name : "Ping Optimizer"}</h2>
            <p className="text-[11px] text-txt2">
              {selected ? "Live latency to each server region" : "Pick a game to find your fastest server"}
            </p>
          </div>
          <button onClick={onClose} className="text-txt3 transition-colors hover:text-txt">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {!selected ? (
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-4">
              {catalog.map((g) => (
                <button key={g.id} onClick={() => void pickGame(g)} className="group flex flex-col items-center gap-2">
                  <div className="aspect-[3/4] w-full overflow-hidden rounded-xl border border-edge transition-colors group-hover:border-accent/50">
                    <GameArt name={g.name} appId={g.appId} className="h-full w-full" rounded="rounded-xl" />
                  </div>
                  <span className="w-full truncate text-center text-[11.5px] text-txt2 transition-colors group-hover:text-txt">
                    {g.name}
                  </span>
                </button>
              ))}
              {catalog.length === 0 && (
                <p className="col-span-full py-8 text-center text-[12px] text-txt3">Loading games…</p>
              )}
            </div>
          ) : loading ? (
            <p className="py-10 text-center text-[12.5px] text-txt3">Pinging {selected.name} servers…</p>
          ) : result && result.regions.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {result.regions.map((rg) => {
                const isBest = best?.region === rg.region && rg.pingMs != null;
                return (
                  <div
                    key={rg.region}
                    className={`flex items-center gap-3 rounded-chip border px-3.5 py-2.5 ${isBest ? "border-success/40 bg-success/5" : "border-edge bg-card"}`}
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${pingDot(rg.pingMs)}`} />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-txt" title={rg.host}>{rg.region}</span>
                    {isBest && (
                      <span className="flex items-center gap-1 rounded bg-success/15 px-2 py-0.5 text-[9px] font-bold uppercase text-success">
                        <Trophy size={9} /> Best for you
                      </span>
                    )}
                    <span className={`w-[54px] shrink-0 text-right text-[13px] font-bold tabular-nums ${pingTone(rg.pingMs)}`}>
                      {rg.pingMs != null ? `${rg.pingMs} ms` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-10 text-center text-[12.5px] text-txt3">Couldn't reach those servers. Try again in a moment.</p>
          )}
        </div>

        {/* Footer — only in the per-game detail view */}
        {selected && !loading && (
          <div className="flex items-center justify-between gap-3 border-t border-edge px-5 py-4">
            <p className="min-w-0 flex-1 text-[10.5px] leading-snug text-txt3">
              Applies real, reversible network tweaks (Nagle off, QoS, DNS) to cut latency. For the server
              itself, select {best?.region ?? "the best region"} in {selected.name}'s in-game settings.
            </p>
            <button
              onClick={() => setConfirm(networkTweaks)}
              disabled={!best || actionableCount === 0}
              className="glint flex shrink-0 items-center gap-2 rounded-btn bg-accent px-4 py-2.5 text-[12.5px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi disabled:opacity-50"
            >
              <Zap size={14} strokeWidth={2.25} fill="currentColor" />
              {actionableCount === 0 ? "Already Optimized" : "Optimize for Best Server"}
            </button>
          </div>
        )}
      </div>

      {/* Success celebration */}
      {success && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-6" onClick={() => setSuccess(null)}>
          <div className="max-w-sm text-center">
            <span className="success-pop mx-auto grid h-20 w-20 place-items-center rounded-full bg-success/15 shadow-[0_0_44px_rgba(34,197,94,0.4)]">
              <CheckCircle2 size={44} strokeWidth={1.75} className="text-success" />
            </span>
            <div style={{ animation: "pageFadeIn 0.4s ease-out both", animationDelay: "0.22s" }}>
              <h3 className="mt-4 text-xl font-bold text-txt">Optimized for {success}</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-txt2">
                Your connection is tuned for the lowest latency. For the fastest server, select{" "}
                <span className="font-semibold text-txt">{success}</span> in {selected?.name}'s in-game server settings.
              </p>
              <button onClick={() => setSuccess(null)} className="mt-4 rounded-btn bg-accent px-5 py-2 text-[12.5px] font-semibold text-white hover:bg-accent-hi">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <ApplyConfirmModal
          tweaks={confirm}
          title={`Optimize connection — ${selected?.name ?? ""}`}
          onClose={() => setConfirm(null)}
          onApplied={(outcome) => {
            setConfirm(null);
            if (outcome.applied.length > 0 && best) setSuccess(best.region);
            void scanTweaks(hardware?.isLaptop ?? null).then((r) => r && setScan(r));
          }}
        />
      )}
    </div>
  );
}
