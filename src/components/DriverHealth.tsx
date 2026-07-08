import { useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck, Stethoscope, Wrench, X } from "lucide-react";
import { repairDrivers, scanDeviceHealth } from "../lib/backend";
import type { DeviceIssue } from "../lib/types";

/**
 * Driver Health — scans for devices reporting a problem (Device Manager's
 * yellow-warning devices) and offers the SAFE repair: a restore point first,
 * then Windows' own driver re-scan. Never downloads a third-party driver, and
 * the repair only runs after the confirmation modal.
 */
export default function DriverHealth() {
  const [issues, setIssues] = useState<DeviceIssue[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [repairing, setRepairing] = useState(false);

  const scan = async () => {
    setScanning(true);
    setIssues(await scanDeviceHealth());
    setScanning(false);
  };

  const doRepair = async () => {
    setRepairing(true);
    await repairDrivers();
    setRepairing(false);
    setConfirm(false);
  };

  return (
    <div className="rounded-2xl border border-edge bg-panel p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-txt2">
          <Stethoscope size={14} /> Driver Health
        </p>
        <button
          onClick={() => void scan()}
          disabled={scanning}
          className="flex items-center gap-2 rounded-btn border border-edge bg-bg px-3.5 py-2 text-[12px] font-medium text-txt hover:border-edge2 disabled:opacity-60"
        >
          <RefreshCw size={14} className={scanning ? "animate-spin" : ""} />
          {scanning ? "Scanning…" : "Scan Devices"}
        </button>
      </div>

      {issues === null ? (
        <p className="py-6 text-center text-[12px] text-txt3">
          Scan for devices with driver problems — the ones Device Manager flags with a yellow warning.
        </p>
      ) : issues.length === 0 ? (
        <div className="flex items-center gap-2 rounded-chip border border-success/25 bg-success/5 px-3 py-3 text-[12.5px] text-success">
          <CheckCircle2 size={16} /> No device problems detected — every driver reports healthy.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            {issues.map((d) => (
              <div key={d.instanceId + d.name} className="flex items-start gap-2.5 rounded-chip border border-edge bg-card px-3 py-2.5">
                <AlertTriangle size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-warning" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold text-txt">{d.name}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-txt2">
                    {d.errorText}{" "}
                    <span className="text-txt3">
                      (code {d.errorCode}
                      {d.class ? ` · ${d.class}` : ""})
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => setConfirm(true)}
            className="mt-3 flex items-center gap-2 rounded-btn bg-accent px-4 py-2 text-[12.5px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi"
          >
            <Wrench size={14} /> Repair Safely ({issues.length})
          </button>
        </>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-card border border-edge bg-panel shadow-2xl">
            <div className="flex items-center justify-between border-b border-edge px-5 py-4">
              <h2 className="text-[15px] font-bold text-txt">Repair drivers — the safe way</h2>
              <button onClick={() => setConfirm(false)} className="text-txt3 hover:text-txt">
                <X size={18} strokeWidth={2} />
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="text-[12.5px] leading-relaxed text-txt2">Mujify will, in order:</p>
              <ol className="mt-2 flex flex-col gap-1.5 text-[12px] text-txt">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 font-bold text-accent">1.</span>
                  Create a <span className="font-semibold">System Restore point</span> first — always, before any change.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 font-bold text-accent">2.</span>
                  Ask <span className="font-semibold">Windows itself</span> to re-scan and match signed drivers (Windows Update / in-box) by hardware ID.
                </li>
              </ol>
              <p className="mt-3 flex items-start gap-2 rounded-chip border border-warning/25 bg-warning/5 px-3 py-2 text-[11.5px] text-warning">
                <ShieldCheck size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
                It never downloads or installs a third-party driver — a wrong low-level driver can make a PC unbootable. If a device behaves worse afterward, use Device Manager → Roll Back Driver.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2.5 border-t border-edge px-5 py-4">
              <button onClick={() => setConfirm(false)} className="rounded-btn border border-edge bg-card px-4 py-2 text-[12.5px] font-medium text-txt2 hover:text-txt">
                Cancel
              </button>
              <button
                onClick={() => void doRepair()}
                disabled={repairing}
                className="flex items-center gap-2 rounded-btn bg-accent px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-accent-hi disabled:opacity-60"
              >
                <Wrench size={14} /> {repairing ? "Starting…" : "Create restore point & repair"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
