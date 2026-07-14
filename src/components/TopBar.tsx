import { useEffect, useRef, useState } from "react";
import { Bell, Check, CheckCheck, ChevronDown, Copy, Gamepad2, Minus, Settings, Square, Trash2, X } from "lucide-react";
import { useToastStore } from "../store/toastStore";
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
  const history = useToastStore((s) => s.history);
  const unread = useToastStore((s) => s.unread);
  const markAllRead = useToastStore((s) => s.markAllRead);
  const clearHistory = useToastStore((s) => s.clearHistory);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!notifOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [notifOpen]);
  const toggleNotif = () => {
    setNotifOpen((v) => {
      if (!v) markAllRead();
      return !v;
    });
  };
  const relTime = (t: number) => {
    const s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };
  const notifTone: Record<string, string> = {
    success: "text-success",
    warning: "text-warning",
    error: "text-accent",
    info: "text-txt2",
  };
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
        <button
          onClick={() => void openExternal(DISCORD_INVITE)}
          title="Join the Discord — free live help"
          className="wiggle mr-1 flex items-center gap-1.5 rounded-btn bg-[#5865F2] px-3 py-1.5 text-[12.5px] font-bold text-white transition-colors hover:bg-[#4752c4]"
        >
          <DiscordIcon className="h-4 w-4 [&_path]:fill-current" /> Join
        </button>
        <div ref={notifRef} className="relative">
          <button onClick={toggleNotif} title="Notifications" className="relative grid h-9 w-9 place-items-center rounded-btn text-txt3 transition-colors hover:bg-white/5 hover:text-txt">
            <Bell size={16} strokeWidth={1.75} />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[9px] font-bold text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-11 z-50 w-[340px] overflow-hidden rounded-2xl border border-edge bg-panel shadow-2xl">
              <div className="flex items-center justify-between border-b border-edge px-4 py-3">
                <span className="text-[13px] font-bold text-txt">Notifications</span>
                {history.length > 0 && (
                  <button onClick={clearHistory} className="flex items-center gap-1 text-[11px] text-txt3 hover:text-accent">
                    <Trash2 size={12} /> Clear
                  </button>
                )}
              </div>
              <div className="max-h-[360px] overflow-y-auto">
                {history.length === 0 ? (
                  <div className="grid place-items-center gap-2 px-4 py-10 text-center">
                    <CheckCheck size={22} className="text-txt3" />
                    <p className="text-[12px] text-txt3">You're all caught up.</p>
                  </div>
                ) : (
                  history.map((n) => (
                    <div key={n.id} className="flex items-start gap-3 border-b border-edge/60 px-4 py-3 last:border-0">
                      <Check size={14} className={`mt-0.5 shrink-0 ${notifTone[n.type] ?? "text-txt2"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-semibold text-txt">{n.title}</p>
                        {n.description && <p className="mt-0.5 text-[11.5px] leading-snug text-txt2">{n.description}</p>}
                        <p className="mt-1 text-[10px] text-txt3">{relTime(n.time)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <button
                onClick={() => { setNotifOpen(false); onNavigate("changelog"); }}
                className="w-full border-t border-edge px-4 py-2.5 text-[11.5px] font-medium text-txt2 transition-colors hover:bg-white/5 hover:text-txt"
              >
                View change log
              </button>
            </div>
          )}
        </div>
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
