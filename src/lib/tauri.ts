import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * True when running inside the Tauri shell. Guarding every window/IPC call on
 * this keeps the UI previewable in a plain browser tab (vite dev on :1420)
 * without crashing on missing Tauri internals.
 */
export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function minimizeWindow(): Promise<void> {
  if (!isTauri) return;
  await getCurrentWindow().minimize();
}

export async function toggleMaximizeWindow(): Promise<void> {
  if (!isTauri) return;
  await getCurrentWindow().toggleMaximize();
}

export async function closeWindow(): Promise<void> {
  if (!isTauri) return;
  await getCurrentWindow().close();
}

export async function isWindowMaximized(): Promise<boolean> {
  if (!isTauri) return false;
  return getCurrentWindow().isMaximized();
}

export function onWindowResized(callback: () => void): () => void {
  if (!isTauri) return () => {};
  let unlisten: (() => void) | undefined;
  getCurrentWindow()
    .onResized(callback)
    .then((fn) => (unlisten = fn));
  return () => unlisten?.();
}
