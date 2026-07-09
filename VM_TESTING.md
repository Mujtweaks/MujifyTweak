# Mujify Tweaks — VM Test Plan (run before launch)

The apply/undo logic is proven by `cargo test` against a mock Windows layer, so it has
**never executed on a real machine**. Before shipping, run this end-to-end in a throwaway
**VirtualBox Windows 11 VM** (Windows 11 Home has no Hyper-V; VirtualBox or VMware Player is
the free route). Everything below changes real settings — do it in a VM you can roll back.

Legend: 🖥️ = do it in the app · ✅ = external verification (paste the command in an **admin**
Command Prompt / PowerShell) · 📸 = worth a screenshot for the record.

---

## 0. VM prep

1. Fresh Windows 11 VM, fully updated, then **take a VirtualBox snapshot** named `clean`.
2. Enable System Protection so restore-point tests work:
   ✅ `Enable-ComputerRestore -Drive "C:\"` (PowerShell, admin)
3. Copy the built installer (`src-tauri/target/release/bundle/nsis/Mujify Tweaks_0.9.0-beta.1_x64-setup.exe`) into the VM.
4. Capture the *before* state of everything this plan touches, so you can diff later:
   ```cmd
   powercfg /getactivescheme
   reg query "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerThrottling" /v PowerThrottlingOff
   reg query "HKLM\SYSTEM\CurrentControlSet\Control\PriorityControl" /v Win32PrioritySeparation
   reg query "HKCU\System\GameConfigStore" /v GameDVR_Enabled
   reg query "HKCU\Control Panel\Mouse" /v MouseSpeed
   reg query "HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity" /v Enabled
   sc qc SysMain
   ```
   Save this output; it's your ground truth for the revert check in step 6.

---

## 1. Install

1. 🖥️ Run the setup exe. It should prompt **UAC once** (per-machine install).
2. ✅ Confirm the admin manifest is embedded (no separate elevation shim):
   `Get-Content "C:\Program Files\Mujify Tweaks\mujify-tweaks.exe" -TotalCount 0` then check via
   `sigcheck` or right-click → Properties → Compatibility should show it always runs as admin. Simpler:
   launch it and confirm it re-triggers UAC (it requires admin).
3. ✅ Confirm both sidecars shipped next to the exe:
   ```cmd
   dir "C:\Program Files\Mujify Tweaks\PresentMon.exe"
   dir "C:\Program Files\Mujify Tweaks\LHMWrapper.exe"
   ```

## 2. First-run experience

1. 🖥️ Launch the app. 📸 The **welcome modal** must appear on the very first launch: what it does,
   the "every change is logged and one-click reversible" line, the restore-point recommendation,
   and "no telemetry, ever". Click **Get started**.
2. 🖥️ Close and relaunch — the welcome modal must **NOT** appear again (persisted flag).
3. ✅ Live stats stream: the Dashboard CPU/RAM gauges move and match Task Manager (`taskmgr`).

## 3. Apply each category one at a time, and verify externally

Apply **one tweak at a time** from the Tweaks tab (confirm modal each time), then verify. After
each, check it also appears in the **Change Log** with a plain-English description.

| # | Tweak (category) | Apply in app | ✅ External verification | Expected |
|---|---|---|---|---|
| a | High Performance Power Plan (System) | Apply | `powercfg /getactivescheme` | GUID `8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c` (High performance) |
| b | Disable Power Throttling (Performance) | Apply | `reg query "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerThrottling" /v PowerThrottlingOff` | `0x1` |
| c | Optimize Win32 Priority (Performance) | Apply | `reg query "HKLM\SYSTEM\CurrentControlSet\Control\PriorityControl" /v Win32PrioritySeparation` | `0x26` (38) |
| d | Disable SysMain (System) | Apply | `sc qc SysMain` then `sc query SysMain` | START_TYPE `4 DISABLED`, STATE `STOPPED` |
| e | Disable Game Bar (Graphics) | Apply | `reg query "HKCU\System\GameConfigStore" /v GameDVR_Enabled` | `0x0` |
| f | Mouse Accel Off (Gaming) | Apply | `reg query "HKCU\Control Panel\Mouse" /v MouseSpeed` | `0` (also check `MouseThreshold1`/`MouseThreshold2` = `0`) |
| g | Set Monitor to Max Refresh (Graphics) | Apply | Settings → System → Display → Advanced display | refresh rate raised to the panel's max; revert restores prior |
| h | Disable Memory Integrity / HVCI (System, Advanced) | Apply (read the security caveat) | `reg query "HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity" /v Enabled` | `0x0` (needs reboot to take effect) |

