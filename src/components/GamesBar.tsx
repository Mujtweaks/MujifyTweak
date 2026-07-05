import { Plus } from "lucide-react";
import { useGameStore } from "../store/gameStore";
import GameArt from "./GameArt";
import type { PageId } from "../lib/nav";

export default function GamesBar({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const installedGames = useGameStore((s) => s.installedGames);
  const activeGame = useGameStore((s) => s.activeGame);

  return (
    <footer className="flex h-[52px] shrink-0 items-center gap-3 border-t border-edge bg-[#0d0d0d] px-5">
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-widest text-txt3">My Games</span>

      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        {activeGame && (
          <span className="flex shrink-0 items-center gap-2 rounded-pill border border-success/20 bg-card px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            <span className="text-[13px] font-medium text-txt">{activeGame.name}</span>
            <span className="rounded-pill bg-success/10 px-2 py-0.5 text-[9px] font-bold text-success">ACTIVE</span>
          </span>
        )}
        {installedGames.length === 0 && !activeGame ? (
          <span className="text-[12px] text-txt3">No games detected yet</span>
        ) : (
          installedGames
            .filter((g) => g.name !== activeGame?.name)
            .slice(0, 8)
            .map((g) => (
              <button
                key={g.name}
                onClick={() => onNavigate("profiles")}
                className="flex shrink-0 items-center gap-2 rounded-pill border border-edge bg-card px-3 py-1.5 text-[13px] text-txt2 transition-colors hover:text-txt"
              >
                <GameArt name={g.name} appId={g.appId} className="h-4 w-4" rounded="rounded" />
                {g.name}
              </button>
            ))
        )}
      </div>

      <button
        onClick={() => onNavigate("profiles")}
        className="flex shrink-0 items-center gap-1.5 rounded-pill border border-edge px-3 py-1.5 text-[12px] text-txt3 transition-colors hover:border-white/20 hover:text-txt"
      >
        <Plus size={13} strokeWidth={2} />
        Add Game
      </button>
    </footer>
  );
}
