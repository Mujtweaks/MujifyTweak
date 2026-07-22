// Single source of truth for external links. Every one of these opens in the
// SYSTEM default browser (never inside the app window), via the opener plugin's
// strict allowlist capability. Keep this list tight — only what the allowlist
// permits belongs here. The website is a one-line swap when the final domain
// is chosen.
export const DISCORD_INVITE = "https://discord.gg/zg4WXbJ9uw";
export const WEBSITE = "https://mujifytweaks.site.je";
export const GITHUB_REPO = "https://github.com/Mujtweaks/MujifyTweak";
export const GITHUB_RELEASES = "https://github.com/Mujtweaks/MujifyTweak/releases";
/** Where users read what changed — the public changelog page on the website.
 *  Verified live (title "Updates — Mujify Tweaks changelog"). Covered by the
 *  opener allowlist entry `https://mujifytweaks.site.je/*`. */
export const UPDATES_PAGE = "https://mujifytweaks.site.je/Updates.html";
// Where a user gets their own free NVIDIA NIM API key (for the AI Assistant).
export const NVIDIA_KEYS_URL = "https://build.nvidia.com";

// Anonymous "online" ping endpoint (the Cloudflare Worker, kept in the owner's
// private local store outside this repo — see the owner dashboard notes).
// The worker exists at this URL (host is allowlisted in tauri.conf.json's CSP
// connect-src). Until the real counter code is deployed there, the placeholder
// responds harmlessly and the heartbeat's errors are swallowed — never an issue.
export const ANALYTICS_ENDPOINT = "https://mujify-stats.cheaplabs2-4b2.workers.dev";

// The only URLs the app may open externally (defense-in-depth on top of the
// Tauri opener capability allowlist). NOTE: if the website domain changes, update
// it here AND in src-tauri/capabilities/default.json.
const ALLOWED = [DISCORD_INVITE, WEBSITE, GITHUB_RELEASES, NVIDIA_KEYS_URL];

/** Open an external link in the SYSTEM browser — never inside the app window.
 *  Refuses anything not in the allowlist. */
export async function openExternal(url: string): Promise<void> {
  const ok = ALLOWED.some((a) => url === a || url.startsWith(a));
  if (!ok) {
    console.warn("blocked non-allowlisted external url:", url);
    return;
  }
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch (e) {
    console.error("openUrl failed:", e);
  }
}
