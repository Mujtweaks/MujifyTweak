#!/usr/bin/env node
// Frees a TCP port before Vite binds to it. `tauri dev`'s beforeDevCommand runs
// this via `npm run dev`, so a leftover node/vite process from an interrupted
// previous session (very common on Windows — Ctrl+C / closing the terminal
// often doesn't kill the whole `tauri dev` -> npm -> vite process tree) no
// longer blocks the next launch with "Port 1420 is already in use". Only kills
// the exact PID actually LISTENING on the port; everything else is untouched.
const { execSync } = require("node:child_process");

const port = process.argv[2] || "1420";

function killWindows(port) {
  let out;
  try {
    out = execSync("netstat -ano -p tcp", { encoding: "utf8" });
  } catch {
    return;
  }
  const pids = new Set();
  for (const line of out.split("\n")) {
    const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
    if (m && m[1] === String(port)) pids.add(m[2]);
  }
  for (const pid of pids) {
    if (pid === String(process.pid)) continue;
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
      console.log(`[free-port] killed stale process ${pid} holding port ${port}`);
    } catch {
      /* already gone, or needs elevation — ignore, vite will report clearly if it's still stuck */
    }
  }
}

function killUnix(port) {
  try {
    const out = execSync(`lsof -ti tcp:${port}`, { encoding: "utf8" }).trim();
    for (const pid of out.split("\n").filter(Boolean)) {
      execSync(`kill -9 ${pid}`);
      console.log(`[free-port] killed stale process ${pid} holding port ${port}`);
    }
  } catch {
    /* nothing listening, or lsof unavailable — ignore */
  }
}

if (process.platform === "win32") killWindows(port);
else killUnix(port);
