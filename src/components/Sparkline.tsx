import { useEffect, useRef } from "react";

interface SparklineProps {
  /** Latest value (0–100). A rolling history is kept internally. */
  value: number | null;
  width?: number;
  height?: number;
  bars?: number;
  color?: string;
}

/**
 * Tiny bar sparkline that accumulates its own rolling history from the live
 * `value` prop — so it animates in real time off the 1 Hz system_stats stream.
 * Renders nothing but honest bars; a null value contributes a zero-height bar.
 */
export default function Sparkline({
  value,
  width = 92,
  height = 26,
  bars = 26,
  color = "#e3000e",
}: SparklineProps) {
  const history = useRef<number[]>(Array(bars).fill(0));
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    history.current = [...history.current.slice(1), value ?? 0];
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const gap = 1.5;
    const barW = (width - gap * (bars - 1)) / bars;
    history.current.forEach((v, i) => {
      const h = Math.max(1, (Math.min(100, v) / 100) * height);
      const x = i * (barW + gap);
      const alpha = 0.35 + (i / bars) * 0.65; // newer bars brighter
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fillRect(x, height - h, barW, h);
    });
    ctx.globalAlpha = 1;
  }, [value, width, height, bars, color]);

  return <canvas ref={canvasRef} style={{ width, height }} />;
}
