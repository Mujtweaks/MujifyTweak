//! In-game performance overlay — a small, transparent, always-on-top, click-
//! through window that shows live FPS / CPU / GPU / temp while you play.
//!
//! It loads the SAME frontend at `#overlay` (so it renders the tiny OverlayView
//! instead of the full app) and receives the exact same live `system_stats` /
//! `frame_stats` events the main window does — so every number is real.
//!
//! Honest limitation: Windows only composites an always-on-top window over
//! BORDERLESS / windowed games, not true exclusive-fullscreen. We do NOT hook or
//! inject into games (that's anti-cheat-unsafe and against the brand), so for
//! exclusive-fullscreen titles the overlay shows on the desktop/alt-tab only.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const OVERLAY_LABEL: &str = "overlay";

/// Show or hide the overlay window. Creates it on first show. Idempotent.
#[tauri::command]
pub fn set_overlay_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        if enabled {
            let _ = win.show();
            let _ = win.set_always_on_top(true);
        } else {
            let _ = win.hide();
        }
        return Ok(());
    }
    if !enabled {
        return Ok(()); // nothing to hide
    }
    let win = WebviewWindowBuilder::new(&app, OVERLAY_LABEL, WebviewUrl::App("index.html#overlay".into()))
        .title("Mujify Overlay")
        .inner_size(220.0, 128.0)
        .position(24.0, 24.0)
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        .resizable(false)
        .focused(false)
        .visible(true)
        .build()
        .map_err(|e| {
            super::logger::warn(format!("overlay: window build failed: {e}"));
            e.to_string()
        })?;
    // Click-through so it never steals input from the game.
    let _ = win.set_ignore_cursor_events(true);
    let _ = win.show();
    let _ = win.set_always_on_top(true);
    super::logger::info("overlay: window created and shown".to_string());
    Ok(())
}
