import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bot, ChevronsDown, ChevronsUp, Cpu, Globe, RotateCcw, Send, Sparkles, Square, Zap } from "lucide-react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
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
  userName: string,
  stats: any,
  hw: any,
  activeGame: any,
  changeLog: ChangeLogEntry[],
  driverIssues: DeviceIssue[],
): string {
  const name = userName?.trim() || "";
  const gpuList: string =
    hw?.gpus?.length > 1
      ? hw.gpus.map((g: any) => `${g.name} (${g.vendor})`).join(" + ")
      : `${hw?.gpuName ?? "Unknown"} (${hw?.gpuVendor ?? "?"})`;
  const power = hw?.onBattery ? "on battery" : "plugged in / AC power";
  return `You are Mujify AI, an expert Windows PC optimizer built into the Mujify Tweaks app.

WHO YOU'RE TALKING TO:
${name ? `The user's name is "${name}". Use it occasionally when it feels natural. If they ask "what's my name", answer with "${name}".` : `You do NOT know the user's name — never invent one and NEVER address them as "the user". Just say "Hi" / "Hey" with no name. If they ask their name, say you don't have it set and point to Settings.`}

THIS MACHINE (real, detected):
Form factor: ${hw?.chassis ?? (hw?.isLaptop ? "Laptop" : "Desktop")} — currently ${power}
CPU: ${hw?.cpuName ?? "Unknown"} (${hw?.cpuVendor ?? "?"}) — ${hw?.cpuCores ?? "?"} cores / ${hw?.cpuThreads ?? "?"} threads — ${stats?.cpuUsagePercent?.toFixed(0) ?? "?"}% usage, ${stats?.cpuTempC != null ? `${stats.cpuTempC.toFixed(0)}°C` : "temp unavailable"}
GPU(s): ${gpuList} — ${stats?.gpuUsagePercent?.toFixed(0) ?? "?"}% usage, ${stats?.gpuTempC != null ? `${stats.gpuTempC.toFixed(0)}°C` : "temp unavailable"}
NPU: ${hw?.npuName ?? "none detected"}
RAM: ${stats?.ramUsedGb?.toFixed(1) ?? "?"}GB used of ${stats?.ramTotalGb?.toFixed(0) ?? hw?.ramTotalGb?.toFixed(0) ?? "?"}GB${hw?.ramSpeedMhz ? ` @ ${hw.ramSpeedMhz}MHz ${hw?.ramType ?? ""}` : ""} (${stats?.ramUsagePercent?.toFixed(0) ?? "?"}%)
Storage: ${hw?.storageSummary ?? "Unknown"}
OS: ${hw?.osEdition ?? "Windows"}${hw?.osBuild ? ` (build ${hw.osBuild})` : ""}${hw?.isCopilotPlus ? " · Copilot+ class" : ""}
Active game: ${activeGame?.name ?? "None"}
System score: ${stats?.systemScore ?? "?"} / 100
Bottleneck: ${stats?.bottleneck ?? "None detected"}

CHANGES ALREADY MADE (Change Log):
${changeLog.length === 0 ? "Nothing applied yet." : changeLog.slice(-10).map((e) => `- ${e.description} (${e.undone ? "reverted" : "active"})`).join("\n")}

DEVICE & DRIVER HEALTH (Device Manager problems):
${driverIssues.length === 0 ? "No device problems detected." : driverIssues.map((d) => `- ${d.name}: ${d.errorText} (code ${d.errorCode})`).join("\n")}

HOW TO TAILOR YOUR ADVICE TO THIS EXACT MACHINE:
- Refer to the hardware by its real name (e.g. "your ${hw?.gpuName ?? "GPU"}"). Recommend the vendor-specific tweaks that match: NVIDIA GPUs → NVIDIA tweaks, AMD → AMD tweaks, Intel/Arc → Intel tweaks. Never recommend a vendor's tweak for hardware it doesn't have.
- LAPTOP RULES: this is a ${hw?.chassis === "Laptop" || hw?.isLaptop ? "LAPTOP" : "DESKTOP"}. On a laptop, warn that aggressive tweaks raise heat and drain battery; do NOT recommend the Ultimate Performance power plan while on battery; prefer High Performance only when plugged in.
- The NPU does not affect game FPS — never claim an "NPU boost" for gaming. If asked about the NPU, explain it runs Windows AI features (Recall/Copilot/Studio Effects) and can be quieted via the Windows-AI tweaks.
- If the user mentions ANY hardware/driver problem, report EVERY problem device listed above, then offer the safe fix (restore point, then let Windows re-scan/match signed drivers). Never suggest third-party driver packs.

RULES:
- ANSWER THE ACTUAL QUESTION, plainly. If the user asks "what is 1+1", the entire reply is "2." NEVER offer a lettered menu of choices ("would you like to A) … B) … C) …"), never say "back to your laptop", never re-offer the same options, and NEVER repeat yourself. One direct answer, then stop.
- NEVER repeat a greeting or re-introduce yourself if the conversation already has messages. Greet AT MOST once, on the very first turn. Do not restate anything you already said earlier in this chat.
- You CANNOT apply, change, or revert anything yourself — you only advise. Never say "I've applied", "I disabled", "I've optimized", "done" or claim any change was made. Tell the user which Mujify button/tab to click; the CHANGES ALREADY MADE list above is the ONLY source of truth for what's actually been changed.
- You CAN use live web search when the user's question needs current info (the app runs a real search and gives you the results). If asked "can you use the web", answer yes briefly — don't ramble.
- "ACTIVE GAME", "running game", "current game", "game I'm playing" ALWAYS mean the game detected running on THIS PC right now — read it from the "Active game" field above. If it says None, answer "No game is running right now" (and offer Quick Optimize for when one launches). NEVER answer this with globally-popular games or a web search — it's a question about the user's own machine, and web results would be wrong. The same goes for any question about THIS PC's state (CPU/GPU/RAM/score/what's installed/what changed): answer from the live context above, never the web.
- MATCH THE USER. If they just greet you or make small talk, reply in ONE short friendly line and ask what they need — do NOT dump an unsolicited system analysis, score, or "top recommendation". Only diagnose or recommend tweaks when they actually ask about performance, a problem, or optimizing. Never open with a report they didn't ask for.
- You work THROUGH the Mujify app — it applies AND reverses every tweak itself, one click, fully reversible. So recommend Mujify's OWN tweaks by name and point to the tab that has them (Optimizer, Tweaks, Fixes, Network, Cleaner). NEVER give manual Windows steps (Control Panel, Power Options, "create a power plan", regedit) — the whole point is the user does NOT do it by hand. Say "apply High Performance Power Plan in the Optimizer", never "open Power Options and make a plan".
- When they DO ask for a diagnosis: name the single most likely thing holding THIS machine back (from the live usage %, temps, bottleneck, change log), then the ONE highest-impact Mujify fix. Don't list ten.
- Perspective on impact: on an already-healthy PC, software tweaks add only a few percent. A real 20-60% win comes from fixing a specific misconfiguration — RAM below rated speed (XMP/EXPO off), thermal throttling, a background CPU hog, or a stale GPU driver. Flag those first.
- Never suggest injection, driver modification, or bypassing anti-cheat.
- Keep replies SHORT — 2-3 sentences unless they ask for detail. Clean prose, light formatting: "-" bullets only for a real step list, **bold** only for a single key term. Never invent a number — if a spec isn't listed above, say you don't have it rather than guessing.`;
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
  // Track scroll position so the jump buttons follow the user: the "up" arrow
  // only shows once you've scrolled down, the "down" arrow only while you're
  // above the latest message. They fade in/out instead of sitting there static.
  const [scrollPos, setScrollPos] = useState({ atTop: true, atBottom: true });
  const onChatScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atTop = el.scrollTop <= 8;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 12;
    setScrollPos((p) => (p.atTop === atTop && p.atBottom === atBottom ? p : { atTop, atBottom }));
  };
  const [webSearch, setWebSearch] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Live typewriter buffer for the CURRENT reply. Held in a ref (not effect-local
  // closures) so `send()` can hard-reset it before every new message — otherwise
  // chunks accumulate across messages and the model's prior reply gets re-echoed
  // as a prefix (the "greeting spam" bug).
  const streamBuf = useRef({ target: "", shown: 0, done: false });
  // Use scrollIntoView on anchor divs — reliable no matter which parent is the
  // actual scroll container (the old scrollRef.scrollTo did nothing here).
  const scrollToTop = () => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const scrollToBottom = () => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });

  // Restore the saved conversation on mount. The assistant is ALWAYS available:
  // a local key means it talks to NVIDIA directly, and with no key it goes
  // through Mujify's free proxy — so we never gate the user behind "add a key".
  useEffect(() => {
    void loadPersistedSession();
    setKeyReady(true);
  }, [loadPersistedSession]);

  // Register the streaming listeners once (not per-send, which would leak them).
  // They drive the store directly via getState() so they never hold stale refs.
  useEffect(() => {
    let unlistenChunk: UnlistenFn | undefined;
    let unlistenDone: UnlistenFn | undefined;
    let active = true;
    // Wait for the WHOLE reply, then reveal it smoothly.
    //
    // Painting tokens as they land can't be smooth: the network delivers them in
    // uneven bursts, and every burst re-renders the Markdown, so the text jerks
    // and reflows as lists and code blocks complete themselves mid-thought. The
    // old "catch up by remaining/8 per frame" reveal made that worse — it sped up
    // and slowed down with the bursts.
    //
    // So nothing is shown while the model is talking (the thinking indicator is
    // up), and once the reply is complete it animates in at a steady, purely
    // time-based rate. The pace no longer depends on the network at all.
    const buf = streamBuf.current;
    let rafId: number | null = null;
    let revealStart = 0;
    let revealMs = 0;

    // Ease-out: quick to get going, gently settling — reads as deliberate rather
    // than mechanical, and never crawls on a long answer.
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = () => {
      rafId = null;
      const len = buf.target.length;
      if (len === 0) return;
      const elapsed = performance.now() - revealStart;
      const t = revealMs === 0 ? 1 : Math.min(1, elapsed / revealMs);
      buf.shown = Math.max(buf.shown, Math.floor(len * easeOut(t)));
      useAiStore.getState().setStreamingContent(() => buf.target.slice(0, buf.shown));
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      // Fully revealed — commit it to the conversation.
      useAiStore.getState().setStreamingContent(() => buf.target);
      useAiStore.getState().finalizeStreaming();
      // Hard-reset the buffer so the NEXT reply starts from empty instead of
      // inheriting this one's text (root cause of the message-spam loop).
      buf.target = "";
      buf.shown = 0;
      buf.done = false;
    };
    void (async () => {
      // Accumulate silently. Nothing is painted until the reply is complete.
      const uc = await listen<string>("ai_chunk", (e) => {
        buf.target += e.payload;
      });
      const ud = await listen("ai_done", () => {
        buf.done = true;
        if (buf.target.length === 0) {
          // Nothing came back — don't animate an empty bubble.
          useAiStore.getState().finalizeStreaming();
          return;
        }
        // Scale with length so a one-liner doesn't crawl and an essay doesn't
        // take all day, then clamp so it always feels responsive.
        revealMs = Math.min(1400, Math.max(350, buf.target.length * 4));
        revealStart = performance.now();
        buf.shown = 0;
        if (rafId === null) rafId = requestAnimationFrame(tick);
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
      if (rafId !== null) cancelAnimationFrame(rafId);
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
    // Start every reply from a clean buffer — never inherit the previous stream.
    streamBuf.current.target = "";
    streamBuf.current.shown = 0;
    streamBuf.current.done = false;

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
    const userName = useSettingsStore.getState().userName;
    const systemPrompt = buildSystemPrompt(userName, stats, hw, activeGame, changeLog, driverIssues);

    // Rust streams the reply back via the ai_chunk / ai_done events above.
    // getState().messages already includes the user turn we just pushed.
    try {
      await invoke("ai_chat", {
        messages: useAiStore.getState().messages,
        systemPrompt,
        webSearch,
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
          <h1 className="mt-4 text-xl font-bold text-txt">Add your free AI key</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-txt2">
            The assistant runs on NVIDIA's <span className="font-semibold text-txt">free</span> NIM API. Grab a
            key (takes a minute), paste it in Settings, and you're set. It's stored only on this PC — never
            uploaded.
          </p>
          <button onClick={() => onNavigate("settings")} className="glint mt-4 rounded-btn bg-accent px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi">
            Add key in Settings
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
          <div ref={scrollRef} onScroll={onChatScroll} className="flex-1 space-y-3 overflow-y-auto p-5">
            <div ref={topRef} />
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

          {/* Jump buttons that follow the scroll: up appears once you've scrolled
              down, down appears while you're above the latest message. */}
          {(messages.length > 2 || streamingContent) && (
            <div className="pointer-events-none absolute bottom-[74px] right-4 z-10 flex flex-col gap-1.5">
              <button
                onClick={scrollToTop}
                title="Jump to top"
                aria-label="Jump to top of chat"
                className={`pointer-events-auto grid h-9 w-9 place-items-center rounded-full border border-edge bg-panel/90 text-txt2 shadow-lg backdrop-blur transition-all duration-200 hover:text-txt ${scrollPos.atTop ? "pointer-events-none translate-y-1 opacity-0" : "opacity-100"}`}
              >
                <ChevronsUp size={17} />
              </button>
              <button
                onClick={scrollToBottom}
                title="Jump to latest"
                aria-label="Jump to latest message"
                className={`pointer-events-auto grid h-9 w-9 place-items-center rounded-full border border-accent/40 bg-accent text-white shadow-lg shadow-accent/20 transition-all duration-200 hover:bg-accent-hi ${scrollPos.atBottom ? "pointer-events-none translate-y-1 opacity-0" : "opacity-100"}`}
              >
                <ChevronsDown size={17} />
              </button>
            </div>
          )}

          <div className="border-t border-edge p-3">
            <div className="flex items-center gap-2 rounded-full border border-edge bg-bg px-2 py-1.5 pl-4">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                placeholder={webSearch ? "Ask anything — I'll search the web for it…" : "Describe a problem or ask anything about your PC..."}
                disabled={isLoading}
                className="flex-1 bg-transparent text-[13px] text-txt placeholder:text-txt3 focus:outline-none disabled:opacity-60"
              />
              {/* Web-search toggle — when on, the assistant runs a real Tavily
                  search first and answers with cited sources. */}
              <button
                onClick={() => setWebSearch((v) => !v)}
                title={webSearch ? "Web search ON — answers use live internet results" : "Turn on web search"}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition-colors ${
                  webSearch
                    ? "border-accent/50 bg-accent/15 text-accent"
                    : "border-edge text-txt3 hover:text-txt2"
                }`}
              >
                <Globe size={13} strokeWidth={2} /> Web
              </button>
              {isLoading ? (
                <button
                  onClick={() => void invoke("stop_ai")}
                  title="Stop generating"
                  aria-label="Stop generating"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-txt3/25 text-txt transition-colors hover:bg-txt3/40"
                >
                  <Square size={12} fill="currentColor" />
                </button>
              ) : (
                <button
                  onClick={() => void send(input)}
                  disabled={!input.trim()}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-white hover:bg-accent-hi disabled:opacity-50"
                >
                  <Send size={15} />
                </button>
              )}
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
