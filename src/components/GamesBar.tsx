import { useState } from "react";
import { Plus } from "lucide-react";
import { useGameStore } from "../store/gameStore";

/**
 * MY GAMES strip. Populated by GameDetector's launcher scan (Checkpoint 4) —
 * shows an honest empty state until real games are found on this PC.
 */
export default function GamesBar() {
  const installedGames = useGameStore((s) => s.installedGames);
  const activeGame = useGameStore((s) => s.activeGame);
  const [hint, setHint] = useState(false);

  const showHint = () => {
    setHint(true);
    window.setTimeout(() => setHint(false), 2600);
  };

  return (
    <footer className="flex h-[58px] shrink-0 items-center gap-3 border-t border-edge bg-bg px-5">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-txt3">
        My Games
      </span>

      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        {installedGames.length === 0 ? (
          <span className="text-[11.5px] text-txt3">
            {hint
              ? "Game library scanning (Steam, Epic, Xbox, GOG) arrives at Checkpoint 4."
              : "No games detected yet"}
          </span>
        ) : (
          installedGames.map((game) => {
            const isActive = activeGame?.exe === game.exe;
            return (
              <button
                key={game.exe}
                className={`flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-1.5 text-[12px] font-medium transition-colors ${
                  isActive
                    ? "border-good/40 bg-good/10 text-txt"
                    : "border-edge bg-panel text-txt2 hover:border-edge2 hover:text-txt"
                }`}
              >
                {isActive && <span className="h-1.5 w-1.5 rounded-full bg-good" />}
                {game.name}
                {isActive && (
                  <span className="text-[9px] font-bold tracking-wider text-good">
                    ACTIVE
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      <button
        onClick={showHint}
        className="flex shrink-0 items-center gap-1.5 rounded-xl border border-edge bg-panel px-3.5 py-1.5 text-[12px] font-medium text-txt2 transition-colors hover:border-edge2 hover:text-txt"
      >
        <Plus size={13} strokeWidth={2} />
        Add Game
      </button>
    </footer>
  );
}
