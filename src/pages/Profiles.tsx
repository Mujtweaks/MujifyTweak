import { useEffect, useMemo, useState } from "react";
import { Check, FolderOpen, Gamepad2, Plus, Search, Zap } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { fetchInstalledGames, listProfiles, saveProfile } from "../lib/backend";
import { useGameStore } from "../store/gameStore";
import GameArt from "../components/GameArt";
import GameOptimizeModal from "../components/GameOptimizeModal";
import type { GameInfo, Profile } from "../lib/types";
import type { PageId } from "../lib/nav";

export default function Profiles({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const setInstalledGames = useGameStore((s) => s.setInstalledGames);
  const activeGame = useGameStore((s) => s.activeGame);
  const [games, setGames] = useState<GameInfo[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(true);
  const [optimizeGame, setOptimizeGame] = useState<GameInfo | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    const [g, ps] = await Promise.all([fetchInstalledGames(), listProfiles()]);
    setGames(g);
    setInstalledGames(g);
    setProfiles(ps);
    setBusy(false);
  };
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const profiled = useMemo(() => new Set(profiles.map((p) => p.gameName.toLowerCase())), [profiles]);
  const filtered = games.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()));

  // Add ANY game manually (for titles no launcher scan found). Creates a real
  // profile + a library tile so it can be optimized like the rest.
  const addManualGame = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    const cleanPath = newPath.trim() || null;
    const profile: Profile = {
      schemaVersion: 1,
      id: "",
      gameName: name,
      gameExe: null,
      launcher: "Manual",
      preset: "balanced",
      launchOptions: null,
      enabledTweaks: [],
      createdAt: new Date().toISOString(),
      lastPlayed: null,
      avgFpsBefore: null,
      avgFpsAfter: null,
    };
    // Persist the profile, and add a library tile immediately so it appears.
    await saveProfile(profile);
    const manual: GameInfo = { name, exe: "", launcher: "Manual", installPath: cleanPath, appId: null };
    setGames((prev) => (prev.some((g) => g.name.toLowerCase() === name.toLowerCase()) ? prev : [...prev, manual]));
    setSaving(false);
    setShowAdd(false);
    setNewName("");
    setNewPath("");
    await reload();
  };

  // Open the native folder picker and fill in the install path (and, if empty,
  // default the game name to the folder's own name).
  // Browse straight to the game's .exe (or shortcut) — most natural for "add a
  // game". We store the folder it lives in and default the name from the exe.
  const browseForGame = async () => {
    try {
      const file = await open({
        multiple: false,
        title: "Select the game's .exe or shortcut",
        filters: [{ name: "Game or shortcut", extensions: ["exe", "lnk", "url"] }],
      });
      if (typeof file === "string" && file) {
        setNewPath(file);
        if (!newName.trim()) {
          const base = file.replace(/[/\\]+$/, "").split(/[/\\]/).pop() ?? "";
          const nm = base.replace(/\.(exe|lnk|url)$/i, "").replace(/[_-]+/g, " ").trim();
          if (nm) setNewName(nm);
        }
      }
    } catch {
      /* user cancelled the dialog — no-op */
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[42px] font-black uppercase leading-none tracking-tight text-txt">Games</h1>
          <p className="mt-1.5 text-[14px] text-txt2">Launch &amp; optimize the games installed on your PC.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-edge bg-card px-4 py-2">
          <Search size={14} className="text-txt3" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search library…" className="w-40 bg-transparent text-[12px] text-txt placeholder:text-txt3 focus:outline-none" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-txt2">Library</h2>
        <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[11px] font-bold text-blue-400">{games.length}</span>
      </div>

      {busy ? (
        <p className="py-16 text-center text-[13px] text-txt3">Detecting your games…</p>
      ) : (
        <div className="grid grid-cols-6 gap-4">
          {filtered.map((g, i) => {
            const isActive = activeGame?.name === g.name;
            const isProfiled = profiled.has(g.name.toLowerCase());
            return (
              <button
                key={g.name + (g.appId ?? "")}
                onClick={() => setOptimizeGame(g)}
                style={{ animationDelay: `${50 + Math.min(i, 20) * 40}ms` }}
                className="stagger-item group relative"
              >
                <div className={`relative aspect-[3/4] overflow-hidden rounded-xl border ${isActive ? "border-success/50" : "border-edge"}`}>
                  <GameArt name={g.name} appId={g.appId} className="h-full w-full" rounded="rounded-xl" />
                  <div className="absolute inset-0 grid place-items-center bg-black/60 opacity-0 transition-opacity duration-100 group-hover:opacity-100">
                    <span className="flex items-center gap-1.5 rounded-btn bg-accent px-3 py-1.5 text-[11px] font-semibold text-white"><Zap size={12} fill="currentColor" /> {isProfiled ? "Optimized" : "Optimize"}</span>
                  </div>
                  {isActive && <span className="absolute right-1.5 top-1.5 rounded-full bg-success px-2 py-0.5 text-[8px] font-bold text-white">ACTIVE</span>}
                  {isProfiled && !isActive && <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-success/90"><Check size={11} className="text-white" strokeWidth={3} /></span>}
                </div>
                <p className="mt-1.5 truncate text-center text-[12px] text-txt">{g.name}</p>
              </button>
            );
          })}

          {/* Add game */}
          <button onClick={() => setShowAdd(true)} className="flex flex-col">
            <div className="grid aspect-[3/4] place-items-center rounded-xl border border-dashed border-edge2 text-txt3 transition-colors hover:border-accent/40 hover:text-txt">
              <div className="text-center">
                <Plus size={24} strokeWidth={1.75} className="mx-auto" />
                <span className="mt-1 block text-[11px] font-medium">Add Game</span>
              </div>
            </div>
          </button>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setShowAdd(false)}>
          <div className="w-full max-w-[420px] rounded-card border border-edge bg-panel p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[16px] font-bold text-txt">Add a game</h3>
            <p className="mt-1 text-[12px] text-txt2">Add any game — even one no launcher found. It gets a profile you can optimize.</p>
            <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-txt3">Game name</label>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void addManualGame()}
              placeholder="e.g. Watch Dogs 2"
              className="mt-1 w-full rounded-btn border border-edge bg-card px-3 py-2 text-[13px] text-txt placeholder:text-txt3 focus:border-accent/50 focus:outline-none"
            />
            <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-txt3">Game .exe or folder <span className="text-txt3/70">(optional)</span></label>
            <div className="mt-1 flex gap-2">
              <input
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void addManualGame()}
                placeholder="Browse to the game's .exe →"
                className="w-full rounded-btn border border-edge bg-card px-3 py-2 text-[13px] text-txt placeholder:text-txt3 focus:border-accent/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void browseForGame()}
                title="Browse for the game's .exe or shortcut"
                className="flex shrink-0 items-center gap-1.5 rounded-btn border border-edge bg-card px-3 py-2 text-[12px] font-medium text-txt2 hover:border-accent/40 hover:text-txt"
              >
                <FolderOpen size={14} /> Browse
              </button>
            </div>
            <p className="mt-1.5 text-[10.5px] text-txt3">Adding the folder lets Mujify detect the game engine for a tailored profile.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="rounded-btn border border-edge bg-card px-4 py-2 text-[12px] font-medium text-txt2 hover:text-txt">Cancel</button>
              <button onClick={() => void addManualGame()} disabled={!newName.trim() || saving} className="rounded-btn bg-accent px-4 py-2 text-[12px] font-bold text-white disabled:opacity-40">
                {saving ? "Adding…" : "Add Game"}
              </button>
            </div>
          </div>
        </div>
      )}

      {!busy && games.length === 0 && (
        <div className="grid place-items-center py-10 text-center">
          <Gamepad2 size={26} strokeWidth={1.5} className="text-txt3" />
          <p className="mt-2 text-[13px] font-semibold text-txt">No games detected yet</p>
          <p className="mt-1 max-w-[300px] text-[11.5px] text-txt2">Install a game via Steam or Epic, or add one manually. Then optimize it from the Optimizer.</p>
          <button onClick={() => onNavigate("optimizer")} className="mt-3 rounded-btn border border-edge bg-card px-4 py-2 text-[12px] font-medium text-txt hover:border-edge2">Open Optimizer</button>
        </div>
      )}

      {optimizeGame && (
        <GameOptimizeModal game={optimizeGame} onClose={() => setOptimizeGame(null)} />
      )}
    </div>
  );
}
