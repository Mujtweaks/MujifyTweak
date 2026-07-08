import { useState } from "react";
import {
  Bot,
  Cpu,
  Download,
  ExternalLink,
  Info,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldCheck,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useSystemStore } from "../store/systemStore";
import { useSettingsStore } from "../store/settingsStore";
import { useAiStore } from "../store/aiStore";
import { checkForUpdates } from "../lib/backend";
import { toast } from "../store/toastStore";
import { isTauri } from "../lib/tauri";
import Toggle from "../components/Toggle";

// PLACEHOLDER repo slug — swap in the real one when the repo goes public. The
// Tauri updater endpoint (tauri.conf.json) uses the SAME slug, so update both.
const REPO_URL = "https://github.com/mujify/mujify-tweaks";

function Section({ icon: Icon, title, children }: { icon: typeof Info; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-edge bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={15} strokeWidth={1.75} className="text-accent" />
        <h2 className="text-[13px] font-semibold text-txt">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-edge py-2.5 text-[13px] last:border-0">
      <span className="text-txt2">{label}</span>
      <span className={tone ?? "text-txt"}>{value}</span>
    </div>
  );
}

export default function Settings() {
  const backendConnected = useSystemStore((s) => s.backendConnected);
  const backendVersion = useSystemStore((s) => s.backendVersion);
  const hardware = useSystemStore((s) => s.hardware);

  const aiEnabled = useSettingsStore((s) => s.aiEnabled);
  const setAiEnabled = useSettingsStore((s) => s.setAiEnabled);
  const clearMessages = useAiStore((s) => s.clearMessages);

  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);

  const checkUpdates = async () => {
    setChecking(true);
    setUpdateStatus(null);
    const res = await checkForUpdates();
    setChecking(false);
    setLastChecked(Date.now());
    setUpdateStatus(res.message);
    if (res.ok) toast.success("Update check complete", res.message);
    else toast.warning("Update check", res.message);
  };

  const toggleAi = () => {
    const next = !aiEnabled;
    setAiEnabled(next);
    if (!next) clearMessages();
    toast.info(
      next ? "AI assistant enabled" : "AI assistant disabled",
      next ? "The AI page is available again." : "Chat cleared and the AI page is now off.",
    );
  };

  const openRepo = () => {
    if (isTauri) void openUrl(REPO_URL).catch(() => toast.error("Couldn't open link"));
    else window.open(REPO_URL, "_blank");
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-btn bg-accent/10">
          <SettingsIcon size={18} strokeWidth={1.75} className="text-accent" />
        </span>
        <h1 className="text-2xl font-bold text-txt">Settings</h1>
      </div>

      {/* Auto-Update */}
      <Section icon={Download} title="Auto-Update">
        <Row label="Current version" value={backendVersion ? `v${backendVersion}` : "—"} />
        <Row label="Last checked" value={lastChecked ? new Date(lastChecked).toLocaleString() : "Never"} />
        <div className="mt-3 flex items-center gap-3">
          <button onClick={() => void checkUpdates()} disabled={checking} className="flex items-center gap-2 rounded-btn border border-edge bg-bg px-4 py-2 text-[12.5px] font-medium text-txt hover:border-edge2 disabled:opacity-60">
            <RefreshCw size={14} className={checking ? "animate-spin" : ""} />
            {checking ? "Checking…" : "Check for Updates"}
          </button>
          {updateStatus && <span className="text-[12px] text-txt2">{updateStatus}</span>}
        </div>
        <p className="mt-2 text-[10.5px] text-txt3">Signed updates install in the background once public releases are published.</p>
      </Section>

      {/* Advanced */}
      <Section icon={Cpu} title="Advanced">
        <div className="flex items-center justify-between py-1">
          <div className="pr-4">
            <p className="flex items-center gap-2 text-[13px] font-medium text-txt">
              <Bot size={14} className="text-accent" /> AI Assistant
            </p>
            <p className="mt-0.5 text-[11.5px] text-txt2">
              Turn the Mujify AI assistant on or off. It runs on a built-in key — no setup needed.
              Disabling it clears the current chat and hides the AI page.
            </p>
          </div>
          <Toggle on={aiEnabled} onClick={toggleAi} />
        </div>
      </Section>

      {/* About */}
      <Section icon={Info} title="About">
        <Row label="App" value="Mujify Tweaks" />
        <Row label="Version" value={backendVersion ? `v${backendVersion}` : "—"} />
        <Row label="Backend core" value={backendConnected ? "Connected" : "Disconnected"} tone={backendConnected ? "text-success" : "text-txt3"} />
        <Row label="This PC" value={hardware ? hardware.cpuName : "Detecting…"} />
        <Row label="Telemetry" value="None — nothing leaves this PC" />
        <p className="mt-3 text-[12px] leading-relaxed text-txt2">
          A free Windows gaming optimizer with per-game profiles and proof reports. Every system
          change is confirmed first, logged in plain English, and fully reversible — nothing is ever
          applied without your click.
        </p>
        <button onClick={openRepo} className="mt-3 flex items-center gap-2 text-[12px] font-medium text-accent hover:text-accent-hi">
          <ExternalLink size={14} /> View on GitHub
        </button>
      </Section>

      {/* Safety */}
      <Section icon={ShieldCheck} title="Safety">
        <p className="text-[12px] leading-relaxed text-txt2">
          Anti-cheat-unsafe operations (injection, driver hooks) are permanently blocked — even the
          AI can't override that. 100% free, no accounts, no paywall.
        </p>
      </Section>
    </div>
  );
}
