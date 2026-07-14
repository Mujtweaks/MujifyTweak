// Hand-written "What's new" highlights for the current build. Kept local (not
// only on GitHub) so the popup and the Settings → What's New button always work,
// even offline, and the wording is exactly what we want the user to read.
//
// Update the version + notes on each release.

export const WHATS_NEW = {
  version: "0.9.0-beta.10",
  headline: "Your stats, on screen.",
  notes: [
    "🎯 In-game overlay — a small, always-on-top, click-through panel showing live FPS, CPU, GPU and temperatures while you play, MSI-Afterburner style. Turn it on in Settings → In-Game Overlay and tick exactly which stats you want. Every number is measured, never faked. (Works over borderless & windowed games; Windows can’t overlay true exclusive-fullscreen without hooking, which we never do.)",
    "🛑 Fixed “Claude detected as a game” — and Spotify, Discord and other apps too. They were being mistaken for games because they live in the Windows Apps folder; that folder is no longer treated as a game library.",
    "🎮 Live game detection — Roblox and Minecraft (and other launcher-less games) are recognised the moment you launch them, so the top bar shows the real active game and FPS capture attaches automatically.",
    "🧹 Cleaner, deeper — Windows Update cache, Delivery Optimization, thumbnails, web cache, error reports and Prefetch, each with an exact, honest size.",
    "🔔 Notification history in the bell, and ✨ this What’s New panel now lives in Settings so you can reopen it any time.",
  ],
} as const;
