## Beta 3 — Optimizing actually works again

The big one: **Apply was broken for a lot of you, and it wasn't your fault.**

### Apply is fixed

If you have VALORANT (or anything using Riot Vanguard) installed, Mujify was refusing to apply almost every optimization — permanently, even with no game open.

Vanguard's `vgc.exe` starts with Windows and never exits. Mujify treated any anti-cheat process as "a protected game is running right now" and, by design, holds back everything above Safe risk while a protected game is live. So the guard was stuck on from the moment you booted, and Apply quietly did nothing. EasyAntiCheat's background service caused the same thing.

Now the guard engages only when an anti-cheat is loaded **and** a game is genuinely running — which is what it always meant to do. Idle background services no longer block anything.

The matching was also sloppy: it matched process names by substring, and one of the entries was literally `gg`, so any process with those two letters in its name could trip the guard. It's exact-match now.

The anti-cheat protection itself is unchanged: while you're actually in a protected game, risky tweaks are still held back automatically.

### Game logos

- Games with a subtitle on Steam now find their cover art. Mujify looks for "Warface", Steam lists it as "Warface: Clutch" — that mismatch was why some games showed a plain letter tile.
- Still no wrong covers: "Minecraft" will never be given "Minecraft Dungeons" art. If Mujify isn't confident, it falls back to the game's own icon rather than guessing.
- Cover art no longer looks squashed. Wide Steam banners were being cropped into the tall tile and square game icons were being stretched — both are now framed properly against a blurred backdrop of the art itself.

### Game detection

- **Xbox / Game Pass games are detected when installed**, not only once you're already playing them.
- **Riot games (VALORANT, League) are detected when installed** too.
- **Hone and other rival "optimizers" no longer show up as games in your library.** Same for WeMod, Razer Cortex and friends. They're tools, not games.

### New: Services

A new **Services** tab. Windows runs background services you almost certainly don't need — telemetry, fax, remote registry, Xbox services if you don't use Game Pass. Turning them off frees RAM and stops background disk and CPU work.

- Every service is read live from **your** PC — real start type, real running state. Nothing is assumed.
- Every service is explained in plain English, including **what you lose** — turning off the Print Spooler means you can't print, and Mujify says so rather than letting you find out later.
- Warnings appear only on the ones with a genuine cost. Not on every row.
- Everything is reversible from the Change Log, restoring the exact start type each service had before Mujify touched it.
- Mujify will **not** offer to disable audio, networking, Windows Update or Defender. Those aren't optimizations, they're breakage.

### Honest notes

- **What this won't do:** no service tweak turns weak hardware into strong hardware. Expect steadier frame times rather than a big average-FPS jump. Anyone promising otherwise is selling something.
- Disabling services needs admin rights. Without them the change is **refused and reported** — never silently skipped while claiming success.
- The background-process reducer isn't in this build. It's coming in Beta 4 rather than shipping half-done here.

161 automated tests pass against this build, all proving the apply/undo logic without touching a real machine.
