import { Settings as SettingsIcon } from "lucide-react";
import { useSystemStore } from "../store/systemStore";

/**
 * Settings shell — grows an API Keys section at v2.5 (NVIDIA NIM + Tavily,
 * stored in local config, never committed) and updater controls once the
 * GitHub Releases pipeline exists.
 */
export default function Settings() {
  const backendConnected = useSystemStore((s) => s.backendConnected);
  const backendVersion = useSystemStore((s) => s.backendVersion);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-accent/30 bg-accent/10">
          <SettingsIcon size={18} strokeWidth={1.75} className="text-accent" />
        </span>
        <h1 className="font-display text-2xl font-bold tracking-wide text-txt">
          Settings
        </h1>
      </div>

      <div className="flex flex-col gap-3">
        <section className="rounded-2xl border border-edge bg-panel p-4">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-txt2">
            About
          </h2>
          <div className="mt-3 flex flex-col gap-2 text-[13px]">
            <div className="flex justify-between">
              <span className="text-txt2">App version</span>
              <span className="text-txt">{backendVersion ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-txt2">Backend core</span>
              <span className={backendConnected ? "text-good" : "text-txt3"}>
                {backendConnected ? "Connected" : "Not connected"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-txt2">Telemetry</span>
              <span className="text-txt">None — nothing ever leaves this PC</span>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-edge bg-panel p-4">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-txt2">
            Coming Here Soon
          </h2>
          <ul className="mt-3 flex flex-col gap-1.5 text-[12.5px] text-txt2">
            <li>· Auto-update from GitHub Releases (end of v1.0)</li>
            <li>· AI API keys — NVIDIA NIM + Tavily (v2.5)</li>
            <li>· Overlay position &amp; hotkey (v3.5)</li>
            <li>· Scheduled optimization (v3.5)</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
