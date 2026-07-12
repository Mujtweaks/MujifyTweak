//! Cleaner — reclaimable-space scanner + large/duplicate file finders.
//!
//! The SCAN is fully read-only: it sums sizes and lists paths, changing nothing.
//! `clean_junk` deletes only REGENERABLE caches (temp, shader, crash dumps) and
//! is gated behind the UI confirm — it never runs in tests or tooling. Files
//! surfaced by the large/duplicate finders are NEVER deleted by the app; the UI
//! only reveals them (open-in-Explorer), so there is no way to lose real data
//! here. Honest framing throughout: caches are "rebuilt automatically", not a
//! reversible tweak.

use std::collections::HashMap;
use std::hash::Hasher;
use std::path::{Path, PathBuf};

use serde::Serialize;
use walkdir::WalkDir;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JunkCategory {
    pub id: String,
    pub label: String,
    pub description: String,
    pub bytes: u64,
    pub file_count: u32,
    /// true → safe to clean (a cache Windows/apps rebuild on demand).
    pub regenerable: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LargeFile {
    pub path: String,
    pub bytes: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DupGroup {
    /// Size of each identical file in the group.
    pub bytes: u64,
    pub paths: Vec<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CleanResult {
    pub bytes_freed: u64,
    pub files_deleted: u32,
    /// Category ids that had at least one file we couldn't delete (locked/in use).
    pub partial: Vec<String>,
}

fn local_appdata() -> Option<PathBuf> {
    std::env::var("LOCALAPPDATA").ok().map(PathBuf::from)
}

/// (id, label, description, regenerable, roots-that-exist). Kept as one table so
/// scan and clean agree on exactly which paths a category owns.
fn category_specs() -> Vec<(&'static str, &'static str, &'static str, bool, Vec<PathBuf>)> {
    let local = local_appdata();
    let windir = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".to_string());
    let exists = |p: PathBuf| -> Option<PathBuf> { p.exists().then_some(p) };

    // Temp: %TEMP% + C:\Windows\Temp
    let mut temp_roots = Vec::new();
    if let Ok(t) = std::env::var("TEMP") {
        if let Some(p) = exists(PathBuf::from(t)) {
            temp_roots.push(p);
        }
    }
    if let Some(p) = exists(PathBuf::from(&windir).join("Temp")) {
        temp_roots.push(p);
    }

    // Shader caches: DirectX + NVIDIA + AMD (all under LOCALAPPDATA).
    let mut shader_roots = Vec::new();
    if let Some(l) = &local {
        for sub in [
            "D3DSCache",
            r"NVIDIA\DXCache",
            r"NVIDIA\GLCache",
            r"AMD\DxCache",
            r"AMD\DxcCache",
        ] {
            if let Some(p) = exists(l.join(sub)) {
                shader_roots.push(p);
            }
        }
    }

    // Crash dumps (regenerable diagnostic files).
    let mut dump_roots = Vec::new();
    if let Some(l) = &local {
        if let Some(p) = exists(l.join("CrashDumps")) {
            dump_roots.push(p);
        }
    }

    vec![
        (
            "temp",
            "Temporary files",
            "App and Windows scratch files. Safe to clear — they're recreated as needed.",
            true,
            temp_roots,
        ),
        (
            "shader",
            "Shader caches",
            "Compiled GPU shader caches (DirectX / NVIDIA / AMD). Games rebuild them automatically on next launch.",
            true,
            shader_roots,
        ),
        (
            "crashdumps",
            "Crash dumps",
            "Leftover application crash-dump files. Only needed for debugging a specific crash.",
            true,
            dump_roots,
        ),
    ]
}

/// Recursive size + file count of a directory. Read-only; skips entries it can't
/// stat (permission/locked) rather than failing the whole scan.
fn dir_bytes_and_count(root: &Path) -> (u64, u32) {
    if !root.exists() {
        return (0, 0);
    }
    let mut bytes = 0u64;
    let mut count = 0u32;
    for entry in WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            if let Ok(md) = entry.metadata() {
                bytes += md.len();
                count += 1;
            }
        }
    }
    (bytes, count)
}

/// Read-only junk scan — categories with reclaimable size. Changes nothing.
#[tauri::command]
pub fn scan_junk() -> Vec<JunkCategory> {
    category_specs()
        .into_iter()
        .map(|(id, label, description, regenerable, roots)| {
            let (bytes, file_count) = roots
                .iter()
                .map(|r| dir_bytes_and_count(r))
                .fold((0u64, 0u32), |(b, c), (rb, rc)| (b + rb, c + rc));
            JunkCategory {
                id: id.to_string(),
                label: label.to_string(),
                description: description.to_string(),
                bytes,
                file_count,
                regenerable,
            }
        })
        .collect()
}

/// Read-only: files at or above `min_mb` under `root`, largest first (cap 200).
#[tauri::command]
pub fn scan_large_files(root: String, min_mb: u64) -> Vec<LargeFile> {
    let min = min_mb.saturating_mul(1_048_576).max(1);
    let mut files: Vec<LargeFile> = WalkDir::new(&root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| {
            let len = e.metadata().ok()?.len();
            (len >= min).then(|| LargeFile {
                path: e.path().to_string_lossy().to_string(),
                bytes: len,
            })
        })
        .collect();
    files.sort_by_key(|f| std::cmp::Reverse(f.bytes));
    files.truncate(200);
    files
}

/// Pure: group same-size files (the only real duplicate candidates). Files with
/// a unique size can't be duplicates, so they're dropped before any hashing.
fn size_collision_groups(files: Vec<(PathBuf, u64)>) -> Vec<(u64, Vec<PathBuf>)> {
    let mut by_size: HashMap<u64, Vec<PathBuf>> = HashMap::new();
    for (p, len) in files {
        if len > 0 {
            by_size.entry(len).or_default().push(p);
        }
    }
    by_size
        .into_iter()
        .filter(|(_, paths)| paths.len() >= 2)
        .collect()
}

/// Content hash of a file (non-cryptographic — only used to confirm same-size
/// files are byte-identical; a false match would need a size AND hash collision).
fn hash_file(path: &Path) -> Option<u64> {
    let bytes = std::fs::read(path).ok()?;
    let mut h = std::collections::hash_map::DefaultHasher::new();
    h.write(&bytes);
    Some(h.finish())
}

/// Read-only: byte-identical duplicate files under `root`. Groups by size, then
/// hashes only the collisions. Largest wasted-space groups first (cap 100).
#[tauri::command]
pub fn scan_duplicate_files(root: String) -> Vec<DupGroup> {
    let files: Vec<(PathBuf, u64)> = WalkDir::new(&root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| Some((e.path().to_path_buf(), e.metadata().ok()?.len())))
        .collect();

    let mut groups: Vec<DupGroup> = Vec::new();
    for (len, candidates) in size_collision_groups(files) {
        let mut by_hash: HashMap<u64, Vec<String>> = HashMap::new();
        for p in candidates {
            if let Some(h) = hash_file(&p) {
                by_hash
                    .entry(h)
                    .or_default()
                    .push(p.to_string_lossy().to_string());
            }
        }
        for (_h, dups) in by_hash {
            if dups.len() >= 2 {
                groups.push(DupGroup { bytes: len, paths: dups });
            }
        }
    }
    // Most reclaimable first: wasted space = size × (copies − 1).
    groups.sort_by_key(|g| std::cmp::Reverse(g.bytes * (g.paths.len() as u64 - 1)));
    groups.truncate(100);
    groups
}

/// Delete the selected regenerable caches. GATED behind `confirm` (set only by
/// the UI). Deletes real files via std::fs — NEVER called by tests/tooling; the
/// caches it removes are rebuilt automatically. Best-effort: a locked/in-use file
/// is skipped (its category is reported in `partial`), never fatal.
#[tauri::command]
pub fn clean_junk(category_ids: Vec<String>, confirm: bool) -> Result<CleanResult, String> {
    if !confirm {
        return Err("Refused: cleaning requires explicit confirmation.".into());
    }
    let specs = category_specs();
    let mut freed = 0u64;
    let mut deleted = 0u32;
    let mut partial = Vec::new();

    for (id, _label, _desc, regenerable, roots) in specs {
        if !regenerable || !category_ids.iter().any(|c| c == id) {
            continue;
        }
        let mut had_failure = false;
        for root in roots {
            for entry in WalkDir::new(&root).contents_first(true).into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();
                if entry.file_type().is_file() {
                    let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                    match std::fs::remove_file(path) {
                        Ok(()) => {
                            freed += size;
                            deleted += 1;
                        }
                        Err(_) => had_failure = true, // locked / in use — leave it
                    }
                } else if entry.file_type().is_dir() && path != root {
                    // contents_first means children are gone; prune empty subdirs,
                    // but never remove the category root itself.
                    let _ = std::fs::remove_dir(path);
                }
            }
        }
        if had_failure {
            partial.push(id.to_string());
        }
    }

    super::logger::info(format!(
        "cleaner: freed {freed} bytes across {deleted} file(s)"
    ));
    Ok(CleanResult { bytes_freed: freed, files_deleted: deleted, partial })
}

