// Auto-apply per-game profiles — the promised loop, done safely.
//
// SAFETY: the real gate lives in the Rust backend (auto_apply.rs). It refuses
// unless BOTH the master switch (persisted server-side, synced from Settings)
// and the game's own saved profile.auto_apply flag are on — and it reads the
// tweak list from that saved profile, never from here. So this file cannot make
// the backend apply anything the user hasn't opted into twice. When it does act,
// it's the SAME confirmed, anti-cheat-guarded, fully-logged pipeline as a manual
// apply. On game exit (or switching games) the backend reverts exactly what it
// applied — tracked in a crash-safe record on disk, not just in memory here.
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./tauri";
import { useSettingsStore } from "../store/settingsStore";
import { toast } from "../store/toastStore";
import type { ApplyOutcome, GameInfo } from "./types";

// The game we auto-optimized, so we know when to revert and can de-dupe repeat
// events for the same game. The authoritative record of WHICH entries to revert
// lives in the backend (survives a crash); this is only for the toast + de-dup.
let activeGame: string | null = null;
let busy = false;

/** Called on every game_changed event. No-op unless the user opted in (twice). */
export async function onGameChangeAutoApply(newGame: GameInfo | null): Promise<void> {
  if (!isTauri || busy) return;
  busy = true;
  try {
    const sameAsActive =
      activeGame && newGame && activeGame.toLowerCase() === newGame.name.toLowerCase();

    // Game closed or switched → revert exactly what we auto-applied. The backend
    // reverts from its own crash-safe record, so we don't track entry ids here.
    if (activeGame && !sameAsActive) {
      const prev = activeGame;
      activeGame = null;
      const reverted = await invoke<number>("auto_revert_profile");
      if (reverted > 0) toast.info("Auto-revert", `Restored your settings after ${prev}.`);
    }

    // New game launched → let the BACKEND decide (master + profile verified, and
    // the tweak list read, server-side). We only ask; we can't force anything.
    if (newGame && !sameAsActive) {
      // Cheap client short-circuit so we don't call the backend when the master
      // switch is obviously off. The backend re-checks regardless — never the gate.
      if (!useSettingsStore.getState().autoApplyEnabled) return;
      try {
        const outcome = await invoke<ApplyOutcome>("auto_apply_profile", {
          gameName: newGame.name,
        });
        const n = outcome.applied.length;
        if (n > 0) {
          activeGame = newGame.name;
          toast.success(
            `Auto-optimized ${newGame.name}`,
            `${n} tweak${n === 1 ? "" : "s"} applied — reverts automatically when you close the game.`,
          );
        }
      } catch {
        // Backend refused (master off / no opted-in profile for this game) → no-op.
      }
    }
  } catch (err) {
    console.error("auto-apply failed:", err);
  } finally {
    busy = false;
  }
}
