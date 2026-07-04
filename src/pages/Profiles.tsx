import { useEffect, useMemo, useState } from "react";
import {
  Gamepad2,
  HardDriveDownload,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { fetchInstalledGames, listProfiles, saveProfile, deleteProfile } from "../lib/backend";
import type { GameInfo, Profile } from "../lib/types";

const PRESET_LABEL: Record<string, string> = {
  ultimate: "Ultimate Performance",
  balanced: "Balanced",
  power_saving: "Power Saving",
  competitive: "Competitive",
};

/** Deterministic accent tile for a game with no local box art (never a fake image). */
function gameTile(name: string) {
  const hues = [0, 210, 140, 275, 32];
  const hue = hues[name.charCodeAt(0) % hues.length];
  return {
    background: `linear-gradient(135deg, hsl(${hue} 60% 22%), hsl(${hue} 55% 12%))`,
    letter: name.charAt(0).toUpperCase(),
  };
}

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-1 items-start gap-3 rounded-2xl border border-edge bg-panel p-4">
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${
          accent ? "border-accent/30 bg-accent/10" : "border-edge bg-panel2"
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-txt3">{label}</p>
        <p className="truncate text-[15px] font-bold text-txt">{value}</p>
        <p className="truncate text-[10.5px] text-txt2">{sub}</p>
      </div>
    </div>
  );
}

