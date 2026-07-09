# Mujify Tweaks

**A free Windows gaming optimizer that diagnoses what's actually slowing your PC down, fixes it honestly, and proves the gain with a real before/after benchmark.**

Red/black desktop app built with Tauri v2 (Rust) + React/TypeScript. 100% free — no telemetry, no account, no paywall.

> Status: `0.9.0-beta.1` — feature-complete core, entering pre-release testing.

---

## Why it exists

Every free optimizer (Razer Cortex, Game Booster, IObit, and friends) does the same five things — kill background apps, flip the power plan, free RAM, poke a couple of GPU settings — without ever diagnosing what's limiting *your* specific PC in *your* specific game. Several have documented histories of real harm (display corruption, auto-overclock crashes, broken Windows installs).

Registry/service tweaks have a hard ceiling of ~3–10% FPS. The things that actually cost you 30–60% are **misconfigurations** (RAM stuck below its rated speed, a game running on the integrated GPU, Memory Integrity on) and **in-game graphics settings** (worth 30–200%). Mujify is built to find and fix *those* — and to never claim a gain it can't measure.

## Features

- **Bottleneck / Health Scan** — read-only diagnosis of the one setting quietly costing you performance (RAM below XMP/EXPO, monitor below its max refresh, power plan, a named background CPU hog, GPU driver age, Core Isolation/HVCI, and more), each with an honest FPS-cost range and whether it's one-click / BIOS / manual.
- **Game Settings Advisor** — classifies your hardware tier (GPU/CPU/VRAM/RAM + XeSS/DLSS/FSR support) and recommends the exact in-game graphics settings for it, per game, with impact tiers and visual-cost notes. Vendor-neutral (works on Intel Arc, not just NVIDIA).
- **Per-game tweak profiles** — curated recommendations you apply with one confirmation.
- **Before/After proof** — capture a 60s baseline, apply, capture a 60s post-run; the verdict is noise-aware and only claims a real change when it clearly beats run-to-run variance.
- **Fixes Hub** — real, reversible Windows repairs (network stack, audio, game services, SFC/DISM, …).
- **AI Assistant** — grounded in your real live stats and change log (bring your own free NVIDIA NIM key).
- **Full plain-English Change Log** with per-item and one-click **Revert All**.

## The safety architecture (in plain English)

Mujify's whole design is "you can always undo it, and nothing happens without your click":

- **Nothing is applied without your confirmation.** Every change goes through a single gateway that shows you the exact change first.
- **Every change is captured before it's made.** We record the precise prior value (registry value, service state, power plan, display mode) so a revert restores *exactly* that — not a generic default.
- **Everything is logged.** The Change Log is a complete plain-English history in `%AppData%\MujifyTweaks`; entries are never deleted, only marked reverted.
- **Uninstall-safe.** If you uninstall while tweaks are applied, the uninstaller runs `--revert-all` first and restores your original settings before removing any files.
- **Anti-cheat-safe by construction.** No code injection, no driver hooks, no touching game memory — ever. Risky tweaks auto-refuse while a protected anti-cheat game is running.
- **No telemetry.** No data ever leaves your machine. Logs are local only (Settings → About → Open logs folder).
- **Proven by tests, not on your machine.** The apply/undo logic is verified by `cargo test` against a mock Windows layer; the real code path only runs when you click Apply.

## Screenshots

_(placeholder — add dashboard / health-scan / before-after screenshots here before publishing)_

## Build from source

**Prerequisites (Windows):**
- [Rust](https://rustup.rs/) (stable, `x86_64-pc-windows-msvc`) + Visual Studio Build Tools with the "Desktop development with C++" workload
- [Node.js](https://nodejs.org/) 20+
- [.NET SDK 8](https://dotnet.microsoft.com/) — only needed to (re)build the temperature sidecar
- WebView2 runtime (preinstalled on Windows 11)

```bash
npm install
npm run tauri dev      # run the app in dev
npm run tauri build    # produce the NSIS installer in src-tauri/target/release/bundle/nsis
cargo test --manifest-path src-tauri/Cargo.toml   # run the backend test suite
```

## Release configuration (do this before publishing releases)

The auto-updater is intentionally a no-op until you point it at a **public** repo. There are exactly three spots to update (the app runs fine and skips update checks gracefully until then):

1. **`src-tauri/tauri.conf.json`** → `plugins.updater.endpoints` — replace `REPLACE_WITH_GITHUB_OWNER` with your GitHub owner.
2. **`src/pages/Settings.tsx`** → `REPO_URL` — the "View on GitHub" link.
3. **`.github/workflows/release.yml`** — CI already signs + publishes on a `v*` tag; set the repo secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (the minisign public key is already in `tauri.conf.json`). The private key `mujify-updater.key` is git-ignored.

The updater's unauthenticated fetch can't reach **private**-repo release assets — the repo (or the hosted `latest.json` + installer) must be public.

## License

Recommended: **GPL-3.0-or-later** (see `LICENSE`). Rationale: it's a strong copyleft license, so anyone who forks or redistributes Mujify must also keep it free and open-source. That's the best fit for a tool whose whole pitch is "genuinely free, unlike the paywalled competition" — it structurally prevents someone taking it closed-source and selling it. The tradeoff is that others can't build *closed/commercial* products on top of it; if you'd prefer to allow that, MIT is the permissive alternative (at the cost of allowing paywalled forks).

Bundled third-party components keep their own licenses: PresentMon (MIT, Intel/GameTechDev) and the LibreHardwareMonitor wrapper (MPL-2.0) ship as separate sidecar executables.

## Tech stack

Tauri v2 · Rust · React 19 + TypeScript · Tailwind v4 · Zustand · Recharts · lucide-react · NVIDIA Nemotron (NIM) for the AI assistant · PresentMon + LibreHardwareMonitor sidecars.
