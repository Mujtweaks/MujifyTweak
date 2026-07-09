// Renders a Before/After report to a branded PNG for sharing. Drawn with the
// Canvas 2D API (no dependency, full control) so it exactly mirrors the app's
// honesty: only MEASURED values appear — a metric that wasn't captured (e.g. FPS
// with no game presenting) shows "not measured", never a fabricated number.
import logoUrl from "../assets/logo.png";
import { WEBSITE } from "./links";
import type { BenchmarkReport, MetricDelta } from "./types";

const W = 1000;
const H = 560;
const SCALE = 2; // render at 2x for a crisp image
const C = {
  bg: "#0A0A0A",
  accent: "#E3000E",
  good: "#2FD466",
  txt: "#F5F5F7",
  txt2: "#8E8E95",
  txt3: "#5A5A62",
  edge: "#26262c",
};

let logoImg: HTMLImageElement | null = null;
function loadLogo(): Promise<HTMLImageElement | null> {
  if (logoImg) return Promise.resolve(logoImg);
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      logoImg = img;
      res(img);
    };
    img.onerror = () => res(null);
    img.src = logoUrl;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function deltaLabel(m: MetricDelta): { text: string; color: string } {
  if (!m.measured) return { text: "not measured", color: C.txt2 };
  if (m.deltaPct == null) return { text: "—", color: C.txt2 };
  const improved = m.better === "higher" ? m.deltaPct > 0 : m.deltaPct < 0;
  const flat = Math.abs(m.deltaPct) < 1;
  const arrow = flat ? "→" : improved ? "▲" : "▼";
  const color = flat ? C.txt2 : improved ? C.good : C.accent;
  return { text: `${arrow} ${m.deltaPct > 0 ? "+" : ""}${m.deltaPct.toFixed(1)}%`, color };
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

export async function renderShareCard(report: BenchmarkReport): Promise<HTMLCanvasElement> {
  try {
    await (document as any).fonts?.ready;
  } catch {
    /* fonts optional */
  }
  const logo = await loadLogo();

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "alphabetic";

  // Background + soft red glow.
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W - 130, 30, 20, W - 130, 30, 460);
  glow.addColorStop(0, "rgba(227,0,14,0.14)");
  glow.addColorStop(1, "rgba(227,0,14,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Frame + accent bar.
  ctx.strokeStyle = C.edge;
  ctx.lineWidth = 2;
  roundRect(ctx, 12, 12, W - 24, H - 24, 20);
  ctx.stroke();
  ctx.fillStyle = C.accent;
  roundRect(ctx, 12, 12, W - 24, 6, 4);
  ctx.fill();

  const PAD = 52;

  // Header: logo + "PERFORMANCE REPORT".
  if (logo && logo.height > 0) {
    const lh = 34;
    const lw = logo.width * (lh / logo.height);
    ctx.drawImage(logo, PAD, 40, Math.min(lw, 150), lh);
  } else {
    ctx.fillStyle = C.txt;
    ctx.font = "800 24px Inter, system-ui, sans-serif";
    ctx.fillText("MUJIFY TWEAKS", PAD, 66);
  }
  ctx.fillStyle = C.txt3;
  ctx.font = "700 13px Inter, system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("PERFORMANCE REPORT", W - PAD, 62);
  ctx.textAlign = "left";

  // Title + date.
  ctx.fillStyle = C.txt;
  ctx.font = "800 34px Inter, system-ui, sans-serif";
  ctx.fillText(report.gameName || "System Performance", PAD, 128);
  ctx.fillStyle = C.txt3;
  ctx.font = "500 13px Inter, system-ui, sans-serif";
  ctx.fillText(new Date(report.createdAt).toLocaleString(), PAD, 152);

  // Table header.
  const colBefore = 560;
  const colAfter = 690;
  const right = W - PAD;
  let y = 200;
  ctx.font = "700 12px Inter, system-ui, sans-serif";
  ctx.fillStyle = C.txt3;
  ctx.fillText("METRIC", PAD, y);
  ctx.fillText("BEFORE", colBefore, y);
  ctx.fillText("AFTER", colAfter, y);
  ctx.textAlign = "right";
  ctx.fillText("CHANGE", right, y);
  ctx.textAlign = "left";

  // Rows (honest: hide the FPS row only when it wasn't measured, like the app).
  const rows = report.metrics.filter((m) => m.measured || m.label !== "Avg FPS").slice(0, 6);
  const fmt = (v: number | null) => (v == null ? "—" : v.toFixed(1));
  y += 12;
  for (const m of rows) {
    y += 40;
    ctx.strokeStyle = C.edge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, y - 26);
    ctx.lineTo(right, y - 26);
    ctx.stroke();

    ctx.fillStyle = C.txt2;
    ctx.font = "500 16px Inter, system-ui, sans-serif";
    ctx.fillText(m.label, PAD, y);
    ctx.fillStyle = C.txt;
    ctx.fillText(m.measured ? fmt(m.before) : "—", colBefore, y);
    ctx.fillText(m.measured ? fmt(m.after) : "—", colAfter, y);
    const d = deltaLabel(m);
    ctx.fillStyle = d.color;
    ctx.font = "700 16px Inter, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(d.text, right, y);
    ctx.textAlign = "left";
  }

  // Verdict.
  ctx.fillStyle = C.txt2;
  ctx.font = "500 14px Inter, system-ui, sans-serif";
  const vLines = wrap(ctx, report.verdict, W - PAD * 2, 2);
  let vy = y + 44;
  for (const line of vLines) {
    ctx.fillText(line, PAD, vy);
    vy += 20;
  }

  // Footer.
  ctx.fillStyle = C.txt3;
  ctx.font = "600 13px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`Mujify Tweaks — free forever · ${WEBSITE.replace(/^https?:\/\//, "")}`, W / 2, H - 34);
  ctx.textAlign = "left";

  return canvas;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"),
  );
}

/** Copy the report card PNG to the clipboard (the main share path). */
export async function copyShareImage(report: BenchmarkReport): Promise<void> {
  const canvas = await renderShareCard(report);
  const blob = await toBlob(canvas);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

/** Trigger a Save-As download of the report card PNG. */
export async function saveShareImage(report: BenchmarkReport): Promise<void> {
  const canvas = await renderShareCard(report);
  const name = (report.gameName || "report").replace(/\s+/g, "-").toLowerCase();
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `mujify-${name}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
