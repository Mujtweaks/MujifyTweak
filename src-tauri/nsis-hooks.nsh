; Mujify Tweaks — NSIS installer/uninstaller hooks.
;
; Uninstall safety (the core of the "safety brand"): before the uninstaller
; removes any files, run the app's headless --revert-all so a user who removes
; Mujify while tweaks are still applied gets their ORIGINAL Windows settings back
; instead of orphaning the changes forever. The change-log in %AppData% is left
; intact until the revert completes, and is not deleted by this uninstaller.
;
; nsExec::ExecToLog runs the child synchronously and pipes its output into the
; uninstaller detail log. The main binary is elevated (the app requires admin),
; so the revert has the rights it needs for HKLM / powercfg / services.

; Before writing any files, close a running instance + its sidecars. Windows
; locks a running .exe, so without this an upgrade fails with "Error opening file
; for writing: …\LHMWrapper.exe" (the hardware-monitor sidecar keeps running).
!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Closing Mujify Tweaks if it's already running…"
  ; Kill the app FIRST (stops its sidecar watchdog), then the sidecars. Two
  ; passes with waits, because a sidecar can briefly respawn during app shutdown
  ; and Windows/AV can hold the .exe handle for a moment after the process dies.
  nsExec::Exec 'taskkill /F /T /IM "mujify-tweaks.exe"'
  Pop $0
  Sleep 600
  nsExec::Exec 'taskkill /F /T /IM "LHMWrapper.exe"'
  Pop $0
  nsExec::Exec 'taskkill /F /T /IM "PresentMonService.exe"'
  Pop $0
  nsExec::Exec 'taskkill /F /T /IM "PresentMon.exe"'
  Pop $0
  Sleep 600
  ; second pass in case anything respawned mid-shutdown
  nsExec::Exec 'taskkill /F /T /IM "mujify-tweaks.exe"'
  Pop $0
  nsExec::Exec 'taskkill /F /T /IM "LHMWrapper.exe"'
  Pop $0
  ; final settle so the file locks are fully released before extraction
  Sleep 1500
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Restoring your original Windows settings…"
  nsExec::ExecToLog '"$INSTDIR\mujify-tweaks.exe" --revert-all'
  Pop $0
  DetailPrint "Mujify Tweaks: settings restore finished (code $0)."
  ; sidecars must be stopped too, or the uninstaller can't remove them
  nsExec::Exec 'taskkill /F /IM "LHMWrapper.exe"'
  Pop $0
  nsExec::Exec 'taskkill /F /IM "PresentMonService.exe"'
  Pop $0
!macroend
