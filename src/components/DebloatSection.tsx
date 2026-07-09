import { useEffect, useMemo, useState } from "react";
import { PackageX, Trash2, X } from "lucide-react";
import { removeBloatware, scanBloatware } from "../lib/backend";
import type { BloatApp } from "../lib/types";

// Debloat — list allowlisted preinstalled Store apps and remove them one at a
// time behind a confirm. Honest: removal isn't a captured-state revert, it's
// reinstallable from the Store — the copy says exactly that. Read-only until the
// user clicks Remove and confirms.
export default function DebloatSection() {
  const [apps, setApps] = useState<BloatApp[] | null>(null);
  const [confirming, setConfirming] = useState<BloatApp | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = async () => setApps(await scanBloatware());
  useEffect(() => {
    void load();
  }, []);

  const grouped = useMemo(() => {
    const m = new Map<string, BloatApp[]>();
    (apps ?? []).forEach((a) => m.set(a.category, [...(m.get(a.category) ?? []), a]));
    return [...m.entries()];
  }, [apps]);

  const doRemove = async () => {
    if (!confirming) return;
    setRemoving(true);
    const ok = await removeBloatware(confirming);
    setRemoving(false);
    if (ok) setApps((prev) => (prev ?? []).filter((a) => a.packageFullName !== confirming.packageFullName));
    setConfirming(null);
  };

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15">
          <PackageX size={18} strokeWidth={1.75} className="text-accent" />
        </span>
        <div>
          <h2 className="text-[16px] font-bold text-txt">Debloat</h2>
          <p className="text-[11.5px] text-txt2">
            Remove preinstalled Microsoft apps you don't use. Safe list only — nothing system-critical. Each is
            reinstallable anytime from the Microsoft Store.
          </p>
        </div>
      </div>

      {apps === null ? (
        <p className="py-6 text-center text-[12px] text-txt3">Scanning installed apps…</p>
      ) : apps.length === 0 ? (
        <p className="rounded-card border border-edge bg-card px-4 py-6 text-center text-[12.5px] text-txt2">
          No removable bloat found — your PC is already clean. 🎉
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map(([cat, list]) => (
            <div key={cat}>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-txt3">{cat}</p>
              <div className="grid grid-cols-2 gap-2.5">
                {list.map((a) => (
                  <div key={a.packageFullName} className="flex items-center justify-between rounded-chip border border-edge bg-card px-3.5 py-2.5">
                    <span className="truncate text-[12.5px] text-txt">{a.name}</span>
                    <button
                      onClick={() => setConfirming(a)}
                      className="flex shrink-0 items-center gap-1.5 rounded-btn border border-edge bg-bg px-2.5 py-1.5 text-[11px] font-medium text-txt2 hover:border-accent/40 hover:text-accent"
                    >
                      <Trash2 size={12} /> Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => !removing && setConfirming(null)}>
          <div className="w-full max-w-[400px] rounded-card border border-edge bg-panel p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h3 className="text-[16px] font-bold text-txt">Remove {confirming.name}?</h3>
              <button onClick={() => !removing && setConfirming(null)} className="text-txt3 hover:text-txt"><X size={18} /></button>
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-txt2">
              This uninstalls <span className="font-semibold text-txt">{confirming.name}</span> for your account. It's
              not a reversible tweak — but you can reinstall it anytime from the Microsoft Store. It'll be recorded in
              your Change Log.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirming(null)} disabled={removing} className="rounded-btn border border-edge bg-card px-4 py-2 text-[12px] font-medium text-txt2 hover:text-txt disabled:opacity-40">Cancel</button>
              <button onClick={() => void doRemove()} disabled={removing} className="rounded-btn bg-accent px-4 py-2 text-[12px] font-bold text-white disabled:opacity-40">
                {removing ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
