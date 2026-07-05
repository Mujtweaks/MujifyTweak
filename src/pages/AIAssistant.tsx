import { useEffect, useState } from "react";
import { Bot, Eye, KeyRound, Search, Send, ShieldCheck, Wrench } from "lucide-react";
import type { PageId } from "../lib/nav";

const CAPS = [
  { icon: Search, title: "Understands plain English", desc: "Describe a problem — it scans your PC to find the cause." },
  { icon: Wrench, title: "Proposes real fixes", desc: "Every fix shows a risk label and the exact change before anything runs." },
  { icon: ShieldCheck, title: "Confirm + undo", desc: "Nothing applies without your approval; each action gets an undo card." },
  { icon: Eye, title: "Sees your system", desc: "Live hardware, temps, FPS, drivers and the change log as context." },
];

export default function AIAssistant({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const [hasKey, setHasKey] = useState(false);
  useEffect(() => {
    setHasKey(!!localStorage.getItem("mujify_nvidia_key"));
  }, []);

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-btn bg-accent/10 shadow-[0_0_24px_rgba(227,0,14,0.15)]">
          <Bot size={22} strokeWidth={1.75} className="text-accent" />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-txt">AI Assistant</h1>
            <span className="rounded-pill bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-accent">v2.5 · Nemotron</span>
          </div>
          <p className="text-[12.5px] text-txt2">Your PC's expert — powered by NVIDIA Nemotron. Free, like everything here.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {CAPS.map((c) => (
          <div key={c.title} className="flex items-start gap-3 rounded-card border border-edge bg-card p-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-btn bg-bg">
              <c.icon size={16} strokeWidth={1.75} className="text-accent" />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-txt">{c.title}</p>
              <p className="mt-0.5 text-[11.5px] leading-snug text-txt2">{c.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Key status */}
      <div className="flex items-center gap-3 rounded-card border border-edge bg-card p-4">
        <KeyRound size={16} strokeWidth={1.75} className={hasKey ? "text-success" : "text-warning"} />
        <p className="flex-1 text-[12.5px] text-txt2">
          {hasKey ? "NVIDIA key detected — the assistant activates when chat ships in v2.5." : "Add your free NVIDIA NIM key in Settings to be ready when chat ships."}
        </p>
        <button onClick={() => onNavigate("settings")} className="rounded-btn border border-edge bg-bg px-3 py-1.5 text-[12px] font-medium text-txt hover:border-edge2">
          {hasKey ? "Manage key" : "Add key"}
        </button>
      </div>

      {/* Chat preview (disabled — honest) */}
      <div className="mt-auto rounded-card border border-edge bg-card p-4">
        <div className="flex items-center gap-2 rounded-btn border border-edge bg-bg px-3 py-2.5 opacity-60">
          <input disabled placeholder="Ask anything — e.g. “my game stutters, what's wrong?” (arrives in v2.5)" className="flex-1 bg-transparent text-[13px] text-txt placeholder:text-txt3 focus:outline-none" />
          <Send size={16} className="text-txt3" />
        </div>
        <p className="mt-2 text-center text-[10.5px] text-txt3">Live chat is the next major phase. The whole safe-apply pipeline it needs is already built and tested.</p>
      </div>
    </div>
  );
}
