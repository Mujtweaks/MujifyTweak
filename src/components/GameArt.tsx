import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../lib/tauri";

interface GameArtProps {
  name: string;
  appId?: string | null;
  className?: string;
  rounded?: string;
}

// name -> Steam appid cache (""=looked up, no match). Resolve each title once so
// non-Steam games (Epic/Xbox/standalone) still get real cover art, not a letter.
const artCache = new Map<string, string>();

// Real Steam art, tried in order: portrait library card (matches the 3:4 tile),
// then the landscape header, then the header on Akamai as a last resort. All on
// *.steamstatic.com — the canonical static CDN (steampowered.com does NOT serve
// this art, which is why the old URL fell through to the letter tile).
const steamUrls = (appId: string): string[] => [
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
  `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
];

/**
 * Real Steam art by appid, with a deterministic letter tile fallback (never a
 * fake/placeholder box for a non-Steam game or when offline).
 */
export default function GameArt({
  name,
  appId,
  className = "h-11 w-11",
  rounded = "rounded-lg",
}: GameArtProps) {
  const [urlIndex, setUrlIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [resolved, setResolved] = useState<string | null>(appId ?? null);

  // Restart the chain when the game changes, and for non-Steam games (no appid)
  // resolve one from the title so they get real art instead of a letter tile.
  useEffect(() => {
    setUrlIndex(0);
    setFailed(false);
    if (appId) {
      setResolved(appId);
      return;
    }
    const cached = artCache.get(name);
    if (cached !== undefined) {
      setResolved(cached || null);
      return;
    }
    if (!isTauri) return;
    let alive = true;
    void invoke<string | null>("resolve_steam_appid", { name })
      .then((id) => {
        artCache.set(name, id ?? "");
        if (alive) setResolved(id ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [name, appId]);

  const hues = [0, 210, 140, 275, 32, 190];
  const hue = hues[(name.charCodeAt(0) || 0) % hues.length];
  const effectiveId = appId ?? resolved;

  if (effectiveId && !failed) {
    const urls = steamUrls(effectiveId);
    return (
      <img
        src={urls[urlIndex] ?? ""}
        alt={name}
        onError={() => {
          if (urlIndex < urls.length - 1) setUrlIndex((i) => i + 1);
          else setFailed(true);
        }}
        draggable={false}
        className={`${className} ${rounded} object-cover`}
      />
    );
  }

  return (
    <span
      className={`${className} ${rounded} grid shrink-0 place-items-center font-display text-lg font-bold text-white/90`}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 55% 24%), hsl(${hue} 50% 12%))`,
      }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
