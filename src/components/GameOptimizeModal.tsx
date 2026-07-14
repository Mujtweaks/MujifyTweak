import { useEffect, useMemo, useState } from "react";
import { Bookmark, History, MonitorCog, Sparkles, ThumbsDown, X, Zap } from "lucide-react";
import GameArt from "./GameArt";
import RiskBadge from "./RiskBadge";
import ApplyConfirmModal from "./ApplyConfirmModal";
import SettingsAdvisor from "./SettingsAdvisor";
import GameHistory from "./GameHistory";
import { getGameProfile, saveProfile, scanTweaks } from "../lib/backend";
import { useSystemStore } from "../store/systemStore";
import { useTweakStore } from "../store/tweakStore";
import type { GameInfo, GameProfileResult, TweakInfo } from "../lib/types";

const IMPACT_TONE: Record<string, string> = {
  high: "text-success",
  medium: "text-warning",
  low: "text-txt2",
};

/**
 * Per-game "Recommended tweaks" view. Opens from a Games-page card, lists what
 * the bundled database recommends (and why) for that specific game, and lets the
 * user Apply Recommended — which only pre-selects the tweaks and opens the
 * confirmation modal. Nothing is ever applied automatically.
 */
export default function GameOptimizeModal({ game, onClose }: { game: GameInfo; onClose: () => void }) {
  const scanResult = useTweakStore((s) => s.scanResult);
  const setScan = useTweakStore((s) => s.setScan);
  const hardware = useSystemStore((s) => s.hardware);

  const [profile, setProfile] = useState<GameProfileResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<TweakInfo[] | null>(null);
  const [autoApply, setAutoApply] = useState(false);

  useEffect(() => {
    void getGameProfile(game.name, game.installPath ?? null).then((p) => {
      setProfile(p);
      setLoading(false);
    });
    if (!scanResult) void scanTweaks(hardware?.isLaptop ?? null).then((r) => r && setScan(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.name]);

  const byId = useMemo(
    () => new Map((scanResult?.tweaks ?? []).map((t) => [t.id, t])),
    [scanResult],
  );

  // Resolve each recommended id to its live catalog TweakInfo (title/risk/state).
  const recommended = useMemo(
    () =>
      (profile?.recommended ?? [])
        .map((r) => ({ why: r.why, tweak: byId.get(r.id) }))
        .filter((x): x is { why: string; tweak: TweakInfo } => !!x.tweak),
    [profile, byId],
  );
  const avoid = useMemo(
    () =>
      (profile?.notRecommended ?? [])
        .map((r) => ({ why: r.why, tweak: byId.get(r.id) }))
        .filter((x): x is { why: string; tweak: TweakInfo } => !!x.tweak),
    [profile, byId],
  );

  const applyCount = recommended.filter(
    (x) => x.tweak.appliable && x.tweak.available && !x.tweak.applied,
  ).length;

  const saveAsProfile = async () => {
    await saveProfile({
      schemaVersion: 1,
      id: "",
      gameName: game.name,
      gameExe: game.exe || null,
      launcher: game.launcher ?? null,
      preset: "recommended",
      launchOptions: null,
      // Save the appliable recommended tweaks so auto-apply has something to run.
      enabledTweaks: recommended.filter((x) => x.tweak.appliable).map((x) => x.tweak.id),
      autoApply,
      createdAt: new Date().toISOString(),
      lastPlayed: null,
      avgFpsBefore: null,
      avgFpsAfter: null,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-card border border-edge bg-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-edge px-5 py-4">
          <GameArt name={game.name} appId={game.appId} path={game.installPath ?? game.exe} className="h-11 w-11" rounded="rounded-lg" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[16px] font-bold text-txt">{game.name}</h2>
            <p className="text-[11.5px] text-txt2">
              Recommended tweaks
              {profile && (
                <>
                  {" · "}
                  <span className={`font-semibold uppercase ${IMPACT_TONE[profile.impact] ?? "text-txt2"}`}>
                    {profile.impact} impact
                  </span>
                </>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-txt3 hover:text-txt">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="py-8 text-center text-[12.5px] text-txt3">Analyzing {game.name}…</p>
          ) : !profile ? (
            <p className="py-8 text-center text-[12.5px] text-txt3">Open in the desktop app to see recommendations.</p>
          ) : (
            <>
              {/* Why these tweaks — preset, or detected engine + live bottleneck, or safe generic */}
              <div className="mb-3 flex items-start gap-2 rounded-chip border border-accent/20 bg-accent/5 px-3 py-2.5">
                <Sparkles size={14} className="mt-0.5 shrink-0 text-accent" />
                <p className="text-[11.5px] leading-relaxed text-txt2">{profile.reason}</p>
              </div>
              <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-txt3">
                Recommended for {game.name}
              </p>
              <ul className="flex flex-col gap-1.5">
                {recommended.map(({ why, tweak }) => {
                  const scanOnly = !tweak.appliable || !tweak.available;
                  return (
                    <li key={tweak.id} className="flex items-start gap-2.5 rounded-chip border border-edge bg-card px-3 py-2.5">
                      <Zap size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-accent" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-[12.5px] font-semibold text-txt">{tweak.title}</p>
                          {tweak.applied && (
                            <span className="rounded bg-success/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-success">Active</span>
                          )}
                          {scanOnly && !tweak.applied && (
                            <span className="text-[9px] font-medium uppercase tracking-wide text-txt3">Scan-only</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] leading-snug text-txt2">{why}</p>
                      </div>
                      <RiskBadge level={tweak.risk} />
                    </li>
                  );
                })}
              </ul>

              {avoid.length > 0 && (
                <>
                  <p className="mb-2 mt-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-txt3">
                    <ThumbsDown size={13} /> Not recommended
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {avoid.map(({ why, tweak }) => (
                      <li key={tweak.id} className="flex items-start gap-2.5 rounded-chip border border-edge bg-bg px-3 py-2.5 opacity-80">
                        <ThumbsDown size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-txt3" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] font-semibold text-txt2">{tweak.title}</p>
                          <p className="mt-0.5 text-[11px] leading-snug text-txt3">{why}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {/* Game Settings Advisor — the real FPS engine (in-game graphics) */}
              <div className="mt-5 border-t border-edge pt-4">
                <p className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-txt3">
                  <MonitorCog size={13} /> Game Settings · The Real FPS Engine
                </p>
                <SettingsAdvisor game={game} onMeasure={onClose} />
              </div>

              {/* FPS history — the Detective's memory for this game */}
              <div className="mt-5 border-t border-edge pt-4">
                <p className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-txt3">
                  <History size={13} /> History · Your FPS Over Time
                </p>
                <GameHistory game={game.name} />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2.5 border-t border-edge px-5 py-4">
          <button
            type="button"
            onClick={() => setAutoApply((v) => !v)}
            className="flex items-center gap-2 text-left"
            title="Also needs the master switch in Settings → Auto-apply"
          >
            <span className={`relative h-[18px] w-[32px] shrink-0 rounded-full transition-colors ${autoApply ? "bg-accent" : "bg-edge2"}`}>
              <span className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all ${autoApply ? "left-[16px]" : "left-[2px]"}`} />
            </span>
            <span className="text-[11px] leading-tight text-txt2">
              Auto-apply on launch
              <span className="block text-[9.5px] text-txt3">needs the master switch in Settings</span>
            </span>
          </button>
          <div className="flex items-center gap-2.5">
          <button onClick={onClose} className="rounded-btn border border-edge bg-card px-4 py-2 text-[12.5px] font-medium text-txt2 hover:text-txt">
            Close
          </button>
          {profile && (
            <button
              onClick={() => void saveAsProfile()}
              className="flex items-center gap-2 rounded-btn border border-edge bg-card px-4 py-2 text-[12.5px] font-medium text-txt hover:border-edge2"
            >
              <Bookmark size={14} /> Save Profile
            </button>
          )}
          {profile && (
            <button
              onClick={() => setConfirm(recommended.map((x) => x.tweak))}
              disabled={applyCount === 0}
              className="flex items-center gap-2 rounded-btn bg-accent px-4 py-2 text-[12.5px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi disabled:opacity-60"
            >
              <Zap size={14} strokeWidth={2.25} fill="currentColor" />
              Apply Recommended{applyCount > 0 ? ` (${applyCount})` : ""}
            </button>
          )}
          </div>
        </div>
      </div>

      {confirm && (
        <ApplyConfirmModal
          tweaks={confirm}
          title={`Apply recommended — ${game.name}`}
          onClose={() => setConfirm(null)}
          onApplied={() => {
            setConfirm(null);
            void scanTweaks(hardware?.isLaptop ?? null).then((r) => r && setScan(r));
            onClose();
          }}
        />
      )}
    </div>
  );
}
