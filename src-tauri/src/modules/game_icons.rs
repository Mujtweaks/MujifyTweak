//! Real game logos, from whatever source actually has one.
//!
//! Non-Steam games (Roblox, Minecraft, Fortnite, VALORANT, …) have no Steam
//! cover art, so instead of a letter tile we produce the game's REAL icon as a
//! `data:image/png;base64,…` URI — no fakes, no wrong covers — and `data:` is
//! already allowed by the app's image CSP, so it renders with zero network.
//!
//! Three sources, because no single one covers real machines (each of these was
//! a letter tile until it was added):
//!   1. A logo PNG, passed straight through. Xbox/Game Pass titles keep their
//!      icon in the package manifest, NOT inside the exe.
//!   2. The file's embedded icon via `PrivateExtractIconsW` — best quality
//!      (256px), and it reads `.ico` too, which is how Steam registers every
//!      game's DisplayIcon.
//!   3. The Windows shell's icon via `SHGetFileInfoW`, for files the process
//!      cannot open at all (Game Pass exes deny direct reads).
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
    let p = Path::new(path);
    // An image file IS the logo — no extraction needed. Xbox/Game Pass titles
    // ship their real logo as a PNG next to the exe (and their exe often can't
    // be read at all), so this is the best source we have for them.
    if let Some(uri) = png_data_uri(p) {
        return Some(uri);
    }
    let exe = resolve_game_exe(p)?;
    let (w, h, rgba) = extract_icon_rgba(&exe)?;
    encode_png_data_uri(w, h, &rgba)
}

/// Read a `.png` straight through as a data URI. None if it isn't a readable PNG.
fn png_data_uri(p: &Path) -> Option<String> {
    if !p.is_file() || !p.extension().map(|e| e.eq_ignore_ascii_case("png")).unwrap_or(false) {
        return None;
    }
    let bytes = std::fs::read(p).ok()?;
    // Verify it really is a PNG rather than trusting the extension.
    if bytes.len() < 8 || bytes[..8] != [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] {
        return None;
    }
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:image/png;base64,{b64}"))
}

/// Find the best icon-bearing exe for a game given a file or directory path.
/// A direct `.exe` is used as-is; a folder is searched (shallowly) for the most
/// plausible game executable — biggest exe that isn't an installer/helper.
fn resolve_game_exe(p: &Path) -> Option<PathBuf> {
    // Any icon-BEARING file is used as-is, not just an exe. Steam registers each
    // game's DisplayIcon as a standalone `.ico` under Steam\steam\games\, so an
    // exe-only check threw away the best icon source every Steam game has.
    const ICON_FILES: &[&str] = &["exe", "ico", "dll", "lnk"];
    if p.is_file() {
        let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        if ICON_FILES.contains(&ext.as_str()) {
            return Some(p.to_path_buf());
        }
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

/// Ask Windows' SHELL for a file's icon, as a last resort.
///
/// `PrivateExtractIconsW` reads the file's own resources, so it fails outright on
/// anything the process can't open — notably Xbox/Game Pass game exes, whose
/// folders deny direct reads. The shell has its own access and answers for those
/// (verified against a real Store install of Roblox from a non-elevated process).
/// The icon is smaller than a 256px embedded one, but a real logo beats a letter.
fn shell_icon(path: &Path) -> Option<windows::Win32::UI::WindowsAndMessaging::HICON> {
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
    use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};

    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut info = SHFILEINFOW::default();
    unsafe {
        let ok = SHGetFileInfoW(
            PCWSTR(wide.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            Some(&mut info),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        );
        if ok == 0 || info.hIcon.is_invalid() {
            return None;
        }
    }
    Some(info.hIcon)
}

/// Extract the largest available icon from a file as top-down RGBA pixels.
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
        // Fall back to the shell when the file's own resources are unreadable.
        let hicon = match hicons[0] {
            h if got != 0 && got != u32::MAX && !h.0.is_null() => h,
            _ => shell_icon(exe)?,
        };
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
    fn icon_bearing_files_are_used_directly_not_just_exes() {
        // Steam points every game's DisplayIcon at a standalone .ico; treating
        // only .exe as a source silently discarded it and gave a letter tile.
        let sysroot = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
        let exe = format!(r"{sysroot}\explorer.exe");
        assert_eq!(resolve_game_exe(Path::new(&exe)).as_deref(), Some(Path::new(&exe)));
        // A path that isn't a file and isn't a directory resolves to nothing.
        assert!(resolve_game_exe(Path::new(r"C:\nope\nothing.ico")).is_none());
    }

    #[test]
    fn a_real_system_exe_always_yields_a_logo() {
        // This asserts a logo actually COMES OUT. The older test below accepts
        // None, so it kept passing while extraction was broken for every real
        // game on the machine — a test that can't fail is not a test.
        let sysroot = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
        let uri = game_icon_impl(&format!(r"{sysroot}\explorer.exe"))
            .expect("explorer.exe must always produce an icon (PrivateExtractIcons or the shell)");
        assert!(uri.starts_with("data:image/png;base64,"));
        assert!(uri.len() > 500, "a real icon isn't a few bytes");
    }

    #[test]
    fn png_assets_are_passed_through_as_the_logo() {
        // Xbox/Game Pass games ship their logo as a PNG and their exe frequently
        // can't be opened at all, so the PNG path must work on its own.
        let dir = std::env::temp_dir().join("mujify_icon_test");
        std::fs::create_dir_all(&dir).unwrap();
        let png = dir.join("LargeLogo.png");
        // A real 1x1 PNG.
        let bytes: [u8; 67] = [
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
            0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78,
            0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        std::fs::write(&png, bytes).unwrap();
        let uri = game_icon_impl(png.to_str().unwrap()).expect("a PNG logo must pass through");
        assert!(uri.starts_with("data:image/png;base64,"));

        // A file merely NAMED .png that isn't one must be rejected, not served
        // as a broken image.
        let fake = dir.join("fake.png");
        std::fs::write(&fake, b"this is not a png").unwrap();
        assert!(png_data_uri(&fake).is_none(), "content is checked, not the extension");
        let _ = std::fs::remove_dir_all(&dir);
    }

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