/// Open Explorer with the given file selected — a read-only navigation helper
/// for the large-file / duplicate finders so the user can act on a result. Opens
/// a window; changes nothing on disk.
#[tauri::command]
pub fn reveal_in_explorer(path: String) {
    let _ = std::process::Command::new("explorer.exe")
        .arg(format!("/select,{path}"))
        .spawn();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_refuses_without_confirmation() {
        // The gate must hold before any filesystem work happens.
        assert!(clean_junk(vec!["temp".into()], false).is_err());
    }

    #[test]
    fn unique_sizes_are_never_duplicate_candidates() {
        let files = vec![
            (PathBuf::from("a"), 100),
            (PathBuf::from("b"), 200),
            (PathBuf::from("c"), 300),
        ];
        assert!(size_collision_groups(files).is_empty());
    }

    #[test]
    fn same_size_files_group_as_candidates() {
        let files = vec![
            (PathBuf::from("a"), 100),
            (PathBuf::from("b"), 100),
            (PathBuf::from("c"), 999),
            (PathBuf::from("d"), 100),
        ];
        let groups = size_collision_groups(files);
        assert_eq!(groups.len(), 1);
        let (len, paths) = &groups[0];
        assert_eq!(*len, 100);
        assert_eq!(paths.len(), 3); // a, b, d — never c
    }

    #[test]
    fn zero_byte_files_are_not_duplicate_candidates() {
        // Empty files aren't worth flagging and would all hash-collide.
        let files = vec![(PathBuf::from("a"), 0), (PathBuf::from("b"), 0)];
        assert!(size_collision_groups(files).is_empty());
    }

    #[test]
    fn scan_junk_reports_known_categories_and_changes_nothing() {
        // Read-only: always returns the three category ids, sizes ≥ 0.
        let cats = scan_junk();
        let ids: Vec<&str> = cats.iter().map(|c| c.id.as_str()).collect();
        assert!(ids.contains(&"temp"));
        assert!(ids.contains(&"shader"));
        assert!(ids.contains(&"crashdumps"));
        assert!(cats.iter().all(|c| c.regenerable));
    }
}
