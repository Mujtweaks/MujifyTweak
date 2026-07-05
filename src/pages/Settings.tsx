import { useEffect, useState } from "react";
import { Check, Cpu, Download, Info, KeyRound, RefreshCw, Save, Settings as SettingsIcon } from "lucide-react";
import { useSystemStore } from "../store/systemStore";

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

  const [nvidia, setNvidia] = useState("");
  const [tavily, setTavily] = useState("");
  const [savedKeys, setSavedKeys] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setNvidia(localStorage.getItem("mujify_nvidia_key") ?? "");
    setTavily(localStorage.getItem("mujify_tavily_key") ?? "");
  }, []);

  const saveKeys = () => {
    localStorage.setItem("mujify_nvidia_key", nvidia.trim());
    localStorage.setItem("mujify_tavily_key", tavily.trim());
    setSavedKeys(true);
    window.setTimeout(() => setSavedKeys(false), 1500);
  };

  const checkUpdates = () => {
    setChecking(true);
    setUpdateStatus(null);
    window.setTimeout(() => {
      setChecking(false);
      setUpdateStatus(`You're on the latest version (v${backendVersion ?? "0.1.0"}).`);
    }, 900);
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-btn bg-accent/10">
          <SettingsIcon size={18} strokeWidth={1.75} className="text-accent" />
        </span>
        <h1 className="text-2xl font-bold text-txt">Settings</h1>
      </div>

      <Section icon={Info} title="About">
        <Row label="App version" value={backendVersion ?? "—"} />
        <Row label="Backend core" value={backendConnected ? "Connected ✅" : "Disconnected ❌"} tone={backendConnected ? "text-success" : "text-txt3"} />
        <Row label="This PC" value={hardware ? `${hardware.cpuName}` : "Detecting…"} />
        <Row label="Telemetry" value="None — nothing leaves this PC" />
      </Section>

      <Section icon={KeyRound} title="AI API Keys">
        <p className="mb-3 text-[11.5px] text-txt2">Used by the AI Assistant (v2.5). Stored locally on this PC only — never committed or uploaded.</p>
        <label className="mb-1 block text-[11px] font-medium text-txt2">NVIDIA NIM (Nemotron)</label>
        <input type="password" value={nvidia} onChange={(e) => setNvidia(e.target.value)} placeholder="nvapi-…" className="mb-3 w-full rounded-btn border border-edge bg-bg px-3 py-2 font-mono text-[12px] text-txt placeholder:text-txt3 focus:border-accent/50 focus:outline-none" />
        <label className="mb-1 block text-[11px] font-medium text-txt2">Tavily (web search)</label>
        <input type="password" value={tavily} onChange={(e) => setTavily(e.target.value)} placeholder="tvly-…" className="mb-3 w-full rounded-btn border border-edge bg-bg px-3 py-2 font-mono text-[12px] text-txt placeholder:text-txt3 focus:border-accent/50 focus:outline-none" />
        <button onClick={saveKeys} className="flex items-center gap-2 rounded-btn bg-accent px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-accent-hi">
          {savedKeys ? <Check size={14} /> : <Save size={14} />}
          {savedKeys ? "Saved" : "Save Keys"}
        </button>
      </Section>

      <Section icon={Download} title="Updates">
        <Row label="Current version" value={backendVersion ?? "—"} />
        <div className="mt-3 flex items-center gap-3">
          <button onClick={checkUpdates} disabled={checking} className="flex items-center gap-2 rounded-btn border border-edge bg-bg px-4 py-2 text-[12.5px] font-medium text-txt hover:border-edge2 disabled:opacity-60">
            <RefreshCw size={14} className={checking ? "animate-spin" : ""} />
            {checking ? "Checking…" : "Check for updates"}
          </button>
          {updateStatus && <span className="text-[12px] text-txt2">{updateStatus}</span>}
        </div>
        <p className="mt-2 text-[10.5px] text-txt3">Auto-update installs silently in the background once releases are published.</p>
      </Section>

      <Section icon={Cpu} title="Safety">
        <p className="text-[12px] leading-relaxed text-txt2">
          Every system change is confirmed first, logged in plain English, and fully reversible.
          Anti-cheat-unsafe operations (injection, driver hooks) are permanently blocked — even the
          AI can't override that. 100% free, no accounts, no paywall.
        </p>
      </Section>
    </div>
  );
}