export default function Profiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [detected, setDetected] = useState<GameInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(true);

  const reload = async () => {
    const [ps, games] = await Promise.all([listProfiles(), fetchInstalledGames()]);
    setProfiles(ps);
    // Detected games not yet turned into a profile → suggestions to add.
    const named = new Set(ps.map((p) => p.gameName.toLowerCase()));
    setDetected(games.filter((g) => !named.has(g.name.toLowerCase())));
    if (!selectedId && ps.length > 0) setSelectedId(ps[0].id);
    setBusy(false);
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = profiles.find((p) => p.id === selectedId) ?? null;
  const totalTweaks = useMemo(
    () => profiles.reduce((sum, p) => sum + p.enabledTweaks.length, 0),
    [profiles],
  );

  const filtered = profiles.filter((p) =>
    p.gameName.toLowerCase().includes(search.toLowerCase()),
  );

  const createProfile = async (game?: GameInfo) => {
    const name = game?.name ?? `New Profile ${profiles.length + 1}`;
    const profile: Profile = {
      schemaVersion: 1,
      id: "",
      gameName: name,
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

  const saveLaunchOptions = async (val: string) => {
    if (!selected) return;
    await saveProfile({ ...selected, launchOptions: val.trim() || null });
    await reload();
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-wide text-txt">Profiles</h1>
          <p className="mt-1 max-w-lg text-[12.5px] text-txt2">
            Per-game optimization profiles. Each stores its tweaks and launch options — saved
            locally to AppData, auto-detected from your installed games.
          </p>
        </div>
        <button
          onClick={() => createProfile()}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-b from-accent to-[#a3000a] px-3.5 py-2 text-[12px] font-semibold text-white shadow-[0_0_18px_rgba(227,0,14,0.3)]"
        >
          <Plus size={14} strokeWidth={2.5} />
          Create New Profile
        </button>
      </div>

      {/* Stat cards */}
      <div className="flex gap-4">
        <StatCard
          icon={<Gamepad2 size={18} strokeWidth={1.75} className="text-accent" />}
          label="Active Profile"
          value={selected ? selected.gameName : "None selected"}
          sub={selected ? PRESET_LABEL[selected.preset] ?? selected.preset : "Select a profile to activate"}
          accent
        />
        <StatCard
          icon={<SlidersHorizontal size={18} strokeWidth={1.75} className="text-txt2" />}
          label="Total Profiles"
          value={`${profiles.length}`}
          sub="Saved game profiles"
        />
        <StatCard
          icon={<span className="font-mono text-sm text-txt2">{"</>"}</span>}
          label="Total Tweaks"
          value={`${totalTweaks}`}
          sub="Across all profiles"
        />
        <StatCard
          icon={<HardDriveDownload size={18} strokeWidth={1.75} className="text-txt2" />}
          label="Storage"
          value="Local"
          sub="AppData · nothing uploaded"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Left: list */}
        <div className="rounded-2xl border border-edge bg-panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-txt2">
              Your Profiles ({profiles.length})
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-edge bg-panel2 px-2.5 py-1.5">
              <Search size={13} strokeWidth={2} className="text-txt3" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search profiles…"
                className="w-28 bg-transparent text-[12px] text-txt placeholder:text-txt3 focus:outline-none"
              />
            </div>
          </div>

          {busy ? (
            <p className="py-8 text-center text-[12px] text-txt3">Detecting your games…</p>
          ) : profiles.length === 0 && detected.length === 0 ? (
            <div className="grid place-items-center py-10 text-center">
              <Gamepad2 size={24} strokeWidth={1.5} className="text-txt3" />
              <p className="mt-2 text-[13px] font-semibold text-txt">No games detected yet</p>
              <p className="mt-1 max-w-[240px] text-[11.5px] text-txt2">
                Install a game via Steam or Epic, or click Create New Profile to add one manually.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((p) => {
                const tile = gameTile(p.gameName);
                const active = p.id === selectedId;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className={`flex items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${
                      active ? "border-accent/60 bg-accent/5" : "border-edge bg-panel2 hover:border-edge2"
                    }`}
                  >
                    <span
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-lg font-display text-lg font-bold text-white/90"
                      style={{ background: tile.background }}
                    >
                      {tile.letter}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[13px] font-semibold text-txt">{p.gameName}</p>
                        {active && (
                          <span className="rounded bg-good/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-good">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="truncate text-[10.5px] text-txt2">
                        {PRESET_LABEL[p.preset] ?? p.preset}
                        {p.launcher ? ` · ${p.launcher}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="flex items-center gap-1 text-[11px] text-txt2">
                        <SlidersHorizontal size={11} /> {p.enabledTweaks.length}
                      </p>
                    </div>
                  </button>
                );
              })}

              {/* Detected but unprofiled games */}
              {detected.length > 0 && (
                <>
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-txt3">
                    Detected games — click to add
                  </p>
                  {detected.slice(0, 6).map((g) => {
                    const tile = gameTile(g.name);
                    return (
                      <button
                        key={g.name}
                        onClick={() => createProfile(g)}
                        className="flex items-center gap-3 rounded-xl border border-dashed border-edge2 bg-panel2/50 p-2.5 text-left transition-colors hover:border-accent/40"
                      >
                        <span
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg font-display text-base font-bold text-white/70"
                          style={{ background: tile.background }}
                        >
                          {tile.letter}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12.5px] font-medium text-txt">{g.name}</p>
                          <p className="text-[10px] text-txt3">{g.launcher ?? "Installed"}</p>
                        </div>
                        <Plus size={15} strokeWidth={2} className="text-accent" />
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          )}

          <button
            onClick={() => createProfile()}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-edge2 py-3 text-[12px] font-medium text-txt2 transition-colors hover:border-accent/40 hover:text-txt"
          >
            <Plus size={14} strokeWidth={2} />
            Add another game profile
          </button>
        </div>

        {/* Right: details */}
        <div className="rounded-2xl border border-edge bg-panel p-4">
          {selected ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-txt2">
                  Profile Details
                </p>
                <button
                  onClick={() => removeProfile(selected.id)}
                  className="flex items-center gap-1.5 rounded-lg border border-edge px-2.5 py-1.5 text-[11px] font-medium text-txt2 hover:border-accent/40 hover:text-accent"
                >
                  <Trash2 size={13} strokeWidth={2} />
                  Delete
                </button>
              </div>

              <div className="flex items-center gap-3.5">
                <span
                  className="grid h-16 w-16 shrink-0 place-items-center rounded-xl font-display text-2xl font-bold text-white/90"
                  style={{ background: gameTile(selected.gameName).background }}
                >
                  {gameTile(selected.gameName).letter}
                </span>
                <div>
                  <p className="text-[16px] font-bold text-txt">{selected.gameName}</p>
                  <p className="text-[12px] font-medium text-accent">
                    {PRESET_LABEL[selected.preset] ?? selected.preset}
                  </p>
                  <div className="mt-1 flex gap-4 text-[11px] text-txt2">
                    <span>
                      Last played: {selected.lastPlayed ? new Date(selected.lastPlayed).toLocaleDateString() : "Never"}
                    </span>
                    <span>Tweaks: {selected.enabledTweaks.length}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-txt3">
                  Launch options
                </p>
                <div className="flex items-center gap-2 rounded-lg border border-edge bg-panel2 px-3 py-2">
                  <input
                    key={selected.id}
                    defaultValue={selected.launchOptions ?? ""}
                    onBlur={(e) => void saveLaunchOptions(e.target.value)}
                    placeholder="e.g. -high -USEALLAVAILABLECORES"
                    className="flex-1 bg-transparent font-mono text-[11.5px] text-txt placeholder:text-txt3 focus:outline-none"
                  />
                </div>
                <p className="mt-1 text-[10px] text-txt3">Saved automatically when you click away.</p>
              </div>

              {/* Performance preview — honest: only real measured sessions show numbers */}
              <div className="mt-4 rounded-xl border border-edge bg-panel2 p-3.5">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-txt2">
                  Performance Preview
                </p>
                {selected.avgFpsBefore != null && selected.avgFpsAfter != null ? (
                  <div className="flex divide-x divide-edge">
                    <PreviewStat
                      value={`+${Math.round(((selected.avgFpsAfter - selected.avgFpsBefore) / selected.avgFpsBefore) * 100)}%`}
                      label="Average gain"
                      color="text-good"
                    />
                  </div>
                ) : (
                  <p className="py-2 text-center text-[11.5px] text-txt2">
                    No measured sessions yet. Play a session with the before/after benchmark
                    (Checkpoints 13–15) to see a real gain here — never an estimated one.
                  </p>
                )}
              </div>

            </>
          ) : (
            <div className="grid h-full place-items-center">
              <div className="text-center">
                <Gamepad2 size={26} strokeWidth={1.5} className="mx-auto text-txt3" />
                <p className="mt-2 text-[13px] font-semibold text-txt">No profile selected</p>
                <p className="mt-1 max-w-[240px] text-[11.5px] text-txt2">
                  Pick a profile on the left, or add one from your detected games.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewStat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="flex flex-1 flex-col items-center">
      <span className={`font-display text-2xl font-bold ${color}`}>{value}</span>
      <span className="text-[10.5px] text-txt2">{label}</span>
    </div>
  );
}
