import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ListChecks, RotateCcw, ShieldCheck } from "lucide-react";
import { getChangeLog, revertAll, revertSingle } from "../lib/backend";
import { isTauri } from "../lib/tauri";
import RiskLabel from "../components/RiskLabel";
import type { ChangeLogEntry } from "../lib/types";

/** Real change log — every applied tweak, with per-entry and full undo. */
export default function ChangeLogView() {
  const [entries, setEntries] = useState<ChangeLogEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setEntries(await getChangeLog());
  }, []);

  useEffect(() => {
    void refresh();
    if (!isTauri) return;
    const uns: Array<() => void> = [];
    listen("change_log_update", () => void refresh()).then((u) => uns.push(u));
    listen("change_log_reverted", () => void refresh()).then((u) => uns.push(u));
    return () => uns.forEach((u) => u());
  }, [refresh]);

  const undoOne = async (id: string) => {
    setBusy(true);
    await revertSingle(id);
    await refresh();
    setBusy(false);
  };

  const undoAll = async () => {
    setBusy(true);
    await revertAll();
    await refresh();
    setBusy(false);
  };

  const active = entries.filter((e) => !e.undone);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <ListChecks size={26} strokeWidth={1.75} className="text-accent" />
            <h1 className="text-[42px] font-black uppercase leading-none tracking-tight text-txt">Change Log</h1>
          </div>
          <p className="mt-1 max-w-lg text-[12.5px] text-txt2">
            Every change Mujify has made, in plain English — with the exact before-state saved so any
            of it can be undone. Nothing is ever hidden or permanent.
          </p>
        </div>
        {active.length > 0 && (
          <button
            onClick={undoAll}
            disabled={busy}
            className="flex items-center gap-2 rounded-xl border border-edge bg-panel px-3.5 py-2 text-[12px] font-semibold text-txt hover:border-accent/40 hover:text-accent disabled:opacity-60"
          >
            <RotateCcw size={14} strokeWidth={2} />
            Revert All ({active.length})
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-edge bg-panel py-16">
          <div className="text-center">
            <ShieldCheck size={26} strokeWidth={1.5} className="mx-auto text-txt3" />
            <p className="mt-2 text-[13px] font-semibold text-txt">No changes yet</p>
            <p className="mt-1 max-w-[300px] text-[11.5px] text-txt2">
              When you apply a tweak from the Optimizer or Tweaks tab, it appears here — each one
              undoable. Your system is currently untouched.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((e) => (
            <div
              key={e.id}
              className={`flex items-center gap-3 rounded-xl border border-edge bg-panel px-4 py-3 ${
                e.undone ? "opacity-55" : ""
              }`}
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${e.undone ? "bg-txt3" : "bg-good"}`}
              />
              <div className="min-w-0 flex-1">
                <p className={`text-[13px] text-txt ${e.undone ? "line-through" : ""}`}>
                  {e.description}
                </p>
                <p className="text-[10.5px] text-txt3">
                  {new Date(e.timestamp).toLocaleString()}
                  {e.undone && " · reverted"}
                </p>
              </div>
              <RiskLabel level={e.riskLevel} />
              {e.reversible && !e.undone ? (
                <button
                  onClick={() => undoOne(e.id)}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-lg border border-edge bg-panel2 px-2.5 py-1.5 text-[11.5px] font-medium text-txt hover:border-edge2 disabled:opacity-60"
                >
                  <RotateCcw size={12} strokeWidth={2} />
                  Undo
                </button>
              ) : (
                <span className="text-[10.5px] text-txt3">
                  {e.undone ? "Undone" : "One-shot"}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
