import { useEffect, useState } from "react";

interface GameArtProps {
  name: string;
  appId?: string | null;
  className?: string;
  rounded?: string;
}

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

  // If this tile instance is reused for a different game, restart the chain.
  useEffect(() => {
    setUrlIndex(0);
    setFailed(false);
  }, [appId]);

  const hues = [0, 210, 140, 275, 32, 190];
  const hue = hues[(name.charCodeAt(0) || 0) % hues.length];

  if (appId && !failed) {
    const urls = steamUrls(appId);
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
