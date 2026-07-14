// Hand-written "What's new" highlights for the current build. Kept local (not
// only on GitHub) so the popup and the Settings → What's New button always work,
// even offline, and the wording is exactly what we want the user to read.
//
// Update the version + notes on each release.

export const WHATS_NEW = {
  version: "0.9.0-beta.9",
  headline: "Your games, seen live.",
  notes: [
    "🎮 Live game detection, fixed — Roblox, Minecraft (Java & Bedrock) and other launcher-less games are now recognised the moment you launch them, so the top bar shows the real active game instead of “None”.",
    "📊 Real FPS & frame-time — with the active game finally detected, the live FPS and frame-pacing capture attaches automatically while you play. Every number is measured on your machine, never invented.",
    "🖥️ GPU dashboard, levelled up — a cleaner layout with a live Ready Score, a real settings checklist, an optimization radar built from your actual config, and one-click Smart Recommendations. Sensors your hardware doesn’t expose read “Not detected”, never a fake value.",
    "🧹 Cleaner, deeper — more one-click categories (Windows Update leftovers, crash dumps, thumbnail cache, delivery-optimization files and more), each with an exact, honest size before you remove anything.",
    "🔔 Notifications that stay — the bell keeps a full history with an unread badge, so a toast you missed is still there to read.",
    "✨ What’s New, on demand — this very panel now lives in Settings, so you can reopen it any time and catch up on every change.",
  ],
} as const;
