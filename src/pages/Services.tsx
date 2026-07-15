import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, RefreshCw, Server, Zap } from "lucide-react";
import ApplyConfirmModal from "../components/ApplyConfirmModal";
import RiskLabel from "../components/RiskLabel";
import { fetchServices } from "../lib/backend";
import type { ServiceStatus, TweakInfo } from "../lib/types";

/** A service row is applied through the ordinary tweak pipeline, so hand the
 *  confirm modal the same shape everything else uses. */
const asTweak = (s: ServiceStatus): TweakInfo => ({
  id: s.id,
  title: s.title,
  description: s.description,
  category: "system",
  risk: s.risk,
  impact: s.recommended ? 3 : 2,
  applied: s.startType === "disabled",
  available: s.present,
  appliable: s.present,
  warning: s.warning,
});

export default function Services() {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [busy, setBusy] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<TweakInfo[] | null>(null);

  const reload = async () => {
    setBusy(true);
    const s = await fetchServices();
    setServices(s);
    setSelected(new Set());
    setBusy(false);
  };
  useEffect(() => {
    void reload();
  }, []);

  // A service that isn't installed on this PC gets no row — an offer we can't
  // honour is worse than no offer.
  const rows = useMemo(() => services.filter((s) => s.present), [services]);
  const off = useMemo(() => rows.filter((s) => s.startType === "disabled"), [rows]);
  const on = useMemo(() => rows.filter((s) => s.startType !== "disabled"), [rows]);

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const selectRecommended = () =>
    setSelected(new Set(on.filter((s) => s.recommended).map((s) => s.name)));

  const chosen = on.filter((s) => selected.has(s.name));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[42px] font-black uppercase leading-none tracking-tight text-txt">Services</h1>
          <p className="mt-1.5 max-w-[560px] text-[14px] text-txt2">
            Windows background services you can safely turn off. Every one is read live from your PC,
            every change is logged in plain English, and every change can be undone from the Change Log.
          </p>
        </div>
        <button
          onClick={() => void reload()}
          className="flex items-center gap-2 rounded-btn border border-edge bg-card px-4 py-2 text-[12px] font-medium text-txt2 hover:text-txt"
        >
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Rescan
        </button>
      </div>

      {/* Honest framing: this is not where big FPS comes from. */}
      <p className="flex items-start gap-2 rounded-chip border border-edge bg-card px-3.5 py-2.5 text-[11.5px] leading-relaxed text-txt2">
        <Server size={14} className="mt-0.5 shrink-0 text-accent" />
        Turning services off frees RAM and stops background disk and CPU work. On most PCs that means
        steadier frame times rather than a big average-FPS jump — the honest win. Mujify only lists
        services it can explain; it will never offer to disable audio, networking, Windows Update or
        Defender, because that breaks Windows rather than speeding it up.
      </p>

      <div className="flex items-center gap-2">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-txt2">Running</h2>
        <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[11px] font-bold text-blue-400">{on.length}</span>
        <div className="flex-1" />
        {on.some((s) => s.recommended) && (
          <button
            onClick={selectRecommended}
            className="rounded-btn border border-edge bg-card px-3 py-1.5 text-[11.5px] font-medium text-txt2 hover:text-txt"
          >
            Select recommended
          </button>
        )}
      </div>

      {busy ? (
        <p className="py-16 text-center text-[13px] text-txt3">Reading your services…</p>
      ) : on.length === 0 ? (
        <p className="rounded-chip border border-edge bg-card px-3 py-6 text-center text-[12.5px] text-txt2">
          Nothing left to turn off — every service Mujify manages is already disabled on this PC.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {on.map((s) => {
            const picked = selected.has(s.name);
            return (
              <li key={s.name}>
                <button
                  onClick={() => toggle(s.name)}
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
                      <p className="text-[13px] font-semibold text-txt">{s.title}</p>
                      <span className="rounded bg-edge px-1.5 py-0.5 font-mono text-[9.5px] text-txt3">{s.name}</span>
                      {s.recommended && (
                        <span className="rounded bg-success/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-success">
                          Recommended
                        </span>
                      )}
                      {s.running ? (
                        <span className="text-[9.5px] uppercase tracking-wide text-txt3">running · {s.startType}</span>
                      ) : (
                        <span className="text-[9.5px] uppercase tracking-wide text-txt3">stopped · {s.startType}</span>
                      )}
                    </div>
                    <p className="mt-1 text-[11.5px] leading-snug text-txt2">{s.description}</p>
                    {/* Only the services with a real cost carry one of these. */}
                    {s.warning && (
                      <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-warning">
                        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                        {s.warning}
                      </p>
                    )}
                  </div>
                  <RiskLabel level={s.risk} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {off.length > 0 && (
        <>
          <div className="flex items-center gap-2 pt-2">
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-txt2">Already off</h2>
            <span className="rounded-full bg-success/20 px-2 py-0.5 text-[11px] font-bold text-success">{off.length}</span>
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {off.map((s) => (
              <li
                key={s.name}
                className="flex items-center gap-1.5 rounded-chip border border-edge bg-bg px-2.5 py-1.5 text-[11px] text-txt3"
              >
                <Check size={11} className="text-success" strokeWidth={3} /> {s.title}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-txt3">
            Turn any of these back on from the Change Log, which restores the exact start type it had
            before Mujify touched it.
          </p>
        </>
      )}

      {/* Sticky apply bar */}
      {chosen.length > 0 && (
        <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-card border border-edge bg-panel px-4 py-3 shadow-2xl">
          <p className="text-[12px] text-txt2">
            <span className="font-bold text-txt">{chosen.length}</span> service{chosen.length === 1 ? "" : "s"} selected
            {chosen.some((s) => s.warning) && (
              <span className="ml-2 text-warning">· some have a real tradeoff — read the notes above</span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-btn border border-edge bg-card px-3.5 py-2 text-[12px] font-medium text-txt2 hover:text-txt"
            >
              Clear
            </button>
            <button
              onClick={() => setConfirm(chosen.map(asTweak))}
              className="flex items-center gap-2 rounded-btn bg-accent px-4 py-2 text-[12.5px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi"
            >
              <Zap size={14} strokeWidth={2.25} fill="currentColor" />
              Disable {chosen.length}
            </button>
          </div>
        </div>
      )}

      {confirm && (
        <ApplyConfirmModal
          tweaks={confirm}
          title={`Disable ${confirm.length} service${confirm.length === 1 ? "" : "s"}`}
          notice="Disabling a service needs admin rights. If Mujify isn't running as administrator the change is refused and reported — never silently skipped."
          onClose={() => setConfirm(null)}
          onApplied={() => {
            setConfirm(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}
