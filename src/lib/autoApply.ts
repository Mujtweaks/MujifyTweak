// Auto-apply per-game profiles — the promised loop, done safely.
//
// SAFETY: this only ever changes the system when the user has opted in TWICE:
//   1. the global master switch (Settings → autoApplyEnabled, OFF by default), and
//   2. the specific profile's own `autoApply` flag (OFF by default).
// With either off, this is a complete no-op. When it does act, it goes through
// the SAME confirmed, anti-cheat-guarded, fully-logged apply_tweaks pipeline as a
// manual apply — so every change is in the Change Log and reverts precisely. On
// game exit (or switching games) it reverts exactly what it applied, nothing else.
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./tauri";
import { listProfiles } from "./backend";
import { useSettingsStore } from "../store/settingsStore";
import { useGameStore } from "../store/gameStore";
import { toast } from "../store/toastStore";
import type { ApplyOutcome, GameInfo } from "./types";

// What we auto-applied for the currently-running game, so we can revert exactly
// those entries (and only those) when it closes.
let active: { game: string; entryIds: string[] } | null = null;
let busy = false;

async function revertEntries(ids: string[]) {
  for (const id of ids) {
    try {
      await invoke("revert_single", { entryId: id, confirm: true });
    } catch {
      /* keep reverting the rest even if one fails */
    }
  }
}

/** Called on every game_changed event. No-op unless the user opted in. */
export async function onGameChangeAutoApply(newGame: GameInfo | null): Promise<void> {
  if (!isTauri || busy) return;
  busy = true;
  try {
    const sameAsActive =
      active && newGame && active.game.toLowerCase() === newGame.name.toLowerCase();

    // Game closed or switched → revert exactly what we auto-applied.
    if (active && !sameAsActive) {
      const { entryIds, game } = active;
      active = null;
      if (entryIds.length) {
        await revertEntries(entryIds);
        toast.info("Auto-revert", `Restored your settings after ${game}.`);
      }
    }

    // New game launched → auto-apply only when opted in (master + profile flag).
    if (newGame && !sameAsActive) {
      if (!useSettingsStore.getState().autoApplyEnabled) return; // master off
      const profiles = await listProfiles();
      const p = profiles.find(
        (x) =>
          x.autoApply &&
          x.enabledTweaks.length > 0 &&
          x.gameName.toLowerCase() === newGame.name.toLowerCase(),
      );
      if (!p) return; // no opted-in profile for this game

      const antiCheatActive = useGameStore.getState().antiCheatActive;
      const outcome = await invoke<ApplyOutcome>("apply_tweaks", {
        ids: p.enabledTweaks,
        confirm: true,
        antiCheatActive,
      });
      const ids = outcome.applied.map((e) => e.id);
      if (ids.length) {
        active = { game: newGame.name, entryIds: ids };
        toast.success(
          `Auto-optimized ${newGame.name}`,
          `${ids.length} tweak${ids.length === 1 ? "" : "s"} applied — reverts automatically when you close the game.`,
        );
      }
    }
  } catch (err) {
    console.error("auto-apply failed:", err);
  } finally {
    busy = false;
  }
}
