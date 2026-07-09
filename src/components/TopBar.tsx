import { useEffect, useState } from "react";
import { Bell, ChevronDown, Copy, Gamepad2, Minus, Settings, Square, X } from "lucide-react";
import {
  closeWindow,
  isWindowMaximized,
  minimizeWindow,
  onWindowResized,
  toggleMaximizeWindow,
} from "../lib/tauri";
import { useGameStore } from "../store/gameStore";
import { useSettingsStore, displayName } from "../store/settingsStore";
import { DISCORD_INVITE, openExternal } from "../lib/links";
import DiscordIcon from "./DiscordIcon";
import BoostButton from "./BoostButton";
import { PAGE_TITLES, type PageId } from "../lib/nav";

function greeting(name: string): string {
  const h = new Date().getHours();
  const tod = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
  return `Good ${tod}, ${displayName(name)}`;
}

interface TopBarProps {
  page: PageId;
  onNavigate: (page: PageId) => void;
}

export default function TopBar({ page, onNavigate }: TopBarProps) {
  const activeGame = useGameStore((s) => s.activeGame);
  const userName = useSettingsStore((s) => s.userName);
  const gameModeEnabled = useGameStore((s) => s.gameModeEnabled);
  const toggleGameMode = useGameStore((s) => s.toggleGameMode);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const refresh = () => void isWindowMaximized().then(setMaximized);
    refresh();
    return onWindowResized(refresh);
  }, []);

  return (
    <header data-tauri-drag-region className="flex h-[56px] shrink-0 items-center gap-3 border-b border-edge bg-[#0d0d0d] pl-5">
      <span data-tauri-drag-region className={`text-xl font-bold tracking-tight text-txt ${page === "home" ? "" : "uppercase"}`}>
        {page === "home" ? greeting(userName) : PAGE_TITLES[page]}
      </span>

      <div data-tauri-drag-region className="flex flex-1 justify-center">
        <button
          onClick={() => onNavigate("profiles")}
          title={activeGame ? activeGame.name : "Open Games"}
          className={`flex items-center gap-2.5 rounded-pill border border-edge bg-card px-4 py-2 text-[13px] font-medium transition-colors hover:border-edge2 ${activeGame ? "text-txt" : "text-txt3"}`}
        >
          <Gamepad2 size={16} strokeWidth={1.75} />
          {activeGame ? activeGame.name : "No game detected"}
          <ChevronDown size={14} strokeWidth={2} className="text-txt3" />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <BoostButton compact />

        <span className="text-[12px] font-medium text-txt2">Game Mode</span>
        <button
          onClick={toggleGameMode}
          className={`relative flex h-[22px] w-[46px] items-center rounded-pill border transition-colors ${gameModeEnabled ? "border-accent/60 bg-accent" : "border-edge2 bg-card"}`}
        >
          <span className={`absolute text-[8px] font-bold ${gameModeEnabled ? "left-1.5 text-white" : "right-1.5 text-txt3"}`}>{gameModeEnabled ? "ON" : "OFF"}</span>
          <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${gameModeEnabled ? "translate-x-[26px]" : "translate-x-[3px]"}`} />
        </button>
      </div>

      <div className="flex items-center gap-0.5 pl-1">
        <button onClick={() => void openExternal(DISCORD_INVITE)} title="Free live support" className="grid h-9 w-9 place-items-center rounded-btn text-txt3 transition-colors hover:bg-white/5 hover:text-txt">
          <DiscordIcon className="h-4 w-4 [&_path]:fill-current" />
        </button>
        <button onClick={() => onNavigate("changelog")} title="Recent changes" className="grid h-9 w-9 place-items-center rounded-btn text-txt3 transition-colors hover:bg-white/5 hover:text-txt">
          <Bell size={16} strokeWidth={1.75} />
        </button>
        <button onClick={() => onNavigate("settings")} title="Settings" className="grid h-9 w-9 place-items-center rounded-btn text-txt3 transition-colors hover:bg-white/5 hover:text-txt">
          <Settings size={16} strokeWidth={1.75} />
        </button>
      </div>

      <div className="ml-1 flex h-full items-stretch border-l border-edge">
        <button onClick={() => void minimizeWindow()} className="grid w-[46px] place-items-center text-txt3 transition-colors hover:bg-white/5 hover:text-txt" aria-label="Minimize">
          <Minus size={15} strokeWidth={2} />
        </button>
        <button onClick={() => void toggleMaximizeWindow()} className="grid w-[46px] place-items-center text-txt3 transition-colors hover:bg-white/5 hover:text-txt" aria-label={maximized ? "Restore" : "Maximize"}>
          {maximized ? <Copy size={13} strokeWidth={2} className="-scale-x-100" /> : <Square size={13} strokeWidth={2} />}
        </button>
        <button onClick={() => void closeWindow()} className="grid w-[46px] place-items-center text-txt3 transition-colors hover:bg-accent hover:text-white" aria-label="Close">
          <X size={16} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}
