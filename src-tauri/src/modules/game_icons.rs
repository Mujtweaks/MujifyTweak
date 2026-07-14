//! Real game logos, extracted from each game's own executable icon.
//!
//! Non-Steam games (Roblox, Minecraft, Fortnite, VALORANT, …) have no Steam
//! cover art, so instead of a letter tile we pull the REAL icon out of the
//! game's `.exe` and hand the UI a `data:image/png;base64,…` URI. That's the
//! game's actual icon — no fakes, no wrong covers — and `data:` is already
//! allowed by the app's image CSP, so it renders with zero network access.
//!
//! Everything degrades to `None` on any failure, so the UI simply keeps its
//! existing letter-tile fallback and is never left worse off.

use std::path::{Path, PathBuf};

use base64::Engine;

/// Public command: given a game's exe OR install folder, return a PNG data URI
/// of its icon, or None (UI keeps the letter tile). Off the UI thread.
#[tauri::command]
pub async fn game_icon(path: String) -> Option<String> {
    tokio::task::spawn_blocking(move || game_icon_impl(&path)).await.ok().flatten()
}

fn game_icon_impl(path: &str) -> Option<String> {
    let exe = resolve_game_exe(Path::new(path))?;
    let (w, h, rgba) = extract_icon_rgba(&exe)?;
    encode_png_data_uri(w, h, &rgba)
}

/// Find the best icon-bearing exe for a game given a file or directory path.
/// A direct `.exe` is used as-is; a folder is searched (shallowly) for the most
/// plausible game executable — biggest exe that isn't an installer/helper.
fn resolve_game_exe(p: &Path) -> Option<PathBuf> {
    if p.is_file() && p.extension().map(|e| e.eq_ignore_ascii_case("exe")).unwrap_or(false) {
        return Some(p.to_path_buf());
    }
    if !p.is_dir() {
        return None;
    }
    // Names that are never the game itself.
    const SKIP: &[&str] = &[
        "unins", "setup", "install", "crashpad", "crashhandler", "vc_redist",
        "vcredist", "dxsetup", "helper", "launcher_installer", "update", "notification",
    ];
    let mut best: Option<(u64, PathBuf)> = None;
    // Search several levels deep — many games bury the real exe (Fortnite lives at
    // Fortnite\FortniteGame\Binaries\Win64\…, Roblox under Versions\<hash>\, etc.).
    // HARD CAP the number of entries walked: a 50GB game folder can hold hundreds
    // of thousands of files, and walking all of them made the icon never return
    // (the logo stayed a letter). 20k entries is plenty to reach any real game exe.
    let mut scanned = 0usize;
    for entry in walkdir::WalkDir::new(p).max_depth(5).into_iter().flatten() {
        scanned += 1;
        if scanned > 20_000 {
            break;
        }
        let path = entry.path();
        if !path.extension().map(|e| e.eq_ignore_ascii_case("exe")).unwrap_or(false) {
            continue;
        }
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
        if SKIP.iter().any(|s| stem.contains(s)) {
            continue;
        }
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        // Prefer an exe whose name hints it's the actual player/game, else biggest.
        let score = size + if stem.contains("game") || stem.contains("player") || stem.contains("win64") { 1 << 40 } else { 0 };
        if best.as_ref().map(|(s, _)| score > *s).unwrap_or(true) {
            best = Some((score, path.to_path_buf()));
        }
    }
    best.map(|(_, path)| path)
}

