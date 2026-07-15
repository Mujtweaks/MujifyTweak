import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../lib/tauri";

interface GameArtProps {
  name: string;
  appId?: string | null;
  /** Game exe or install folder — used to pull the REAL exe icon when the game
   *  isn't on Steam (Roblox, Minecraft, …), so it gets a logo not a letter. */
  path?: string | null;
  className?: string;
  rounded?: string;
}

// name -> Steam appid cache (""=looked up, no match). Resolve each title once so
// non-Steam games (Epic/Xbox/standalone) still get real cover art, not a letter.
const artCache = new Map<string, string>();
// path -> extracted-icon data URI cache (""=tried, none). Extract each exe once.
const iconCache = new Map<string, string>();

/** How a source image is shaped, which decides how it's framed in a 3:4 tile. */
type ArtKind = "portrait" | "landscape" | "icon";

// Real Steam art, tried best-fit first. All on *.steamstatic.com — the canonical
// static CDN (steampowered.com does NOT serve this art, which is why the old URL
// fell through to the letter tile).
//
// `hero_capsule` (374x448) matters: plenty of older games have NO portrait art
// at all — Watch_Dogs 404s on both library_600x900 sizes — and without this they
// dropped straight to the 460x215 landscape banner, which looks wrong in a tall
// tile no matter how it's framed. hero_capsule is nearly 3:4, so it just fits.
const steamSources = (appId: string): { url: string; kind: ArtKind }[] => [
  { url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`, kind: "portrait" },
  { url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`, kind: "portrait" },
  { url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/hero_capsule.jpg`, kind: "portrait" },
  { url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`, kind: "landscape" },
  { url: `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`, kind: "landscape" },
];

/**
 * Frame art that isn't already 3:4 (a landscape header, or a square exe icon)
 * against a blurred, scaled-up copy of itself.
 *
 * Cropping a 460x215 header into a 3:4 tile cut the title off, and letterboxing
 * a 256px icon left dead bars — both were why the logos looked wrong even when
 * they loaded. Containing the real image over its own blurred backdrop keeps the
 * whole logo readable and fills the tile. Nothing is invented: the backdrop is
 * the same pixels as the artwork.
 */
function FramedArt({
  src,
  alt,
  kind,
  className,
  rounded,
  onError,
}: {
  src: string;
  alt: string;
  kind: ArtKind;
  className: string;
  rounded: string;
  onError?: () => void;
}) {
  return (
    <span className={`${className} ${rounded} relative block shrink-0 overflow-hidden bg-black/40`}>
      <span
        aria-hidden
        className="absolute inset-0 scale-150 bg-cover bg-center blur-lg saturate-150"
        style={{ backgroundImage: `url("${src}")`, opacity: 0.5 }}
      />
      <img
        src={src}
        alt={alt}
        onError={onError}
        draggable={false}
        className={`relative h-full w-full object-contain ${kind === "icon" ? "p-[16%]" : ""}`}
      />
    </span>
  );
}

/**
 * Real Steam art by appid, then the game's own exe icon, with a deterministic
 * letter tile as the last resort (never a fake/placeholder cover for a game we
 * couldn't identify, and never another game's cover).
 */
export default function GameArt({
  name,
  appId,
  path,
  className = "h-11 w-11",
  rounded = "rounded-lg",
}: GameArtProps) {
  const [urlIndex, setUrlIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [resolved, setResolved] = useState<string | null>(appId ?? null);
  // Extracted exe-icon data URI (the real logo for non-Steam games).
  const [iconUri, setIconUri] = useState<string | null>(path ? iconCache.get(path) ?? null : null);

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

  const effectiveId = appId ?? resolved;
  // Steam art is the better source when it exists, so only dig the icon out of
  // the exe when we actually need it: no appid, or the CDN had no art for this
  // title. (Extraction walks the game's folder — not worth doing for a game
  // whose cover already loaded.) Cached per path.
  const needsIcon = !effectiveId || failed;

  // Pull the REAL icon out of the game's exe (data URI, CSP-allowed) so it shows
  // a logo instead of a letter.
  useEffect(() => {
    if (!path || !isTauri || !needsIcon) return;
    const cached = iconCache.get(path);
    if (cached !== undefined) {
      setIconUri(cached || null);
      return;
    }
    let alive = true;
    void invoke<string | null>("game_icon", { path })
      .then((uri) => {
        iconCache.set(path, uri ?? "");
        if (alive) setIconUri(uri ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [path, needsIcon]);

  const hues = [0, 210, 140, 275, 32, 190];
  const hue = hues[(name.charCodeAt(0) || 0) % hues.length];

  if (effectiveId && !failed) {
    const sources = steamSources(effectiveId);
    const source = sources[urlIndex];
    if (source) {
      const next = () => {
        if (urlIndex < sources.length - 1) setUrlIndex((i) => i + 1);
        else setFailed(true);
      };
      // Portrait art already matches the tile — show it edge to edge.
      if (source.kind === "portrait") {
        return (
          <img
            src={source.url}
            alt={name}
            onError={next}
            draggable={false}
            className={`${className} ${rounded} shrink-0 object-cover`}
          />
        );
      }
      return (
        <FramedArt
          src={source.url}
          alt={name}
          kind={source.kind}
          className={className}
          rounded={rounded}
          onError={next}
        />
      );
    }
  }

  // No Steam cover → the game's own exe icon (real logo for Roblox/Fortnite/…).
  if (iconUri) {
    return <FramedArt src={iconUri} alt={name} kind="icon" className={className} rounded={rounded} />;
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
