import { useEffect, useState } from "react";
import {
  Bot,
  Cpu,
  Download,
  ExternalLink,
  FolderOpen,
  Gamepad2,
  Info,
  KeyRound,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldCheck,
  Wifi,
  Zap,
} from "lucide-react";
import { useSystemStore } from "../store/systemStore";
import { useSettingsStore } from "../store/settingsStore";
import { useAiStore } from "../store/aiStore";
import { getUpdateInfo, openLogsFolder } from "../lib/backend";
import { nvidiaKey, tavilyKey, saveApiKey } from "../lib/aiConfig";
import { NVIDIA_KEYS_URL, openExternal } from "../lib/links";
import { toast } from "../store/toastStore";
import Toggle from "../components/Toggle";
import UpdateModal from "../components/UpdateModal";
import type { UpdateInfo } from "../lib/types";

// One API-key row: masked input, save/clear, and an honest set/not-set state —
// the value is never shown back (we only ever learn whether one exists).
function ApiKeyRow({
  label,
  hint,
  isSet,
  onSave,
  required,
}: {
  label: string;
  hint: string;
  isSet: boolean;
  onSave: (value: string) => Promise<void>;
  required?: boolean;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (v: string) => {
    setBusy(true);
    await onSave(v);
    setBusy(false);
    setValue("");
  };
  return (
    <div className="border-b border-edge py-3 last:border-0">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-txt">{label}</p>
        <span className={`text-[11px] font-semibold ${isSet ? "text-success" : required ? "text-warning" : "text-txt3"}`}>
          {isSet ? "● Key set" : required ? "● Not set — AI is off" : "○ Optional — not set"}
        </span>
      </div>
      <p className="mt-0.5 text-[11.5px] text-txt2">{hint}</p>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={isSet ? "Enter a new key to replace it…" : "Paste your key…"}
          className="flex-1 rounded-btn border border-edge bg-bg px-3 py-2 text-[12.5px] text-txt placeholder:text-txt3 focus:border-accent/40 focus:outline-none"
        />
        <button
          onClick={() => void save(value)}
          disabled={busy || !value.trim()}
          className="rounded-btn bg-accent px-4 py-2 text-[12px] font-semibold text-white hover:bg-accent-hi disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {isSet && (
          <button
            onClick={() => void save("")}
            disabled={busy}
            className="rounded-btn border border-edge bg-bg px-3 py-2 text-[12px] font-medium text-txt2 hover:text-txt disabled:opacity-40"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

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
  const shareOnlineStatus = useSettingsStore((s) => s.shareOnlineStatus);
  const autoApplyEnabled = useSettingsStore((s) => s.autoApplyEnabled);
  const setAutoApplyEnabled = useSettingsStore((s) => s.setAutoApplyEnabled);
  const setShareOnlineStatus = useSettingsStore((s) => s.setShareOnlineStatus);
  const readyCheckEnabled = useSettingsStore((s) => s.readyCheckEnabled);
  const setReadyCheckEnabled = useSettingsStore((s) => s.setReadyCheckEnabled);
  const clearMessages = useAiStore((s) => s.clearMessages);

  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);

  // Whether each AI key currently resolves to a value (saved override OR a
  // compiled-in default). We only ever learn set/not-set, never the value.
  const [nvSet, setNvSet] = useState(false);
  const [tvSet, setTvSet] = useState(false);
  const refreshKeys = async () => {
    setNvSet(!!(await nvidiaKey()));
    setTvSet(!!(await tavilyKey()));
  };
  useEffect(() => {
    void refreshKeys();
  }, []);

  const checkUpdates = async () => {
    setChecking(true);
    setUpdateStatus(null);
    const info = await getUpdateInfo();
    setChecking(false);
    setLastChecked(Date.now());
    setUpdateInfo(info);
    if (info?.available) {
      setUpdateStatus(`Update available: v${info.version}`);
      toast.success("Update available", `Version ${info.version} is ready to install in-app.`);
    } else {
      setUpdateStatus("You're on the latest version.");
      toast.success("Up to date", "You're on the latest version.");
    }
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
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={() => void checkUpdates()} disabled={checking} className="flex items-center gap-2 rounded-btn border border-edge bg-bg px-4 py-2 text-[12.5px] font-medium text-txt hover:border-edge2 disabled:opacity-60">
            <RefreshCw size={14} className={checking ? "animate-spin" : ""} />
            {checking ? "Checking…" : "Check for Updates"}
          </button>
          {updateInfo?.available && (
            <button
              onClick={() => setShowUpdate(true)}
              className="glint flex items-center gap-2 rounded-btn bg-accent px-4 py-2 text-[12.5px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi"
            >
              <Download size={14} /> Update to v{updateInfo.version}
            </button>
          )}
          {updateStatus && <span className="text-[12px] text-txt2">{updateStatus}</span>}
        </div>
        <p className="mt-2 text-[10.5px] text-txt3">
          Updates download and install in-app with a progress bar — nothing ever opens in your browser.
        </p>
      </Section>

      {showUpdate && updateInfo && (
        <UpdateModal version={updateInfo.version} onClose={() => setShowUpdate(false)} />
      )}

      {/* Advanced */}
      <Section icon={Cpu} title="Advanced">
        <div className="flex items-center justify-between py-1">
          <div className="pr-4">
            <p className="flex items-center gap-2 text-[13px] font-medium text-txt">
              <Bot size={14} className="text-accent" /> AI Assistant
            </p>
            <p className="mt-0.5 text-[11.5px] text-txt2">
              Turn the Mujify AI assistant on or off. It uses your own free NVIDIA NIM key (set it
              below). Disabling it clears the current chat and hides the AI page.
            </p>
          </div>
          <Toggle on={aiEnabled} onClick={toggleAi} />
        </div>
        <div className="flex items-center justify-between border-t border-edge py-3">
          <div className="pr-4">
            <p className="flex items-center gap-2 text-[13px] font-medium text-txt">
              <Gamepad2 size={14} className="text-accent" /> Pre-game Ready Check
            </p>
            <p className="mt-0.5 text-[11.5px] text-txt2">
              A quick read-only pre-flight (thermals, background apps, refresh rate, power plan) shown for a few
              seconds when a game launches. Never changes anything on its own.
            </p>
          </div>
          <Toggle on={readyCheckEnabled} onClick={() => setReadyCheckEnabled(!readyCheckEnabled)} />
        </div>
        <div className="flex items-center justify-between border-t border-edge py-3">
          <div className="pr-4">
            <p className="flex items-center gap-2 text-[13px] font-medium text-txt">
              <Zap size={14} className="text-accent" /> Auto-apply game profiles
            </p>
            <p className="mt-0.5 text-[11.5px] text-txt2">
              Master switch. When ON, any game profile you've also marked "Auto-apply on launch" applies its tweaks the
              moment that game starts and reverts them automatically when it closes — all logged and reversible. Both
              this switch and the per-game toggle must be on, so nothing ever changes on its own.
            </p>
          </div>
          <Toggle on={autoApplyEnabled} onClick={() => setAutoApplyEnabled(!autoApplyEnabled)} />
        </div>
      </Section>

      {/* AI Assistant — API keys (bring your own, stored locally) */}
      <Section icon={KeyRound} title="AI Assistant — API key">
        <p className="mb-1 text-[12px] leading-relaxed text-txt2">
          The AI Assistant runs on NVIDIA's free NIM API. Add your own key to turn it on — it's{" "}
          <span className="font-semibold text-txt">free</span>, takes a minute, and is stored only on this
          PC (<span className="font-mono text-[11px]">%AppData%\MujifyTweaks\config.json</span>). Nothing is
          ever uploaded or shared.
        </p>
        <button
          onClick={() => void openExternal(NVIDIA_KEYS_URL)}
          className="mb-1 inline-flex items-center gap-1.5 text-[12px] font-semibold text-accent hover:underline"
        >
          Get a free NVIDIA API key <ExternalLink size={12} />
        </button>
        <ApiKeyRow
          label="NVIDIA NIM key"
          hint="Required for the AI Assistant. Starts with “nvapi-”."
          isSet={nvSet}
          required
          onSave={async (v) => {
            await saveApiKey("nvidia", v);
            await refreshKeys();
            toast.success(v ? "NVIDIA key saved" : "NVIDIA key cleared", v ? "The AI Assistant is ready." : "The AI Assistant is off until you add a key.");
          }}
        />
        <ApiKeyRow
          label="Tavily key (web search)"
          hint="Optional. Only needed if you want the assistant to search the live web. Starts with “tvly-”."
          isSet={tvSet}
          onSave={async (v) => {
            await saveApiKey("tavily", v);
            await refreshKeys();
            toast.success(v ? "Tavily key saved" : "Tavily key cleared", v ? "Web search is available in chat." : "Web search is off.");
          }}
        />
      </Section>

      {/* Privacy */}
      <Section icon={ShieldCheck} title="Privacy">
        <div className="flex items-center justify-between py-1">
          <div className="pr-4">
            <p className="flex items-center gap-2 text-[13px] font-medium text-txt">
              <Wifi size={14} className="text-accent" /> Share anonymous online status
            </p>
            <p className="mt-0.5 text-[11.5px] text-txt2">
              Sends a single anonymous "online" ping every 5 minutes — app version only, nothing else.
              No personal data, no machine id. On by default and openly disclosed; one-click off, anytime.
            </p>
          </div>
          <Toggle on={shareOnlineStatus} onClick={() => setShareOnlineStatus(!shareOnlineStatus)} />
        </div>
        <p className="mt-2 text-[10.5px] text-txt3">
          No personal data. No tracking. No account. Everything else stays 100% on this PC.
        </p>
      </Section>

      {/* About */}
      <Section icon={Info} title="About">
        <Row label="App" value="Mujify Tweaks" />
        <Row label="Version" value={backendVersion ? `v${backendVersion}` : "—"} />
        <Row label="Backend core" value={backendConnected ? "Connected" : "Disconnected"} tone={backendConnected ? "text-success" : "text-txt3"} />
        <Row label="This PC" value={hardware ? hardware.cpuName : "Detecting…"} />
        <Row label="Privacy" value="No personal data · no tracking · no account" />
        <p className="mt-3 text-[12px] leading-relaxed text-txt2">
          A free Windows gaming optimizer with per-game profiles and proof reports. Every system
          change is confirmed first, logged in plain English, and fully reversible — nothing is ever
          applied without your click.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <button onClick={() => void openLogsFolder()} className="flex items-center gap-2 text-[12px] font-medium text-txt2 hover:text-txt">
            <FolderOpen size={14} /> Open logs folder
          </button>
        </div>
        <p className="mt-2 text-[10.5px] text-txt3">
          Logs are stored locally at %AppData%\MujifyTweaks\logs to help you report bugs — no personal data leaves your PC.
        </p>
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
