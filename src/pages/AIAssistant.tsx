import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bot, ChevronsDown, ChevronsUp, Cpu, RotateCcw, Send, Sparkles, Zap } from "lucide-react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { nvidiaKey } from "../lib/aiConfig";
import { getChangeLog, scanDeviceHealth } from "../lib/backend";
import { useAiStore } from "../store/aiStore";
import { toast } from "../store/toastStore";
import { useSettingsStore } from "../store/settingsStore";
import { useSystemStore } from "../store/systemStore";
import { useGameStore } from "../store/gameStore";
import type { ChangeLogEntry, DeviceIssue } from "../lib/types";
import type { PageId } from "../lib/nav";

// Render the assistant's light markdown as real formatting so the user never
// sees raw markers: **bold** → bold, *italic* → italic, and "-"/"*" bullet
// lines become dotted list items (handled in MessageContent below).
function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Bold (group 1) is tried before italic (group 2) at each position.
  const re = /\*\*\s*(.+?)\s*\*\*|\*\s*(.+?)\s*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(
        <strong key={`${keyBase}-b${i++}`} className="font-semibold text-txt">
          {m[1]}
        </strong>,
      );
    } else {
      out.push(
        <em key={`${keyBase}-i${i++}`} className="italic">
          {m[2]}
        </em>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function MessageContent({ content }: { content: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (key: string) => {
    if (bullets.length) {
      const items = bullets;
      blocks.push(
        <ul key={key} className="my-1.5 flex list-disc flex-col gap-1 pl-5">
          {items.map((b, i) => (
            <li key={i}>{renderInline(b, `${key}-${i}`)}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  content.split("\n").forEach((line, idx) => {
    const t = line.trim();
    const bullet = t.match(/^[-*]\s+(.*)/);
    if (bullet) {
      bullets.push(bullet[1]);
    } else {
      flush(`ul-${idx}`);
      if (t) {
        blocks.push(
          <p key={`p-${idx}`} className="mb-1.5 last:mb-0">
            {renderInline(t, `p-${idx}`)}
          </p>,
        );
      }
    }
  });
  flush("ul-end");
  return <>{blocks}</>;
}

const QUICK = [
  "Why is my FPS low?",
  "Fix my high ping",
  "What did you change on my PC?",
  "Optimize my system right now",
];

// The AI's grounding context: real live stats + the real, persisted change log.
function buildSystemPrompt(
  stats: any,
  hw: any,
  activeGame: any,
  changeLog: ChangeLogEntry[],
  driverIssues: DeviceIssue[],
): string {
  return `You are Mujify AI, an expert Windows PC optimizer built into the Mujify Tweaks app.

CURRENT PC STATE:
CPU: ${hw?.cpuName ?? "Unknown"} — ${stats?.cpuUsagePercent?.toFixed(0) ?? "?"}% usage, ${stats?.cpuTempC != null ? `${stats.cpuTempC.toFixed(0)}°C` : "temp unavailable"}
GPU: ${hw?.gpuName ?? "Unknown"} — ${stats?.gpuUsagePercent?.toFixed(0) ?? "?"}% usage, ${stats?.gpuTempC != null ? `${stats.gpuTempC.toFixed(0)}°C` : "temp unavailable"}
RAM: ${stats?.ramUsedGb?.toFixed(1) ?? "?"}GB used of ${stats?.ramTotalGb?.toFixed(0) ?? "?"}GB (${stats?.ramUsagePercent?.toFixed(0) ?? "?"}%)
Storage: ${hw?.storageSummary ?? "Unknown"}
Active game: ${activeGame?.name ?? "None"}
System score: ${stats?.systemScore ?? "?"}
Bottleneck: ${stats?.bottleneck ?? "None detected"}

CHANGES ALREADY MADE (Change Log):
${changeLog.length === 0 ? "Nothing applied yet." : changeLog.slice(-10).map((e) => `- ${e.description} (${e.undone ? "reverted" : "active"})`).join("\n")}

DEVICE & DRIVER HEALTH (Device Manager problems):
${driverIssues.length === 0 ? "No device problems detected." : driverIssues.map((d) => `- ${d.name}: ${d.errorText} (code ${d.errorCode})`).join("\n")}

RULES:
- If the user mentions ANY hardware or driver problem, report EVERY problem device listed above (not only the one they named), then offer the safe fix: create a System Restore point, then let Windows re-scan and match signed drivers. Never suggest downloading third-party driver packs.
- Be specific and actionable. No vague advice.
- If the user asks you to change something, explain exactly what will change before doing it.
- Never suggest anything that requires injection, driver modification, or bypassing anti-cheat.
- Keep replies concise — 2-4 sentences unless the user explicitly asks for more detail.
- If you don't know something specific to this PC, say so honestly.
- Write in clean, professional prose. Keep formatting light: use "-" bullets for a list of steps, and **bold** only for a single short key term — never wrap whole sentences or every spec/number in bold.`;
}

export default function AIAssistant({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const messages = useAiStore((s) => s.messages);
  const isLoading = useAiStore((s) => s.isLoading);
  const streamingContent = useAiStore((s) => s.streamingContent);
  const pushMessage = useAiStore((s) => s.pushMessage);
  const setLoading = useAiStore((s) => s.setLoading);
  const setStreamingContent = useAiStore((s) => s.setStreamingContent);
  const clearMessages = useAiStore((s) => s.clearMessages);
  const loadPersistedSession = useAiStore((s) => s.loadPersistedSession);

  const stats = useSystemStore((s) => s.stats);
  const hw = useSystemStore((s) => s.hardware);
  const activeGame = useGameStore((s) => s.activeGame);
  const aiEnabled = useSettingsStore((s) => s.aiEnabled);

  const [keyReady, setKeyReady] = useState<boolean | null>(null);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollToTop = () => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  const scrollToBottom = () =>
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });

  // Restore the saved conversation and check the API key on mount.
  useEffect(() => {
    void loadPersistedSession();
    void nvidiaKey().then((k) => setKeyReady(!!k));
  }, [loadPersistedSession]);

  // Register the streaming listeners once (not per-send, which would leak them).
  // They drive the store directly via getState() so they never hold stale refs.
  useEffect(() => {
    let unlistenChunk: UnlistenFn | undefined;
    let unlistenDone: UnlistenFn | undefined;
    let active = true;
    void (async () => {
      const uc = await listen<string>("ai_chunk", (e) => {
        useAiStore.getState().setStreamingContent((prev) => prev + e.payload);
      });
      const ud = await listen("ai_done", () => {
        useAiStore.getState().finalizeStreaming();
      });
      if (!active) {
        uc();
        ud();
        return;
      }
      unlistenChunk = uc;
      unlistenDone = ud;
    })();
    return () => {
      active = false;
      unlistenChunk?.();
      unlistenDone?.();
    };
  }, []);

  // Follow the conversation as messages arrive / stream in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || isLoading) return;
    setInput("");
    setLoading(true);

    // Persist the user turn immediately (survives tab switches / restart).
    pushMessage({ role: "user", content: q, timestamp: Date.now() });

    // Ground the prompt in the real, persisted change log.
    let changeLog: ChangeLogEntry[] = [];
    try {
      changeLog = await getChangeLog();
    } catch {
      changeLog = [];
    }
    // Scan device/driver health so the AI can report EVERY problem, not just the
    // one the user mentioned.
    let driverIssues: DeviceIssue[] = [];
    try {
      driverIssues = await scanDeviceHealth();
    } catch {
      driverIssues = [];
    }
    const systemPrompt = buildSystemPrompt(stats, hw, activeGame, changeLog, driverIssues);

    // Rust streams the reply back via the ai_chunk / ai_done events above.
    // getState().messages already includes the user turn we just pushed.
    try {
      await invoke("ai_chat", {
        messages: useAiStore.getState().messages,
        systemPrompt,
      });
    } catch (err) {
      const msg = String(err);
      pushMessage({ role: "assistant", content: msg, timestamp: Date.now() });
      toast.error("Mujify AI", msg);
      setStreamingContent("");
      setLoading(false);
    }
  };

  if (!aiEnabled) {
    return (
      <div className="grid h-full place-items-center">
        <div className="max-w-sm text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-txt3/10">
            <Bot size={30} strokeWidth={1.5} className="text-txt3" />
          </span>
          <h1 className="mt-4 text-xl font-bold text-txt">AI Assistant is off</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-txt2">You've turned off the AI assistant in Settings. Enable it again to chat with Mujify AI about your PC.</p>
          <button onClick={() => onNavigate("settings")} className="mt-4 rounded-btn bg-accent px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-accent-hi">
            Open Settings
          </button>
        </div>
      </div>
    );
  }

  if (keyReady === false) {
    return (
      <div className="grid h-full place-items-center">
        <div className="max-w-sm text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-accent/10 shadow-[0_0_28px_rgba(227,0,14,0.18)]">
            <Bot size={30} strokeWidth={1.5} className="text-accent" />
          </span>
          <h1 className="mt-4 text-xl font-bold text-txt">Set up your API key</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-txt2">Add your free NVIDIA NIM key in Settings to unlock the AI assistant. Stored locally on this PC only.</p>
          <button onClick={() => onNavigate("settings")} className="glint mt-4 rounded-btn bg-accent px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi">
            Open Settings
          </button>
        </div>
      </div>
    );
  }

  const pct = (v: number | null | undefined) => (v != null ? `${Math.round(v)}%` : "—");

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[42px] font-black uppercase leading-none tracking-tight text-txt">AI Assistant</h1>
          <p className="mt-1.5 text-[13px] text-txt2">Powered by <span className="font-semibold text-txt">Mujify AI</span></p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearMessages}
            className="flex items-center gap-1.5 rounded-btn border border-edge px-3 py-1.5 text-[12px] text-txt2 hover:text-txt"
          >
            <RotateCcw size={12} /> Clear chat
          </button>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_300px] gap-4">
        {/* Chat */}
        <div className="relative flex min-h-0 flex-col rounded-2xl border border-edge bg-card">
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-5">
            {messages.length === 0 && !streamingContent && (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <Bot size={30} className="mx-auto text-accent/70" />
                  <p className="mt-2 text-[13px] text-txt2">Describe a problem or ask anything about your PC.</p>
                  <p className="mt-1 text-[11px] text-txt3">Your chat history is saved automatically.</p>
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <span className="mr-2 mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/15">
                    <Zap size={13} className="text-accent" />
                  </span>
                )}
                <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${m.role === "user" ? "bg-accent/15 text-txt" : "border border-edge bg-bg text-txt"}`}>
                  {m.role === "assistant" ? <MessageContent content={m.content} /> : m.content}
                </div>
              </div>
            ))}

            {/* Live streaming message */}
            {streamingContent && (
              <div className="flex justify-start">
                <span className="mr-2 mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/15">
                  <Zap size={13} className="text-accent" />
                </span>
                <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl border border-edge bg-bg px-4 py-3 text-[13px] leading-relaxed text-txt">
                  <MessageContent content={streamingContent} />
                  <span className="ml-1 inline-block h-3 w-0.5 animate-pulse bg-accent align-middle" />
                </div>
              </div>
            )}

            {/* Loading indicator before the first chunk arrives */}
            {isLoading && !streamingContent && (
              <div className="flex justify-start">
                <span className="mr-2 mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/15">
                  <Zap size={13} className="text-accent" />
                </span>
                <div className="rounded-2xl border border-edge bg-bg px-4 py-3">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-txt3 [animation-delay:0ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-txt3 [animation-delay:150ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-txt3 [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* One-click jump to the top / latest of the conversation */}
          {(messages.length > 2 || streamingContent) && (
            <div className="absolute bottom-[74px] right-4 z-10 flex flex-col gap-1.5">
              <button
                onClick={scrollToTop}
                title="Jump to top"
                aria-label="Jump to top of chat"
                className="grid h-8 w-8 place-items-center rounded-full border border-edge bg-panel/90 text-txt2 shadow-lg backdrop-blur transition-colors hover:text-txt"
              >
                <ChevronsUp size={16} />
              </button>
              <button
                onClick={scrollToBottom}
                title="Jump to latest"
                aria-label="Jump to latest message"
                className="grid h-8 w-8 place-items-center rounded-full border border-edge bg-panel/90 text-txt2 shadow-lg backdrop-blur transition-colors hover:text-txt"
              >
                <ChevronsDown size={16} />
              </button>
            </div>
          )}

          <div className="border-t border-edge p-3">
            <div className="flex items-center gap-2 rounded-full border border-edge bg-bg px-4 py-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                placeholder="Describe a problem or ask anything about your PC..."
                disabled={isLoading}
                className="flex-1 bg-transparent text-[13px] text-txt placeholder:text-txt3 focus:outline-none disabled:opacity-60"
              />
              <button
                onClick={() => void send(input)}
                disabled={isLoading || !input.trim()}
                className="grid h-8 w-8 place-items-center rounded-full bg-accent text-white hover:bg-accent-hi disabled:opacity-50"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Context panel */}
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl border border-edge bg-card p-4">
            <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-txt3">
              <Cpu size={13} /> PC Context
            </p>
            <div className="flex flex-col gap-2 text-[12.5px]">
              <div className="flex justify-between"><span className="text-txt2">CPU</span><span className="text-txt">{pct(stats?.cpuUsagePercent)}</span></div>
              <div className="flex justify-between"><span className="text-txt2">GPU</span><span className="text-txt">{pct(stats?.gpuUsagePercent)}</span></div>
              <div className="flex justify-between"><span className="text-txt2">RAM</span><span className="text-txt">{pct(stats?.ramUsagePercent)}</span></div>
              <div className="flex justify-between"><span className="text-txt2">Score</span><span className="font-semibold text-accent">{stats?.systemScore ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-txt2">Active game</span><span className="text-txt">{activeGame?.name ?? "None"}</span></div>
            </div>
          </div>

          <div className="rounded-2xl border border-edge bg-card p-4">
            <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-txt3">
              <Sparkles size={13} /> Quick prompts
            </p>
            <div className="flex flex-col gap-1.5">
              {QUICK.map((q) => (
                <button
                  key={q}
                  onClick={() => void send(q)}
                  disabled={isLoading}
                  className="rounded-btn border border-edge bg-bg px-3 py-2 text-left text-[12px] text-txt2 transition-colors hover:text-txt disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