/// Extract the largest available icon from an exe as top-down RGBA pixels.
/// Returns (width, height, rgba_bytes). None on any Win32 failure.
fn extract_icon_rgba(exe: &Path) -> Option<(u32, u32, Vec<u8>)> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{
        DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HDC, HGDIOBJ,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        DestroyIcon, GetIconInfo, PrivateExtractIconsW, HICON, ICONINFO,
    };

    // The API wants a fixed [u16; 260] NUL-terminated path buffer.
    let mut namebuf = [0u16; 260];
    {
        let wide: Vec<u16> = exe.as_os_str().encode_wide().collect();
        let n = wide.len().min(259);
        namebuf[..n].copy_from_slice(&wide[..n]);
    }

    unsafe {
        // Ask for a 256px icon; Windows scales from the best embedded size.
        let mut hicons = [HICON::default(); 1];
        let got = PrivateExtractIconsW(&namebuf, 0, 256, 256, Some(&mut hicons), None, 0);
        let hicon = hicons[0];
        if got == 0 || got == u32::MAX || hicon.0.is_null() {
            return None;
        }
        // Ensure the icon is always freed no matter which path we return on.
        let result = (|| {
            let mut info = ICONINFO::default();
            GetIconInfo(hicon, &mut info).ok()?;
            let hbm_color = info.hbmColor;
            let hbm_mask = info.hbmMask;
            // Dimensions of the color bitmap.
            let mut bm = BITMAP::default();
            let n = GetObjectW(
                HGDIOBJ(hbm_color.0),
                std::mem::size_of::<BITMAP>() as i32,
                Some(&mut bm as *mut _ as *mut _),
            );
            if n == 0 || bm.bmWidth <= 0 || bm.bmHeight <= 0 {
                let _ = DeleteObject(HGDIOBJ(hbm_color.0));
                let _ = DeleteObject(HGDIOBJ(hbm_mask.0));
                return None;
            }
            let w = bm.bmWidth as u32;
            let h = bm.bmHeight as u32;

            // Pull the pixels as 32bpp top-down BGRA.
            let mut bmi = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: bm.bmWidth,
                    biHeight: -bm.bmHeight, // negative → top-down rows
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    ..Default::default()
                },
                ..Default::default()
            };
            let mut buf = vec![0u8; (w * h * 4) as usize];
            let hdc: HDC = GetDC(Some(HWND::default()));
            let scan = GetDIBits(
                hdc,
                hbm_color,
                0,
                h,
                Some(buf.as_mut_ptr() as *mut _),
                &mut bmi,
                DIB_RGB_COLORS,
            );
            ReleaseDC(Some(HWND::default()), hdc);
            let _ = DeleteObject(HGDIOBJ(hbm_color.0));
            let _ = DeleteObject(HGDIOBJ(hbm_mask.0));
            if scan == 0 {
                return None;
            }

            // BGRA → RGBA. If the icon carries no per-pixel alpha (all zero), make
            // it opaque so we show a solid icon rather than a fully transparent
            // (invisible) tile.
            let max_alpha = buf.iter().skip(3).step_by(4).copied().max().unwrap_or(0);
            for px in buf.chunks_exact_mut(4) {
                px.swap(0, 2); // B<->R
                if max_alpha == 0 {
                    px[3] = 255;
                }
            }
            Some((w, h, buf))
        })();
        let _ = DestroyIcon(hicon);
        result
    }
}

/// Encode RGBA → PNG → `data:image/png;base64,…`.
fn encode_png_data_uri(w: u32, h: u32, rgba: &[u8]) -> Option<String> {
    let img = image::RgbaImage::from_raw(w, h, rgba.to_vec())?;
    let mut png: Vec<u8> = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png).ok()?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&png);
    Some(format!("data:image/png;base64,{b64}"))
}

use std::os::windows::ffi::OsStrExt;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_a_valid_png_from_a_real_system_exe() {
        // explorer.exe always exists and has an icon — proves the whole pipeline
        // (Win32 extract → GDI pixels → PNG encode → data URI) produces a real,
        // decodable PNG. If Windows ever refuses, we accept None (never a panic).
        let sysroot = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
        let exe = format!(r"{sysroot}\explorer.exe");
        match game_icon_impl(&exe) {
            Some(uri) => {
                assert!(uri.starts_with("data:image/png;base64,"), "must be a PNG data URI");
                let b64 = uri.strip_prefix("data:image/png;base64,").unwrap();
                let bytes = base64::engine::general_purpose::STANDARD.decode(b64).unwrap();
                // PNG magic number.
                assert_eq!(&bytes[..8], &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
                assert!(bytes.len() > 100, "a real icon PNG isn't tiny");
            }
            None => { /* Acceptable on locked-down CI — never a panic/garbage. */ }
        }
    }

    #[test]
    fn missing_path_is_none_not_a_panic() {
        assert!(game_icon_impl(r"C:\definitely\not\here\nope.exe").is_none());
    }
}
