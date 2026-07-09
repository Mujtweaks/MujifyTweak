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

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Restoring your original Windows settings…"
  nsExec::ExecToLog '"$INSTDIR\mujify-tweaks.exe" --revert-all'
  Pop $0
  DetailPrint "Mujify Tweaks: settings restore finished (code $0)."
!macroend