📸 Screenshot the Change Log after these — it should list every applied change.

**Anti-cheat guard check:** start any process named like an anti-cheat (rename a dummy exe to
`vgc.exe` and run it), then try to apply a non-safe tweak — the app must **refuse/hold** it and say
a protected game is running. Close the dummy and confirm applies work again.

## 4. Before/After proof loop

> FPS capture needs a real GPU presenting frames — inside a GPU-less VM the FPS row will honestly
> read "not measured". Do the **FPS** validation on real hardware with a free lightweight game
> (e.g. **Rocket League** or **osu!**); use the VM to validate the *flow* and the CPU/RAM/score deltas.

1. 🖥️ Report tab → **Capture Baseline** (~60s).
2. 🖥️ Apply a couple of tweaks (or a game profile).
3. 🖥️ **Capture Post** (~60s).
4. ✅ The verdict must be **honest**: with no game presenting it must not claim an FPS gain, and with
   a noisy/tiny delta it must say "within measurement noise", not "meaningful improvement".

## 5. Revert All, then re-verify everything externally

1. 🖥️ Change Log → **Revert All** (confirm).
2. ✅ Re-run **every** command from step 0 and confirm each value is back to its original:
   ```cmd
   powercfg /getactivescheme                       &:: back to the original plan (e.g. Balanced)
   reg query "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerThrottling" /v PowerThrottlingOff
   reg query "HKLM\SYSTEM\CurrentControlSet\Control\PriorityControl" /v Win32PrioritySeparation
   reg query "HKCU\System\GameConfigStore" /v GameDVR_Enabled
   reg query "HKCU\Control Panel\Mouse" /v MouseSpeed
   reg query "HKLM\...\HypervisorEnforcedCodeIntegrity" /v Enabled
   sc qc SysMain                                    &:: START_TYPE back to its original (e.g. 2 AUTO_START)
   ```
   Values that **didn't exist before** must be **gone** (not left at 0); values that existed must be
   back to their **exact** prior number. This is the core safety guarantee — check it carefully.
3. ✅ The Change Log entries must now show as **reverted** (never deleted).

## 6. Drift detection after reboot

1. 🖥️ Apply one registry tweak again (e.g. Disable Power Throttling).
2. Simulate a Windows reset of it:
   ✅ `reg delete "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerThrottling" /v PowerThrottlingOff /f`
3. 🖥️ Restart the app. It should toast **"N tweaks were reset by Windows"** and offer to re-apply.

## 7. Uninstall safety — the critical test

1. 🖥️ Apply several tweaks again (leave them **active** — do NOT revert).
2. ✅ Confirm the change log exists and has active entries:
   `type "%AppData%\MujifyTweaks\change_log.json"`
3. 🖥️ Uninstall via Settings → Apps (or the Start-menu uninstaller). 📸 Watch for the
   **"Restoring your original Windows settings…"** message in the uninstaller.
4. ✅ **Before checking anything else**, re-run the step-0 commands. Every applied tweak must be
   **restored to its original value** — the uninstaller's `--revert-all` hook must have fired.
5. ✅ Confirm the install dir is gone: `dir "C:\Program Files\Mujify Tweaks"` → not found.

Manual equivalent (to test the flag directly before uninstalling):
```cmd
"C:\Program Files\Mujify Tweaks\mujify-tweaks.exe" --revert-all --dry-run   &:: safe: reports only
"C:\Program Files\Mujify Tweaks\mujify-tweaks.exe" --revert-all             &:: really restores
```

## 8. Orphan check

1. ✅ Diff the current state against your step-0 ground truth — there must be **zero** leftover Mujify
   changes: power plan, all registry values, and service states all match the original snapshot.
2. ✅ No stray processes: `tasklist | findstr /i "mujify presentmon lhmwrapper"` → empty.
3. Roll the VM back to the `clean` snapshot before the next test run.

---

### Pass criteria
Every applied change is externally verifiable, every revert restores the **exact** prior value
(deleting values that never existed), drift is detected after a reboot, the uninstaller restores
settings **before** deleting files, and nothing Mujify touched is left orphaned. If any value does
not return to its original state, **do not ship** — capture the Change Log + logs
(`%AppData%\MujifyTweaks\logs`) and fix it first.

> Note: the uninstaller runs `--revert-all` elevated. The change log lives in the **per-user**
> `%AppData%`, so uninstall as the **same user** who applied the tweaks. If a different admin
> uninstalls, run the manual `--revert-all` as the original user first.
