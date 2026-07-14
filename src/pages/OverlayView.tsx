import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { FrameStats, SystemStats } from "../lib/types";

// The tiny in-game overlay window (loaded at #overlay). It listens to the SAME
// live events the main app does, so every number is real. Which rows to show is
// read from localStorage (shared with the main window) and updates live.

const ALL_METRICS = ["fps", "cpu", "gpu", "cputemp", "gputemp", "ram"] as const;
type Metric = (typeof ALL_METRICS)[number];

function readMetrics(): Metric[] {
  try {
    const raw = localStorage.getItem("mujify.overlay.metrics");
    if (!raw) return ["fps", "cpu", "gpu", "cputemp", "gputemp"];
    const arr = JSON.parse(raw) as string[];
    return ALL_METRICS.filter((m) => arr.includes(m));
  } catch {
    return ["fps", "cpu", "gpu", "cputemp", "gputemp"];
  }
}

function tone(kind: Metric, v: number | null): string {
  if (v == null) return "#8a8a92";
  if (kind === "fps") return v >= 90 ? "#22c55e" : v >= 45 ? "#f59e0b" : "#e3000e";
  if (kind === "cputemp" || kind === "gputemp") return v >= 85 ? "#e3000e" : v >= 72 ? "#f59e0b" : "#22c55e";
  return v >= 90 ? "#e3000e" : v >= 70 ? "#f59e0b" : "#e6e6ea";
}

export default function OverlayView() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [frame, setFrame] = useState<FrameStats | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>(readMetrics);

  useEffect(() => {
    // The overlay window must be see-through — clear any app background.
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    const un1 = listen<SystemStats>("system_stats", (e) => setStats(e.payload));
    const un2 = listen<FrameStats>("frame_stats", (e) => setFrame(e.payload));
    const onStorage = () => setMetrics(readMetrics());
    window.addEventListener("storage", onStorage);
    return () => {
      void un1.then((f) => f());
      void un2.then((f) => f());
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const rows = (
    [
      { key: "fps", label: "FPS", value: frame?.avgFps ?? null, unit: "" },
      { key: "cpu", label: "CPU", value: stats?.cpuUsagePercent ?? null, unit: "%" },
      { key: "gpu", label: "GPU", value: stats?.gpuUsagePercent ?? null, unit: "%" },
      { key: "cputemp", label: "CPU °C", value: stats?.cpuTempC ?? null, unit: "" },
      { key: "gputemp", label: "GPU °C", value: stats?.gpuTempC ?? null, unit: "" },
      { key: "ram", label: "RAM", value: stats?.ramUsagePercent ?? null, unit: "%" },
    ] as { key: Metric; label: string; value: number | null; unit: string }[]
  ).filter((r) => metrics.includes(r.key));

  return (
    <div style={{ padding: 6, background: "transparent" }}>
      <div
        style={{
          display: "inline-flex",
          flexDirection: "column",
          gap: 2,
          padding: "8px 11px",
          borderRadius: 10,
          background: "rgba(10,10,10,0.72)",
          border: "1px solid rgba(255,255,255,0.08)",
          fontFamily: "ui-monospace, Menlo, Consolas, monospace",
          fontSize: 13,
          fontWeight: 700,
          minWidth: 96,
        }}
      >
        {rows.map((r) => (
          <div key={r.key} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ color: "#8a8a92" }}>{r.label}</span>
            <span style={{ color: tone(r.key, r.value), fontVariantNumeric: "tabular-nums" }}>
              {r.value == null ? "—" : `${Math.round(r.value)}${r.unit}`}
            </span>
          </div>
        ))}
        {rows.length === 0 && <span style={{ color: "#8a8a92" }}>No metrics selected</span>}
      </div>
    </div>
  );
}
