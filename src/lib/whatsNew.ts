// Hand-written "What's new" highlights for the current build. Kept local (not
// only on GitHub) so the popup and the Settings → What's New button always work,
// even offline, and the wording is exactly what we want the user to read.
//
// Update the version + notes on each release.

export const WHATS_NEW = {
  version: "0.9.0-beta.2",
  headline: "Safer, clearer, more of it.",
  notes: [
    "⚠️ Real warnings — tweaks that need caution now show a RED info icon and a plain-English warning right on the card (e.g. power plans warn against laptop overheating; OneDrive/Xbox removal and BitLocker warn before you touch them).",
    "🧩 New tweaks — Disable BitLocker auto-encryption, Set unneeded services to Manual, Remove OneDrive, Remove Xbox app & components, and a “More Pins” Start layout.",
    "🌐 Removed the DNS-changer tweaks (Cloudflare/Google/Quad9/OpenDNS/AdGuard) as requested; renamed “Update P2P Sharing” → “Disable Delivery Optimization” and “End Task” → “Enable End Task on Right-Click”.",
    "🤖 The AI just works now — no more “add your free key” wall. It runs through Mujify’s free proxy out of the box.",
    "🎯 The in-game performance overlay (live FPS/temps on top of your game) moved to the Home page so it’s front-and-centre, and Game Mode is now wired to Windows’ real Game Mode (and remembers its state).",
    "🖼️ Deeper game-logo search so titles that bury their exe (Fortnite, etc.) get their real icon; removed the NPU section from the Optimizer.",
  ],
} as const;
