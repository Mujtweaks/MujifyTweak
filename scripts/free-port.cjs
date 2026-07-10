#!/usr/bin/env node
// Frees a TCP port before Vite binds to it. `tauri dev`'s beforeDevCommand runs
// this via `npm run dev`, so a leftover node/vite process from an interrupted
// previous session (very common on Windows — Ctrl+C / closing the terminal
// often doesn't kill the whole `tauri dev` -> npm -> vite process tree) no
// longer blocks the next launch with "Port 1420 is already in use". Only kills
// the exact PID actually LISTENING on the port; everything else is untouched.
// Always logs what it found/did (or why it couldn't) — never fails silently.
const { execSync } = require("node:child_process");

const port = String(process.argv[2] || "1420");

function killWindows(port) {
  let out;
  try {
    out = execSync("netstat -ano", { encoding: "utf8" });
  } catch (e) {
    console.warn(`[free-port] netstat failed: ${e.message}`);
    return;
  }
  const pids = new Set();
  for (const rawLine of out.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.toUpperCase().startsWith("TCP")) continue;
    const cols = line.split(/\s+/); // Proto, Local Address, Foreign Address, State, PID
    if (cols.length < 5) continue;
    const local = cols[1];
    const state = cols[3];
    const pid = cols[4];
    if (state !== "LISTENING") continue;
    const m = local.match(/:(\d+)$/); // handles both 0.0.0.0:PORT and [::1]:PORT
    if (m && m[1] === port) pids.add(pid);
  }
  if (pids.size === 0) {
    console.log(`[free-port] nothing currently listening on port ${port}`);
    return;
  }
  for (const pid of pids) {
    if (pid === String(process.pid)) continue;
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: "pipe" });
      console.log(`[free-port] killed stale process ${pid} holding port ${port}`);
    } catch (e) {
      console.warn(`[free-port] couldn't kill PID ${pid} (may need elevation): ${String(e.message).split("\n")[0]}`);
    }
  }
}

function killUnix(port) {
  let out;
  try {
    out = execSync(`lsof -ti tcp:${port}`, { encoding: "utf8" }).trim();
  } catch {
    console.log(`[free-port] nothing currently listening on port ${port}`);
    return;
  }
  for (const pid of out.split("\n").filter(Boolean)) {
    try {
      execSync(`kill -9 ${pid}`);
      console.log(`[free-port] killed stale process ${pid} holding port ${port}`);
    } catch (e) {
      console.warn(`[free-port] couldn't kill PID ${pid}: ${e.message}`);
    }
  }
}

if (process.platform === "win32") killWindows(port);
else killUnix(port);
