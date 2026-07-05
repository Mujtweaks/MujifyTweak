import { useEffect, useRef, useState } from "react";
import { Bot, Cpu, Send, Sparkles } from "lucide-react";
import { NEMOTRON_MODEL, nvidiaKey } from "../lib/aiConfig";
import { useSystemStore } from "../store/systemStore";
import { useGameStore } from "../store/gameStore";
import type { PageId } from "../lib/nav";

interface Msg {
  role: "user" | "assistant";
  text: string;
}

const QUICK = ["Why is my FPS low?", "Fix my high ping", "What did you change?", "Optimize my system"];

export default function AIAssistant({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const [keyReady, setKeyReady] = useState<boolean | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const stats = useSystemStore((s) => s.stats);
  const activeGame = useGameStore((s) => s.activeGame);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void nvidiaKey().then((k) => setKeyReady(!!k));
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const send = (text: string) => {
    const q = text.trim();
    if (!q) return;
    setInput("");
    setMsgs((m) => [
      ...m,
      { role: "user", text: q },
      {
        role: "assistant",
        text:
          "The live AI backend (NVIDIA Nemotron) is the next major phase — your key is configured and ready. Until then, the whole safe-apply pipeline it will use is already built: try the Optimizer or Tweaks tabs, and every change is confirmed and reversible.",
      },
    ]);
  };

  if (keyReady === false) {
    return (
      <div className="grid h-full place-items-center">
        <div className="max-w-sm text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-accent/10 shadow-[0_0_28px_rgba(227,0,14,0.18)]"><Bot size={30} strokeWidth={1.5} className="text-accent" /></span>
          <h1 className="mt-4 text-xl font-bold text-txt">Set up your API key to enable AI</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-txt2">Add your free NVIDIA NIM key in Settings to unlock the assistant. Stored locally on this PC only.</p>
          <button onClick={() => onNavigate("settings")} className="glint mt-4 rounded-btn bg-accent px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi">Open Settings</button>
        </div>
      </div>
    );
  }

  const pct = (v: number | null | undefined) => (v != null ? `${Math.round(v)}%` : "—");

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h1 className="text-[42px] font-black uppercase leading-none tracking-tight text-txt">AI Assistant</h1>
        <p className="mt-1.5 text-[13px] text-txt2">Powered by <span className="font-mono text-[11px] text-txt">{NEMOTRON_MODEL}</span></p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_300px] gap-4">
        {/* Chat */}
        <div className="flex min-h-0 flex-col rounded-2xl border border-edge bg-card">
          <div className="flex-1 space-y-3 overflow-y-auto p-5">
            {msgs.length === 0 && (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <Bot size={30} className="mx-auto text-accent/70" />
                  <p className="mt-2 text-[13px] text-txt2">Describe a problem or ask anything about your PC.</p>
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${m.role === "user" ? "bg-accent/15 text-txt" : "border border-edge bg-bg text-txt"}`}>{m.text}</div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="border-t border-edge p-3">
            <div className="flex items-center gap-2 rounded-full border border-edge bg-bg px-4 py-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send(input)}
                placeholder="Describe a problem or ask anything about your PC..."
                className="flex-1 bg-transparent text-[13px] text-txt placeholder:text-txt3 focus:outline-none"
              />
              <button onClick={() => send(input)} className="grid h-8 w-8 place-items-center rounded-full bg-accent text-white hover:bg-accent-hi"><Send size={15} /></button>
            </div>
          </div>
        </div>

        {/* Context */}
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl border border-edge bg-card p-4">
            <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-txt3"><Cpu size={13} /> PC Context</p>
            <div className="flex flex-col gap-2 text-[12.5px]">
              <div className="flex justify-between"><span className="text-txt2">CPU</span><span className="text-txt">{pct(stats?.cpuUsagePercent)}</span></div>
              <div className="flex justify-between"><span className="text-txt2">GPU</span><span className="text-txt">{pct(stats?.gpuUsagePercent)}</span></div>
              <div className="flex justify-between"><span className="text-txt2">RAM</span><span className="text-txt">{pct(stats?.ramUsagePercent)}</span></div>
              <div className="flex justify-between"><span className="text-txt2">Active game</span><span className="text-txt">{activeGame?.name ?? "None"}</span></div>
            </div>
          </div>
          <div className="rounded-2xl border border-edge bg-card p-4">
            <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-txt3"><Sparkles size={13} /> Quick prompts</p>
            <div className="flex flex-col gap-1.5">
              {QUICK.map((q) => (
                <button key={q} onClick={() => send(q)} className="rounded-btn border border-edge bg-bg px-3 py-2 text-left text-[12px] text-txt2 transition-colors hover:text-txt">{q}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
