import { useState } from "react";
import { Bot, Copy, Globe, LifeBuoy } from "lucide-react";
import DiscordIcon from "../components/DiscordIcon";
import { DISCORD_INVITE, WEBSITE, openExternal } from "../lib/links";
import { getSupportReport } from "../lib/backend";
import { useGameStore } from "../store/gameStore";
import { toast } from "../store/toastStore";
import type { PageId } from "../lib/nav";

/**
 * Support hub — Mujify's biggest human differentiator. Honest, warm, no
 * overpromising: real volunteers in the Discord (usually around, not 24/7),
 * the built-in AI, the website, and a one-click system report to paste for help.
 */
export default function Support({ onNavigate }: { onNavigate: (p: PageId) => void }) {
  const activeGame = useGameStore((s) => s.activeGame);
  const [copying, setCopying] = useState(false);

  const copyReport = async () => {
    setCopying(true);
    const text = await getSupportReport(activeGame?.name ?? null);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Report copied", "Paste it in the Discord and we'll take it from there.");
    } catch {
      toast.error("Couldn't copy to clipboard", "Try again, or copy from the logs folder in Settings.");
    }
    setCopying(false);
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 pb-10">
      {/* Hero */}
      <div className="rounded-card border border-edge bg-card p-6">
        <div className="flex items-center gap-2.5">
          <LifeBuoy size={24} strokeWidth={1.75} className="text-accent" />
          <h1 className="text-[30px] font-black uppercase leading-none tracking-tight text-txt">Get Help</h1>
        </div>
        <p className="mt-3 max-w-xl text-[13.5px] leading-relaxed text-txt2">
          Stuck? Talk to a real person — free. Mujify has a volunteer support crew across multiple time zones, so
          someone's usually around no matter when you play. No tickets, no bots, no paywall — just ask in the Discord.
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => void openExternal(DISCORD_INVITE)}
          className="glint flex flex-col items-start gap-2 rounded-card border border-[#5865F2]/30 bg-[#5865F2]/5 p-5 text-left transition-colors hover:border-[#5865F2]/60"
        >
          <DiscordIcon className="h-8 w-8" />
          <p className="text-[15px] font-bold text-txt">Join the Discord</p>
          <p className="text-[12px] leading-snug text-txt2">Free live help, updates, and a say in what's built next.</p>
        </button>

        <button
          onClick={() => onNavigate("ai")}
          className="flex flex-col items-start gap-2 rounded-card border border-edge bg-card p-5 text-left transition-colors hover:border-accent/40"
        >
          <Bot size={30} strokeWidth={1.5} className="text-accent" />
          <p className="text-[15px] font-bold text-txt">Ask the built-in AI</p>
          <p className="text-[12px] leading-snug text-txt2">Instant answers grounded in your real PC stats.</p>
        </button>

        <button
          onClick={() => void openExternal(WEBSITE)}
          className="flex flex-col items-start gap-2 rounded-card border border-edge bg-card p-5 text-left transition-colors hover:border-accent/40"
        >
          <Globe size={30} strokeWidth={1.5} className="text-accent" />
          <p className="text-[15px] font-bold text-txt">Website</p>
          <p className="text-[12px] leading-snug text-txt2">Guides, downloads and more.</p>
        </button>

        <button
          onClick={() => void copyReport()}
          disabled={copying}
          className="flex flex-col items-start gap-2 rounded-card border border-edge bg-card p-5 text-left transition-colors hover:border-accent/40 disabled:opacity-60"
        >
          <Copy size={30} strokeWidth={1.5} className="text-accent" />
          <p className="text-[15px] font-bold text-txt">{copying ? "Building report…" : "Copy System Report"}</p>
          <p className="text-[12px] leading-snug text-txt2">
            Your specs + what's applied, ready to paste. No personal data, no keys.
          </p>
        </button>
      </div>
    </div>
  );
}
