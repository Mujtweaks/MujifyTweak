import { useState } from "react";

interface GameArtProps {
  name: string;
  appId?: string | null;
  className?: string;
  rounded?: string;
}

/**
 * Real Steam header art by appid, with a deterministic letter tile fallback
 * (never a fake/placeholder box for a non-Steam game or when offline).
 */
export default function GameArt({
  name,
  appId,
  className = "h-11 w-11",
  rounded = "rounded-lg",
}: GameArtProps) {
  const [failed, setFailed] = useState(false);
  const hues = [0, 210, 140, 275, 32, 190];
  const hue = hues[(name.charCodeAt(0) || 0) % hues.length];

  if (appId && !failed) {
    return (
      <img
        src={`https://cdn.cloudflare.steampowered.com/steam/apps/${appId}/header.jpg`}
        alt={name}
        onError={() => setFailed(true)}
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
