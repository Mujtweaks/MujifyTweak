import { useEffect, useState } from "react";
import { AlertTriangle, Clock, Plus, RotateCcw, ShieldCheck, Trash2, X } from "lucide-react";
import {
  createRestorePoint,
  deleteAllRestorePoints,
  listRestorePoints,
  restoreProtectionEnabled,
} from "../lib/backend";
import type { RestorePoint } from "../lib/types";

// Safety-first: a System Restore panel on the home screen. Read-only listing +
// two confirmed real actions (create / delete-all). Encourages a restore point
// before optimizing. Nothing runs without the user's click.
export default function RestorePointCard() {
  const [points, setPoints] = useState<RestorePoint[] | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [manage, setManage] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = async () => {
    const [pts, en] = await Promise.all([listRestorePoints(), restoreProtectionEnabled()]);
    setPoints(pts);
    setEnabled(en);
  };
  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    setBusy(true);
    await createRestorePoint("Mujify Tweaks — manual restore point");
    await load();
    setBusy(false);
  };

  const wipe = async () => {
    setBusy(true);
    await deleteAllRestorePoints();
    await load();
    setBusy(false);
    setConfirmDelete(false);
  };

  const latest = points?.[0] ?? null;
  const none = points !== null && points.length === 0;

  return (
    <div className="rounded-card border border-edge bg-card p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span className={`grid h-9 w-9 place-items-center rounded-xl ${none ? "bg-warning/15" : "bg-success/15"}`}>
            <ShieldCheck size={18} strokeWidth={1.75} className={none ? "text-warning" : "text-success"} />
          </span>
          <div>
            <p className="text-[14px] font-bold text-txt">System Restore</p>
            <p className="text-[11px] text-txt2">Your safety net — take a snapshot before you optimize.</p>
          </div>
        </div>
        <button onClick={() => setManage(true)} className="text-[11.5px] font-medium text-accent hover:text-accent-hi">
          Manage →
        </button>
      </div>

      {/* Status */}
      <div className="mt-4">
        {points === null ? (
          <span className="skeleton block h-4 w-40 rounded" />
        ) : enabled === false ? (
          <p className="flex items-center gap-2 text-[12px] text-warning">
            <AlertTriangle size={13} /> System Restore is turned off for this drive.
          </p>
        ) : none ? (
          <p className="flex items-center gap-2 text-[12px] text-warning">
            <AlertTriangle size={13} /> No restore point yet — create one before optimizing.
          </p>
        ) : (
          <p className="flex items-center gap-2 text-[12px] text-txt2">
            <Clock size={13} className="text-txt3" />
            Latest: <span className="text-txt">{latest?.description}</span> · {latest?.created}
            <span className="text-txt3">· {points.length} total</span>
          </p>
        )}
      </div>

      <button
        onClick={() => void create()}
        disabled={busy}
        className="glint mt-3 flex w-full items-center justify-center gap-2 rounded-btn bg-accent px-4 py-2.5 text-[13px] font-bold text-white shadow-[0_4px_20px_rgba(227,0,14,0.25)] hover:bg-accent-hi disabled:opacity-50"
      >
        <Plus size={15} strokeWidth={2.5} /> {busy ? "Working…" : "Create Restore Point"}
      </button>

      {/* Manage modal */}
      {manage && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => !busy && setManage(false)}>
          <div className="flex max-h-[80vh] w-full max-w-[520px] flex-col rounded-card border border-edge bg-panel" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-edge px-5 py-4">
              <div className="flex items-center gap-2.5">
                <RotateCcw size={16} className="text-accent" />
                <h3 className="text-[15px] font-bold text-txt">Restore Points</h3>
              </div>
              <button onClick={() => setManage(false)} className="text-txt3 hover:text-txt"><X size={18} /></button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {points === null ? (
                <p className="py-6 text-center text-[12px] text-txt3">Loading…</p>
              ) : points.length === 0 ? (
                <p className="py-8 text-center text-[12.5px] text-txt2">
                  No restore points found{enabled === false ? " — System Restore is off for this drive." : "."}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {points.map((p) => (
                    <div key={p.sequence} className="flex items-center justify-between rounded-chip border border-edge bg-card px-3.5 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-medium text-txt">{p.description}</p>
                        <p className="text-[10.5px] text-txt3">#{p.sequence} · {p.kind} · {p.created}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-edge px-5 py-4">
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={busy || (points?.length ?? 0) === 0}
                className="flex items-center gap-1.5 rounded-btn border border-edge bg-card px-3 py-2 text-[12px] font-medium text-txt2 hover:border-accent/40 hover:text-accent disabled:opacity-40"
              >
                <Trash2 size={13} /> Delete all
              </button>
              <button onClick={() => void create()} disabled={busy} className="flex items-center gap-2 rounded-btn bg-accent px-4 py-2 text-[12.5px] font-bold text-white hover:bg-accent-hi disabled:opacity-50">
                <Plus size={14} strokeWidth={2.5} /> {busy ? "Working…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hard confirm for the destructive delete-all */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onClick={() => !busy && setConfirmDelete(false)}>
          <div className="w-full max-w-[400px] rounded-card border border-warning/30 bg-panel p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5">
              <AlertTriangle size={20} className="text-warning" />
              <h3 className="text-[16px] font-bold text-txt">Delete ALL restore points?</h3>
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-txt2">
              Windows can only delete restore points <span className="font-semibold text-txt">all at once</span> — there's no
              per-point delete. This removes every snapshot you could roll back to. It does <span className="font-semibold text-txt">not</span> affect
              Mujify's own change log (your tweaks stay reversible), but you'll lose your Windows-level safety nets. Consider
              creating a fresh one right after.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(false)} disabled={busy} className="rounded-btn border border-edge bg-card px-4 py-2 text-[12px] font-medium text-txt2 hover:text-txt disabled:opacity-40">Cancel</button>
              <button onClick={() => void wipe()} disabled={busy} className="rounded-btn bg-warning px-4 py-2 text-[12px] font-bold text-black disabled:opacity-40">
                {busy ? "Deleting…" : "Delete all"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
