import { Sparkles, X } from "lucide-react";
import { DISCORD_INVITE, openExternal } from "../lib/links";

/**
 * "What's new" popup — shown once after the first launch on a new version, from
 * the GitHub release notes. If notes can't be fetched it simply never appears
 * (the caller skips it), so it's a graceful no-op while no releases exist.
 */
export default function WhatsNewModal({ version, notes, onClose }: { version: string; notes: string; onClose: () => void }) {
  const lines = notes.split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <div className="fixed inset-0 z-[65] grid place-items-center bg-black/75 p-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-card border border-edge bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-edge px-5 py-4">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-txt">
            <Sparkles size={15} className="text-accent" /> What's new in v{version}
          </h2>
          <button onClick={onClose} className="text-txt3 hover:text-txt" aria-label="Close">
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto px-5 py-4">
          <ul className="flex flex-col gap-1.5 text-[12.5px] leading-relaxed text-txt2">
            {lines.map((l, i) => (
              <li key={i}>{l.replace(/^[-*]\s*/, "• ")}</li>
            ))}
          </ul>
        </div>
        <div className="border-t border-edge px-5 py-3.5 text-center">
          <button
            onClick={() => void openExternal(DISCORD_INVITE)}
            className="text-[12px] font-semibold text-accent hover:text-accent-hi"
          >
            Join the Discord to shape the next update →
          </button>
        </div>
      </div>
    </div>
  );
}
