import { Construction } from "lucide-react";

// The in-game performance overlay (live FPS/temps on top of your game) is still
// being built — Windows makes a reliable, exclusive-fullscreen-safe overlay hard
// to do without hooking into games, which we won't do. Rather than ship a half-
// working toggle, it's shown here as "under construction" until it's solid.

export default function OverlayControl({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "" : "rounded-2xl border border-edge bg-card p-5"}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {!compact && (
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-warning/10">
              <Construction size={18} className="text-warning" />
            </span>
          )}
          <div className="pr-2">
            <div className="flex items-center gap-2">
              <p className="text-[14px] font-bold text-txt">In-game performance overlay</p>
              <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning">
                Under construction
              </span>
            </div>
            <p className="mt-0.5 text-[11.5px] leading-snug text-txt2">
              Live FPS &amp; temps on top of your game — coming in a future update. We're building it the safe way
              (no game hooks / injection), so it takes a little longer to get right.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
