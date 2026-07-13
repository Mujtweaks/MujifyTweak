import { useEffect, useMemo, useState } from "react";
import { FileSearch, FolderOpen, HardDrive, Loader2, MemoryStick, Sparkles, Trash2, X, Zap } from "lucide-react";
import {
  cleanJunk,
  optimizeRam,
  ramStatus,
  revealInExplorer,
  scanDuplicateFiles,
  scanJunk,
  scanLargeFiles,
} from "../lib/backend";
import { toast } from "../store/toastStore";
import DebloatSection from "../components/DebloatSection";
import type { DupGroup, JunkCategory, LargeFile, RamStatus } from "../lib/types";

function fmtBytes(n: number): string {
  if (n <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export default function Cleaner() {
  // ---- RAM optimizer ----
  const [ram, setRam] = useState<RamStatus | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const loadRam = async () => setRam(await ramStatus());
  useEffect(() => {
    void loadRam();
    const t = setInterval(() => void loadRam(), 4000);
    return () => clearInterval(t);
  }, []);
  const doOptimizeRam = async () => {
    setOptimizing(true);
    const res = await optimizeRam();
    setOptimizing(false);
    if (res) {
      toast.success(
        res.freedMb > 0 ? `Returned ${res.freedMb.toLocaleString()} MB to available` : "RAM already lean",
        res.freedMb > 0
          ? `Trimmed ${res.processesTrimmed} apps' working sets: ${res.beforeAvailableMb.toLocaleString()} → ${res.afterAvailableMb.toLocaleString()} MB available. Windows parks it as standby, so a game grabs it instantly — Task Manager may still show it as "cached", which is normal.`
          : "Nothing meaningful to reclaim right now — your memory is already tight-packed.",
      );
      void loadRam();
    }
  };

  // ---- Junk scan ----
  const [junk, setJunk] = useState<JunkCategory[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const [rescanning, setRescanning] = useState(false);
  const loadJunk = async () => {
    setRescanning(true);
    const j = await scanJunk();
    setJunk(j);
    setRescanning(false);
    // Pre-select the regenerable categories that actually have something to clean.
    setSelected(new Set(j.filter((c) => c.regenerable && c.bytes > 0).map((c) => c.id)));
  };
  useEffect(() => {
    void loadJunk();
    // Temp folders change constantly — re-scan whenever the app regains focus so
    // the number is always live and matches what File Explorer would show, never
    // a stale figure from an earlier scan.
    const onFocus = () => void loadJunk();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const totalSelected = useMemo(
    () => (junk ?? []).filter((c) => selected.has(c.id)).reduce((s, c) => s + c.bytes, 0),
    [junk, selected],
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const doClean = async () => {
    setCleaning(true);
    const res = await cleanJunk([...selected]);
    setCleaning(false);
    setConfirming(false);
    if (res) {
      toast.success(
        `Freed ${fmtBytes(res.bytesFreed)}`,
        res.partial.length
          ? "Some files were in use and left in place — rerun after closing games/apps."
          : `${res.filesDeleted} file${res.filesDeleted === 1 ? "" : "s"} cleared.`,
      );
      void loadJunk();
    }
  };

  // ---- Large-file finder ----
  const [largeRoot, setLargeRoot] = useState("");
  const [minMb, setMinMb] = useState(100);
  const [large, setLarge] = useState<LargeFile[] | null>(null);
  const [largeBusy, setLargeBusy] = useState(false);
  const runLarge = async () => {
    if (!largeRoot.trim()) return;
    setLargeBusy(true);
    setLarge(await scanLargeFiles(largeRoot.trim(), minMb));
    setLargeBusy(false);
  };

  // ---- Duplicate finder ----
  const [dupRoot, setDupRoot] = useState("");
  const [dups, setDups] = useState<DupGroup[] | null>(null);
  const [dupBusy, setDupBusy] = useState(false);
  const runDups = async () => {
    if (!dupRoot.trim()) return;
    setDupBusy(true);
    setDups(await scanDuplicateFiles(dupRoot.trim()));
    setDupBusy(false);
  };
  const dupWaste = useMemo(
    () => (dups ?? []).reduce((s, g) => s + g.bytes * (g.paths.length - 1), 0),
    [dups],
  );

  return (
    <div className="flex flex-col gap-6 pb-16">
      <div>
        <h1 className="text-[42px] font-black uppercase leading-none tracking-tight text-txt">Cleaner</h1>
        <p className="mt-1.5 text-[14px] text-txt2">
          Reclaim disk space safely. Every scan is read-only — nothing is deleted until you confirm, and
          only regenerable caches are ever touched.
        </p>
      </div>

      {/* ---- RAM optimizer ---- */}
      <section className="rounded-2xl border border-edge bg-card p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500/15">
              <MemoryStick size={20} strokeWidth={1.75} className="text-indigo-400" />
            </span>
            <div>
              <h2 className="text-[16px] font-bold text-txt">Free up memory</h2>
              <p className="text-[11.5px] text-txt2">
                {ram
                  ? `${ram.availableMb.toLocaleString()} MB free of ${ram.totalMb.toLocaleString()} MB`
                  : "Reading memory…"}
              </p>
            </div>
          </div>
          <button
            onClick={() => void doOptimizeRam()}
            disabled={optimizing || !ram}
            className="glint flex items-center gap-2 rounded-btn bg-accent px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi disabled:opacity-40"
          >
            {optimizing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} strokeWidth={2.5} fill="currentColor" />}
            {optimizing ? "Optimizing…" : "Optimize RAM"}
          </button>
        </div>
        {ram && (
          <>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-bg">
              <div
                className={`h-full rounded-full transition-all ${ram.usedPercent > 85 ? "bg-accent" : ram.usedPercent > 65 ? "bg-warning" : "bg-success"}`}
                style={{ width: `${Math.min(ram.usedPercent, 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-txt3">
              {ram.usedMb.toLocaleString()} MB in use ({ram.usedPercent.toFixed(0)}%). Trimming hands cached pages
              back to Windows — a running game may hitch for a second as it re-pages, so do this before you launch,
              not mid-match.
            </p>
          </>
        )}
      </section>

      {/* ---- Junk / cache scan ---- */}
      <section>
        <div className="mb-3 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15">
            <Sparkles size={18} strokeWidth={1.75} className="text-accent" />
          </span>
          <div className="flex-1">
            <h2 className="text-[16px] font-bold text-txt">Deep clean</h2>
            <p className="text-[11.5px] text-txt2">
              Temp files, GPU shader caches and crash dumps — all rebuilt automatically when needed. Live sizes, re-scanned each time you open this.
            </p>
          </div>
          <button
            onClick={() => void loadJunk()}
            disabled={rescanning}
            className="flex shrink-0 items-center gap-1.5 rounded-btn border border-edge bg-bg px-3 py-1.5 text-[12px] font-medium text-txt2 hover:border-edge2 hover:text-txt disabled:opacity-50"
          >
            <Loader2 size={13} className={rescanning ? "animate-spin" : ""} /> {rescanning ? "Scanning…" : "Rescan"}
          </button>
        </div>

        {junk === null ? (
          <p className="py-6 text-center text-[12px] text-txt3">Measuring reclaimable space…</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              {junk.map((c) => {
                const on = selected.has(c.id);
                const empty = c.bytes === 0;
                return (
                  <button
                    key={c.id}
                    disabled={empty}
                    onClick={() => toggle(c.id)}
                    className={`flex flex-col items-start rounded-2xl border p-4 text-left transition-all ${
                      empty
                        ? "cursor-default border-edge bg-card opacity-50"
                        : on
                          ? "border-accent/50 bg-accent/5"
                          : "border-edge bg-card hover:border-white/20"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="text-[13px] font-bold text-txt">{c.label}</span>
                      <span className="text-[15px] font-black text-accent">{fmtBytes(c.bytes)}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-txt2">{c.description}</p>
                    <p className="mt-2 text-[10px] uppercase tracking-wide text-txt3">
                      {empty ? "Nothing to clean" : `${c.fileCount} files · ${on ? "selected" : "click to select"}`}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between rounded-2xl border border-edge bg-panel px-4 py-3">
              <span className="text-[13px] text-txt2">
                <span className="font-black text-txt">{fmtBytes(totalSelected)}</span> selected to reclaim
              </span>
              <button
                onClick={() => setConfirming(true)}
                disabled={totalSelected === 0}
                className="glint flex items-center gap-2 rounded-btn bg-accent px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi disabled:opacity-40"
              >
                <Trash2 size={14} strokeWidth={2.5} /> Clean selected
              </button>
            </div>
          </>
        )}
      </section>

      {/* ---- Large file finder ---- */}
      <section>
        <div className="mb-3 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-cpu/15">
            <HardDrive size={18} strokeWidth={1.75} className="text-cpu" />
          </span>
          <div>
            <h2 className="text-[16px] font-bold text-txt">Large files</h2>
            <p className="text-[11.5px] text-txt2">Find your biggest space hogs. Read-only — nothing is deleted from here.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={largeRoot}
            onChange={(e) => setLargeRoot(e.target.value)}
            placeholder="Folder to scan, e.g. C:\Users\you\Downloads"
            className="flex-1 rounded-btn border border-edge bg-card px-3 py-2 text-[12.5px] text-txt placeholder:text-txt3 focus:border-accent/40 focus:outline-none"
          />
          <select
            value={minMb}
            onChange={(e) => setMinMb(Number(e.target.value))}
            className="rounded-btn border border-edge bg-card px-2 py-2 text-[12px] text-txt2"
          >
            <option value={50}>≥ 50 MB</option>
            <option value={100}>≥ 100 MB</option>
            <option value={500}>≥ 500 MB</option>
            <option value={1024}>≥ 1 GB</option>
          </select>
          <button
            onClick={() => void runLarge()}
            disabled={largeBusy || !largeRoot.trim()}
            className="flex items-center gap-1.5 rounded-btn border border-edge bg-bg px-4 py-2 text-[12px] font-semibold text-txt2 hover:text-txt disabled:opacity-40"
          >
            {largeBusy ? <Loader2 size={14} className="animate-spin" /> : <FileSearch size={14} />} Scan
          </button>
        </div>
        {large !== null && (
          <div className="mt-3 flex flex-col gap-1.5">
            {large.length === 0 ? (
              <p className="rounded-chip border border-edge bg-card px-3 py-4 text-center text-[12px] text-txt3">
                No files that big under that folder.
              </p>
            ) : (
              large.map((f) => (
                <div key={f.path} className="flex items-center gap-2 rounded-chip border border-edge bg-card px-3 py-2">
                  <span className="w-[72px] shrink-0 text-[12px] font-black text-accent">{fmtBytes(f.bytes)}</span>
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-txt2" title={f.path}>{f.path}</span>
                  <button onClick={() => void revealInExplorer(f.path)} title="Show in Explorer" className="shrink-0 text-txt3 hover:text-accent">
                    <FolderOpen size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      {/* ---- Duplicate finder ---- */}
      <section>
        <div className="mb-3 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gpu/15">
            <FileSearch size={18} strokeWidth={1.75} className="text-gpu" />
          </span>
          <div>
            <h2 className="text-[16px] font-bold text-txt">Duplicate files</h2>
            <p className="text-[11.5px] text-txt2">Byte-identical copies wasting space. Read-only — you choose what to open and remove yourself.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={dupRoot}
            onChange={(e) => setDupRoot(e.target.value)}
            placeholder="Folder to scan for duplicates"
            className="flex-1 rounded-btn border border-edge bg-card px-3 py-2 text-[12.5px] text-txt placeholder:text-txt3 focus:border-accent/40 focus:outline-none"
          />
          <button
            onClick={() => void runDups()}
            disabled={dupBusy || !dupRoot.trim()}
            className="flex items-center gap-1.5 rounded-btn border border-edge bg-bg px-4 py-2 text-[12px] font-semibold text-txt2 hover:text-txt disabled:opacity-40"
          >
            {dupBusy ? <Loader2 size={14} className="animate-spin" /> : <FileSearch size={14} />} Scan
          </button>
        </div>
        {dups !== null && (
          <div className="mt-3 flex flex-col gap-2">
            {dups.length === 0 ? (
              <p className="rounded-chip border border-edge bg-card px-3 py-4 text-center text-[12px] text-txt3">
                No duplicate files found under that folder.
              </p>
            ) : (
              <>
                <p className="text-[11.5px] text-txt2">
                  <span className="font-black text-accent">{fmtBytes(dupWaste)}</span> reclaimable across {dups.length} group
                  {dups.length === 1 ? "" : "s"} — remove all but one copy in each.
                </p>
                {dups.map((g, gi) => (
                  <div key={gi} className="rounded-chip border border-edge bg-card px-3 py-2">
                    <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-txt3">
                      {g.paths.length} copies · {fmtBytes(g.bytes)} each
                    </p>
                    {g.paths.map((p) => (
                      <div key={p} className="flex items-center gap-2 py-0.5">
                        <span className="min-w-0 flex-1 truncate text-[11px] text-txt2" title={p}>{p}</span>
                        <button onClick={() => void revealInExplorer(p)} title="Show in Explorer" className="shrink-0 text-txt3 hover:text-accent">
                          <FolderOpen size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </section>

      {/* ---- Debloat (moved here from Fixes) ---- */}
      <DebloatSection />

      {confirming && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => !cleaning && setConfirming(false)}>
          <div className="w-full max-w-[420px] rounded-card border border-edge bg-panel p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h3 className="text-[16px] font-bold text-txt">Clean {fmtBytes(totalSelected)}?</h3>
              <button onClick={() => !cleaning && setConfirming(false)} className="text-txt3 hover:text-txt"><X size={18} /></button>
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-txt2">
              This permanently removes the selected caches. They're all regenerable — Windows and your games
              rebuild them automatically, so nothing important is lost. Files currently in use are skipped.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirming(false)} disabled={cleaning} className="rounded-btn border border-edge bg-card px-4 py-2 text-[12px] font-medium text-txt2 hover:text-txt disabled:opacity-40">Cancel</button>
              <button onClick={() => void doClean()} disabled={cleaning} className="rounded-btn bg-accent px-4 py-2 text-[12px] font-bold text-white disabled:opacity-40">
                {cleaning ? "Cleaning…" : "Clean now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
