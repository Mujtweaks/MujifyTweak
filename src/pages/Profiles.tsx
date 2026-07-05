import { useEffect, useMemo, useState } from "react";
import { Gamepad2, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { deleteProfile, fetchInstalledGames, listProfiles, saveProfile } from "../lib/backend";
import { useGameStore } from "../store/gameStore";
import GameArt from "../components/GameArt";
import type { GameInfo, Profile } from "../lib/types";

const PRESET_LABEL: Record<string, string> = {
  ultimate: "Ultimate Performance",
  balanced: "Balanced",
  power_saving: "Power Saving",
  competitive: "Competitive",
};

function StatCard({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className="flex flex-1 items-start gap-3 rounded-card border border-edge bg-card p-4">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-btn ${accent ? "bg-accent/10" : "bg-bg"}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[9.5px] font-semibold uppercase tracking-wide text-txt3">{label}</p>
        <p className="truncate text-[15px] font-bold text-txt">{value}</p>
        <p className="truncate text-[10.5px] text-txt2">{sub}</p>
      </div>
    </div>
  );
}

export default function Profiles() {
  const setInstalledGames = useGameStore((s) => s.setInstalledGames);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [detected, setDetected] = useState<GameInfo[]>([]);
  const [artById, setArtById] = useState<Record<string, string | null>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const reload = async () => {
    const [ps, games] = await Promise.all([listProfiles(), fetchInstalledGames()]);
    setProfiles(ps);
    setInstalledGames(games);
    const named = new Set(ps.map((p) => p.gameName.toLowerCase()));
    setDetected(games.filter((g) => !named.has(g.name.toLowerCase())));
    // Map profile name → appid (from detected games) for art.
    const art: Record<string, string | null> = {};
    for (const p of ps) {
      const g = games.find((x) => x.name.toLowerCase() === p.gameName.toLowerCase());
      art[p.id] = g?.appId ?? null;
    }
    setArtById(art);
    if (!selectedId && ps.length > 0) setSelectedId(ps[0].id);
    setBusy(false);
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = profiles.find((p) => p.id === selectedId) ?? null;
  const totalTweaks = useMemo(() => profiles.reduce((s, p) => s + p.enabledTweaks.length, 0), [profiles]);

  const createProfile = async (game?: GameInfo) => {
    const profile: Profile = {
      schemaVersion: 1,
      id: "",
      gameName: game?.name ?? `New Profile ${profiles.length + 1}`,
      gameExe: game?.exe ?? null,
      launcher: game?.launcher ?? null,
      preset: "balanced",
      launchOptions: null,
      enabledTweaks: [],
      createdAt: new Date().toISOString(),
      lastPlayed: null,
      avgFpsBefore: null,
      avgFpsAfter: null,
    };
    const saved = await saveProfile(profile);
    if (saved) {
      await reload();
      setSelectedId(saved.id);
    }
  };

  const removeProfile = async (id: string) => {
    await deleteProfile(id);
    setSelectedId(null);
    await reload();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-txt">Profiles</h1>
          <p className="mt-1 text-[12.5px] text-txt2">Per-game optimization profiles — auto-detected from your library, saved locally.</p>
        </div>
        <button onClick={() => createProfile()} className="flex items-center gap-2 rounded-btn bg-accent px-3.5 py-2 text-[12px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi">
          <Plus size={14} strokeWidth={2.5} /> Create New Profile
        </button>
      </div>

      <div className="flex gap-4">
        <StatCard icon={<Gamepad2 size={18} strokeWidth={1.75} className="text-accent" />} label="Active Profile" value={selected ? selected.gameName : "None selected"} sub={selected ? PRESET_LABEL[selected.preset] ?? selected.preset : "Select a profile"} accent />
        <StatCard icon={<SlidersHorizontal size={18} strokeWidth={1.75} className="text-txt2" />} label="Total Profiles" value={`${profiles.length}`} sub="Saved game profiles" />
        <StatCard icon={<span className="font-mono text-sm text-txt2">{"</>"}</span>} label="Total Tweaks" value={`${totalTweaks}`} sub="Across all profiles" />
        <StatCard icon={<Gamepad2 size={18} strokeWidth={1.75} className="text-txt2" />} label="Detected Games" value={`${detected.length}`} sub="Not yet profiled" />
      </div>

      {busy ? (
        <p className="py-16 text-center text-[12px] text-txt3">Detecting your games…</p>
      ) : profiles.length === 0 && detected.length === 0 ? (
        <div className="grid place-items-center rounded-card border border-edge bg-card py-16">
          <Gamepad2 size={26} strokeWidth={1.5} className="text-txt3" />
          <p className="mt-2 text-[13px] font-semibold text-txt">No game profiles yet</p>
          <p className="mt-1 max-w-[300px] text-center text-[11.5px] text-txt2">Add your first game to get started — install something via Steam/Epic, or create one manually.</p>
          <button onClick={() => createProfile()} className="mt-3 flex items-center gap-2 rounded-btn bg-accent px-4 py-2 text-[12px] font-semibold text-white"><Plus size={14} /> Add Game</button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {profiles.map((p) => {
            const active = p.id === selectedId;
            return (
              <button key={p.id} onClick={() => setSelectedId(p.id)} className={`flex flex-col gap-3 rounded-card border p-4 text-left transition-colors ${active ? "border-accent/50 bg-accent/5" : "border-edge bg-card hover:border-edge2"}`}>
                <div className="flex items-center gap-3">
                  <GameArt name={p.gameName} appId={artById[p.id]} className="h-12 w-12" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold text-txt">{p.gameName}</p>
                    <p className="text-[11px] text-txt2">{PRESET_LABEL[p.preset] ?? p.preset}</p>
                  </div>
                  <span onClick={(e) => { e.stopPropagation(); removeProfile(p.id); }} className="grid h-7 w-7 place-items-center rounded-btn text-txt3 hover:text-accent">
                    <Trash2 size={13} strokeWidth={2} />
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-txt2">
                  <span className="flex items-center gap-1"><SlidersHorizontal size={11} /> {p.enabledTweaks.length} tweaks</span>
                  <span>{p.lastPlayed ? new Date(p.lastPlayed).toLocaleDateString() : "Never played"}</span>
                </div>
                {p.avgFpsBefore != null && p.avgFpsAfter != null ? (
                  <p className="text-[11px] font-semibold text-success">+{Math.round(((p.avgFpsAfter - p.avgFpsBefore) / p.avgFpsBefore) * 100)}% avg FPS (measured)</p>
                ) : (
                  <p className="text-[11px] text-txt3">No measured session yet — run once to see real gains</p>
                )}
              </button>
            );
          })}

          {/* Add card */}
          <button onClick={() => createProfile()} className="flex min-h-[130px] flex-col items-center justify-center gap-2 rounded-card border border-dashed border-edge2 text-txt3 transition-colors hover:border-accent/40 hover:text-txt">
            <Plus size={22} strokeWidth={1.75} />
            <span className="text-[12px] font-medium">Add Game</span>
          </button>
        </div>
      )}

      {detected.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-txt3">Detected — click to add a profile</p>
          <div className="flex flex-wrap gap-2">
            {detected.slice(0, 12).map((g) => (
              <button key={g.name} onClick={() => createProfile(g)} className="flex items-center gap-2 rounded-pill border border-dashed border-edge2 bg-card px-3 py-1.5 text-[12px] text-txt2 transition-colors hover:border-accent/40 hover:text-txt">
                <GameArt name={g.name} appId={g.appId} className="h-5 w-5" rounded="rounded" />
                {g.name}
                <Plus size={13} className="text-accent" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
