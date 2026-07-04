import { useEffect, useState } from "react";
import {
  Bell,
  ChevronDown,
  Copy,
  Gamepad2,
  Minus,
  Settings,
  Square,
  X,
} from "lucide-react";
import {
  closeWindow,
  isWindowMaximized,
  minimizeWindow,
  onWindowResized,
  toggleMaximizeWindow,
} from "../lib/tauri";
import { useGameStore } from "../store/gameStore";
import type { PageId } from "../lib/nav";

interface TopBarProps {
  onNavigate: (page: PageId) => void;
}

export default function TopBar({ onNavigate }: TopBarProps) {
  const activeGame = useGameStore((s) => s.activeGame);
  const gameModeEnabled = useGameStore((s) => s.gameModeEnabled);
  const toggleGameMode = useGameStore((s) => s.toggleGameMode);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const refresh = () => void isWindowMaximized().then(setMaximized);
    refresh();
    return onWindowResized(refresh);
  }, []);

  return (
    <header
      data-tauri-drag-region
      className="flex h-[60px] shrink-0 items-center gap-3 border-b border-edge bg-bg pl-5"
    >
      {/* Identity */}
      <div data-tauri-drag-region className="flex items-center gap-2.5">
        <span className="font-display text-xl font-bold tracking-[0.18em] text-txt">
          GAMER
        </span>
        <span className="rounded-md bg-accent/15 px-2 py-0.5 text-[10px] font-bold tracking-[0.14em] text-accent">
          LEGEND
        </span>
      </div>

      {/* Game selector — real data only; GameDetector lands at Checkpoint 4 */}
      <div data-tauri-drag-region className="flex flex-1 justify-center">
        <button
          title={
            activeGame
              ? activeGame.name
              : "Game detection comes online at Checkpoint 4"
          }
          className={`flex items-center gap-2.5 rounded-xl border border-edge bg-panel px-4 py-2 text-[13px] font-medium transition-colors hover:border-edge2 ${
            activeGame ? "text-txt" : "text-txt2"
          }`}
        >
          <Gamepad2 size={16} strokeWidth={1.75} />
          {activeGame ? activeGame.name : "No game detected"}
          <ChevronDown size={14} strokeWidth={2} className="text-txt3" />
        </button>
      </div>

      {/* Game Mode toggle */}
      <div className="flex items-center gap-2.5">
        <span className="text-[12px] font-medium text-txt2">Game Mode</span>
        <button
          onClick={toggleGameMode}
          title="UI state only for now — wires to TweaksEngine at Checkpoint 9"
          className={`relative flex h-[22px] w-[46px] items-center rounded-full border transition-colors ${
            gameModeEnabled
              ? "border-accent/60 bg-accent"
              : "border-edge2 bg-panel2"
          }`}
        >
          <span
            className={`absolute text-[8px] font-bold tracking-wide ${
              gameModeEnabled ? "left-1.5 text-white" : "right-1.5 text-txt3"
            }`}
          >
            {gameModeEnabled ? "ON" : "OFF"}
          </span>
          <span
            className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
              gameModeEnabled ? "translate-x-[26px]" : "translate-x-[3px]"
            }`}
          />
        </button>
      </div>

      <div className="flex items-center gap-0.5 pl-1">
        <button
          title="Notifications — coming later"
          className="grid h-9 w-9 place-items-center rounded-lg text-txt2 transition-colors hover:bg-white/[0.05] hover:text-txt"
        >
          <Bell size={16} strokeWidth={1.75} />
        </button>
        <button
          onClick={() => onNavigate("settings")}
          title="Settings"
          className="grid h-9 w-9 place-items-center rounded-lg text-txt2 transition-colors hover:bg-white/[0.05] hover:text-txt"
        >
          <Settings size={16} strokeWidth={1.75} />
        </button>
      </div>

      {/* Window controls */}
      <div className="ml-1 flex h-full items-stretch border-l border-edge">
        <button
          onClick={() => void minimizeWindow()}
          className="grid w-[46px] place-items-center text-txt2 transition-colors hover:bg-white/[0.06] hover:text-txt"
          aria-label="Minimize"
        >
          <Minus size={15} strokeWidth={2} />
        </button>
        <button
          onClick={() => void toggleMaximizeWindow()}
          className="grid w-[46px] place-items-center text-txt2 transition-colors hover:bg-white/[0.06] hover:text-txt"
          aria-label={maximized ? "Restore" : "Maximize"}
        >
          {maximized ? (
            <Copy size={13} strokeWidth={2} className="-scale-x-100" />
          ) : (
            <Square size={13} strokeWidth={2} />
          )}
        </button>
        <button
          onClick={() => void closeWindow()}
          className="grid w-[46px] place-items-center text-txt2 transition-colors hover:bg-accent hover:text-white"
          aria-label="Close"
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}
