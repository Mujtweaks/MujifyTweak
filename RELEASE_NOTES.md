# Beta 3

The big one: **Optimizing works again.** If Apply did nothing for you before, that was our bug, not you.

## Apply is fixed

Do you have VALORANT installed? Then Mujify was refusing to apply almost every optimization — always, even with no game open.

Here's why. VALORANT's anti-cheat, Vanguard, starts with Windows and never stops. Mujify saw it running and thought "a protected game is on right now", so it held back every tweak to keep you safe. But no game was on. It was just Vanguard sitting there. So the block never lifted, and Apply quietly did nothing. Fortnite's anti-cheat did the same thing.

Now Mujify only holds tweaks back when an anti-cheat is running **and** you are actually in a game. That is what it was always meant to do.

You are still protected. While you really are in a game, risky tweaks are still held back automatically.

## Your games look right now

**Game logos actually show up.** Before, a lot of games showed a plain letter in a coloured box. We found the real reason: Mujify was only looking for logos inside the game's `.exe` file. That works for some games and not others. Xbox and Game Pass games keep their logo in a separate picture file. Steam saves each game's icon as its own file. Some games lock their folder so nothing can read it at all.

Mujify now checks all of those places, and asks Windows itself for the icon if everything else fails. On our test PC this took logos from 0 out of 6 games to 6 out of 6.

**No more squashed art.** Wide Steam banners were being cut off to fit the tall tile. Fixed.

**Minecraft shows once, not twice.** "Minecraft Launcher" was showing as a separate game next to Minecraft. It is the same game. Our mistake, now fixed.

**Roblox only shows if you have Roblox.** Having Roblox Studio (the game maker) is not the same as having the game. Mujify was treating them as one.

## Your games are found now

- **Xbox and Game Pass games** show up as soon as they are installed — not only while you are playing them.
- **VALORANT and League of Legends** do the same.
- **Hone and other "optimizers" are gone from your games list.** So are WeMod and Razer Cortex. They are tools, not games.

## New: Services

Windows runs background services you almost certainly don't need. Fax. Remote Registry. Xbox services, if you never touch Game Pass. Turning them off frees memory and stops background work on your disk.

- Read live from **your** PC. Nothing is guessed.
- Written in plain English, including **what you lose**. Turn off the print service and you can't print. We say so up front instead of letting you find out later.
- Warnings only where there's a real cost. Not on every single row.
- Undo anything from the Change Log. It puts each service back exactly how it was.
- Mujify will **never** offer to turn off your sound, your internet, Windows Update or Defender. That's breaking your PC, not speeding it up.

## New: Background Apps

Closes the programs sitting behind your game eating memory.

- Only shows apps we can actually name and explain. No giant list of confusing Windows processes to shoot at.
- Shows the real memory each app is using. Chrome runs about 20 processes at once — they're added up into one line, and it's usually the biggest number on the page.
- The memory you get back is **measured for real**, before and after. If Windows gives nothing back, we say nothing came back.
- **Windows itself, your anti-cheat, and the game you're playing can never be closed here.** That's locked in the app's core, not just hidden from the screen.
- Warnings where it matters: closing a browser loses your tabs, closing MSI Afterburner drops your overclock, closing Discord drops you out of voice chat.
- This one has no undo, because there's nothing to undo — just open the app again when you want it back. We'd rather say that than pretend.

## Smaller fixes

- **The AI reads properly now.** Its answers used to jump and stutter as they arrived. It now waits for the full answer, then shows it smoothly.
- **This window looks right.** Last update showed you raw `##` and `**` symbols. Sorry about that.
- **Mujify starts with Windows again.** It was meant to already, but reinstalling quietly broke it. It now fixes itself. If you turned it off on purpose, it stays off.

## Being straight with you

None of this turns a weak PC into a strong one. Nothing can. What you get is smoother, steadier gameplay, and real memory back when something was hogging it. Anyone promising you double the FPS is selling something.

Turning services off needs admin rights. Without them, Mujify tells you it couldn't do it. It will never claim something worked when it didn't.

177 automated tests pass on this build. All of them prove the undo works without touching a real PC.
