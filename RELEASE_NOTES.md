# Beta 3

This update fixes a major bug that stopped optimizations from applying, repairs game detection and logos, and adds two new tools.

## Fixed

- **Optimizations now apply.** If VALORANT or Fortnite was installed, their anti-cheat runs in the background at all times, and Mujify mistook that for being in a game — so it held tweaks back permanently. It now only holds them back while you are actually playing.
- **Game logos now load.** Logos were only ever read from a game's `.exe`. Mujify now also reads Xbox and Game Pass logo files, Steam's own game icons, and falls back to Windows itself. On our test PC this went from 0 of 6 games to 6 of 6.
- **Cover art is no longer stretched or cropped.** Wide Steam banners now fit the tile correctly.
- **Minecraft no longer appears twice.** "Minecraft Launcher" was listed as a separate game.
- **Roblox only appears if Roblox is installed.** Having Roblox Studio no longer counts as having the game.
- **Start with Windows works again.** Reinstalling silently disabled it. It now repairs itself, and stays off if you turned it off deliberately.
- **AI responses no longer stutter.** The full answer is now shown in one smooth pass.
- **Update notes now display correctly.** The last release showed raw formatting symbols.

## Added

- **Services** — turn off Windows background services you don't need. Every service is read live from your PC and explained in plain English, including what you lose. Everything is undone from the Change Log, exactly as it was. Sound, internet, Windows Update and Defender are never offered.
- **Background Apps** — close programs eating memory behind your game. Shows real memory use per app, and measures how much actually comes back. Windows processes, your anti-cheat and your running game can never be closed here.

## Improved

- **Xbox, Game Pass, VALORANT and League of Legends** are now detected once installed, not only while running.
- **Hone, WeMod and Razer Cortex** no longer appear in your games list.
- Warnings now appear only where there is a real cost, instead of on everything.

## Notes

- Optimizing does not turn a low-end PC into a high-end one. Expect smoother, steadier gameplay and real memory back — not double the FPS.
- Turning off services requires administrator rights. Without them, Mujify reports that it could not make the change rather than claiming success.
- Anti-cheat protection is unchanged. Risky tweaks are still held back automatically while a protected game is running.

177 automated tests pass on this build.
