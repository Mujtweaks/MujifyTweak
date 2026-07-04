# Bundled sidecar binaries

This folder ships inside the installer. Both binaries arrive with their checkpoint — do not
add placeholder executables.

| Binary | Arrives at | Notes |
|---|---|---|
| `PresentMon.exe` | Checkpoint 6 (FrameTimeMonitor) | Intel/GameTechDev, MIT. **Pin 2.3.1 or later** — current CLI uses underscore flags (`--process_name`, `--output_stdout`, `--multi_csv`); hyphenated v1.x flags silently fail. No admin required since 2.3.1. |
| `LHMWrapper.exe` | Checkpoint 3 (SystemMonitor temps) | Hand-rolled thin C# console wrapper around `LibreHardwareMonitorLib.dll` (MPL 2.0). Built self-contained (`dotnet publish -r win-x64 --self-contained`) so no .NET runtime is needed on the user's machine. We build our own because the third-party CLI wrapper has no license grant for its wrapper code. |

Wiring: referenced from `tauri.conf.json` → `bundle.externalBin` and invoked through
`tauri_plugin_shell` sidecar commands, scoped in `src-tauri/capabilities/`.
