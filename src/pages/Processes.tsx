import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, MemoryStick, RefreshCw, X, Zap } from "lucide-react";
import { closeBackgroundApps, fetchBackgroundApps } from "../lib/backend";
import { useGameStore } from "../store/gameStore";
import type { BackgroundApp } from "../lib/types";

const CATEGORY_LABEL: Record<string, string> = {
  launcher: "Game launcher",
  chat: "Chat",
  browser: "Browser",
  cloud: "Cloud sync",
  media: "Media",
  vendor: "Vendor software",
};

export default function Processes() {
  const activeGame = useGameStore((s) => s.activeGame);
  const [apps, setApps] = useState<BackgroundApp[]>([]);
  const [busy, setBusy] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [closing, setClosing] = useState(false);

  const reload = async () => {
    setBusy(true);
    const a = await fetchBackgroundApps();
    setApps(a);
    // Drop anything that's no longer running from the selection.
    setSelected((prev) => new Set([...prev].filter((s) => a.some((x) => x.stem === s))));
    setBusy(false);
  };
  useEffect(() => {
    void reload();
  }, []);

  const totalMb = useMemo(() => apps.reduce((n, a) => n + a.memoryMb, 0), [apps]);
  const chosen = useMemo(() => apps.filter((a) => selected.has(a.stem)), [apps, selected]);
  const chosenMb = useMemo(() => chosen.reduce((n, a) => n + a.memoryMb, 0), [chosen]);

  const toggle = (stem: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(stem)) next.delete(stem);
      else next.add(stem);
      return next;
    });

  const doClose = async () => {
    setClosing(true);
    await closeBackgroundApps(chosen.map((a) => a.stem));
    setClosing(false);
    setConfirming(false);
    await reload();
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[42px] font-black uppercase leading-none tracking-tight text-txt">Background Apps</h1>
          <p className="mt-1.5 max-w-[580px] text-[14px] text-txt2">
            Close the programs sitting behind your game eating RAM. Every app here is read live from
            your PC, and the memory freed afterwards is measured, not estimated.
          </p>
        </div>
        <button
          onClick={() => void reload()}
          className="flex items-center gap-2 rounded-btn border border-edge bg-card px-4 py-2 text-[12px] font-medium text-txt2 hover:text-txt"
        >
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Rescan
        </button>
      </div>

      <p className="flex items-start gap-2 rounded-chip border border-edge bg-card px-3.5 py-2.5 text-[11.5px] leading-relaxed text-txt2">
        <MemoryStick size={14} className="mt-0.5 shrink-0 text-accent" />
        Mujify only lists apps it can name and explain — it will never show you a wall of{" "}
        <span className="font-mono text-[10.5px] text-txt3">svchost.exe</span> to shoot at. Windows
        system processes, your anti-cheat and the game you're playing can't be closed from here, by
        design. Closing an app is not a settings change, so there's nothing to undo: you just reopen
        it when you want it back.
      </p>

      {activeGame && (
        <p className="flex items-start gap-2 rounded-chip border border-success/30 bg-success/10 px-3.5 py-2.5 text-[11.5px] text-success">
          <Check size={14} className="mt-0.5 shrink-0" strokeWidth={3} />
          {activeGame.name} is running — it's excluded from this list and can't be closed here.
        </p>
      )}

      {busy ? (
        <p className="py-16 text-center text-[13px] text-txt3">Reading your running apps…</p>
      ) : apps.length === 0 ? (
        <p className="rounded-chip border border-edge bg-card px-3 py-8 text-center text-[12.5px] text-txt2">
          Nothing worth closing — none of the background apps Mujify knows about are running right now.
          That's a good sign.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-txt2">Running</h2>
            <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[11px] font-bold text-blue-400">{apps.length}</span>
            <span className="text-[11.5px] text-txt3">· {totalMb.toLocaleString()} MB total</span>
            <div className="flex-1" />
            {apps.some((a) => a.recommended) && (
              <button
                onClick={() => setSelected(new Set(apps.filter((a) => a.recommended).map((a) => a.stem)))}
                className="rounded-btn border border-edge bg-card px-3 py-1.5 text-[11.5px] font-medium text-txt2 hover:text-txt"
              >
                Select recommended
              </button>
            )}
          </div>

          <ul className="flex flex-col gap-1.5">
            {apps.map((a) => {
              const picked = selected.has(a.stem);
              return (
                <li key={a.stem}>
                  <button
                    onClick={() => toggle(a.stem)}
                    className={`flex w-full items-start gap-3 rounded-chip border px-3.5 py-3 text-left transition-colors ${
                      picked ? "border-accent/50 bg-accent/5" : "border-edge bg-card hover:border-edge2"
                    }`}
                  >
                    <span
                      className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${
                        picked ? "border-accent bg-accent text-white" : "border-edge2"
                      }`}
                    >
                      {picked && <Check size={11} strokeWidth={3} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13px] font-semibold text-txt">{a.display}</p>
                        <span className="rounded bg-edge px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wide text-txt3">
                          {CATEGORY_LABEL[a.category] ?? a.category}
                        </span>
                        {a.recommended && (
                          <span className="rounded bg-success/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-success">
                            Recommended
                          </span>
                        )}
                        {a.instances > 1 && (
                          <span className="text-[9.5px] uppercase tracking-wide text-txt3">
                            {a.instances} processes
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11.5px] leading-snug text-txt2">{a.description}</p>
                      {a.warning && (
                        <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-warning">
                          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                          {a.warning}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-[15px] font-bold tabular-nums text-txt">
                        {a.memoryMb.toLocaleString()}
                      </p>
                      <p className="text-[9.5px] uppercase tracking-wide text-txt3">MB RAM</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {chosen.length > 0 && (
        <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-card border border-edge bg-panel px-4 py-3 shadow-2xl">
          <p className="text-[12px] text-txt2">
            <span className="font-bold text-txt">{chosen.length}</span> app{chosen.length === 1 ? "" : "s"} ·
            up to <span className="font-bold text-txt">{chosenMb.toLocaleString()} MB</span> in use
            <span className="ml-1 text-txt3">(Windows decides how much actually comes back)</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-btn border border-edge bg-card px-3.5 py-2 text-[12px] font-medium text-txt2 hover:text-txt"
            >
              Clear
            </button>
            <button
              onClick={() => setConfirming(true)}
              className="flex items-center gap-2 rounded-btn bg-accent px-4 py-2 text-[12.5px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi"
            >
              <Zap size={14} strokeWidth={2.25} fill="currentColor" />
              Close {chosen.length}
            </button>
          </div>
        </div>
      )}

      {/* The confirmation gate. Nothing closes without a click here. */}
      {confirming && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-card border border-edge bg-panel shadow-2xl">
            <div className="flex items-center justify-between border-b border-edge px-5 py-4">
              <h2 className="text-[15px] font-bold text-txt">
                Close {chosen.length} app{chosen.length === 1 ? "" : "s"}?
              </h2>
              <button onClick={() => setConfirming(false)} className="text-txt3 hover:text-txt">
                <X size={18} strokeWidth={2} />
              </button>
            </div>
            <div className="max-h-[46vh] overflow-y-auto px-5 py-4">
              <p className="mb-3 text-[12.5px] text-txt2">
                These will be closed now. This isn't a settings change and there's nothing to undo —
                reopen anything you want back. Save your work first.
              </p>
              <ul className="flex flex-col gap-1.5">
                {chosen.map((a) => (
                  <li key={a.stem} className="rounded-chip border border-edge bg-card px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <p className="flex-1 text-[12.5px] font-medium text-txt">{a.display}</p>
                      <span className="text-[11px] tabular-nums text-txt2">{a.memoryMb.toLocaleString()} MB</span>
                    </div>
                    {a.warning && (
                      <p className="mt-1 flex items-start gap-1.5 text-[10.5px] leading-snug text-warning">
                        <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                        {a.warning}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-center justify-end gap-2.5 border-t border-edge px-5 py-4">
              <button
                onClick={() => setConfirming(false)}
                className="rounded-btn border border-edge bg-card px-4 py-2 text-[12.5px] font-medium text-txt2 hover:text-txt"
              >
                Cancel
              </button>
              <button
                onClick={() => void doClose()}
                disabled={closing}
                className="flex items-center gap-2 rounded-btn bg-accent px-4 py-2 text-[12.5px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi disabled:opacity-60"
              >
                <Zap size={14} strokeWidth={2.25} fill="currentColor" />
                {closing ? "Closing…" : `Close ${chosen.length}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
