use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::HashSet;
use std::fs::File;
use std::io::Read;
use std::path::{Path, MAIN_SEPARATOR};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

#[derive(Clone, Serialize)]
pub struct ScanProgress {
    pub scanned: u64,
    pub current_path: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct ScanComplete {
    pub scanned: u64,
    pub skipped_dirs: u64,
    pub canceled: bool,
}

fn classify_ext(ext: &str) -> Option<&'static str> {
    match ext {
        "jpg" | "jpeg" | "png" | "gif" | "bmp" | "webp" | "tiff" | "tif" | "heic" | "heif"
        | "svg" => Some("image"),
        "pdf" => Some("pdf"),
        "txt" | "md" | "markdown" | "csv" | "tsv" | "json" | "xml" | "yaml" | "yml" | "log"
        | "rtf" | "ini" | "conf" | "cfg" => Some("text"),
        _ => None,
    }
}

fn hash_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = blake3::Hasher::new();
    let mut buf = [0u8; 1 << 16];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize().to_hex().to_string())
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Walks `root`, hashing newly-seen or changed image/pdf/text files and
/// upserting them into the cache, then prunes cache rows under `root` for
/// files that no longer exist. Pure of any Tauri dependency so it can run
/// under plain `cargo test`.
pub fn scan_folder(
    conn: &Mutex<Connection>,
    root: &str,
    cancel_flag: &AtomicBool,
    mut on_progress: impl FnMut(u64, &str),
) -> ScanComplete {
    let root_path = Path::new(root);
    let root_prefix = format!("{}{}", root.trim_end_matches(MAIN_SEPARATOR), MAIN_SEPARATOR);

    let mut scanned: u64 = 0;
    let mut skipped_dirs: u64 = 0;
    let mut seen_paths: HashSet<String> = HashSet::new();

    let walker = WalkDir::new(root_path)
        .into_iter()
        .filter_entry(|e| e.depth() == 0 || !e.file_name().to_string_lossy().starts_with('.'));

    for entry in walker {
        if cancel_flag.load(Ordering::Relaxed) {
            break;
        }
        let entry = match entry {
            Ok(e) => e,
            Err(_) => {
                skipped_dirs += 1;
                continue;
            }
        };
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();

        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();
        let file_type = match classify_ext(&ext) {
            Some(t) => t,
            None => continue,
        };

        let metadata = match std::fs::metadata(path) {
            Ok(m) => m,
            Err(_) => {
                skipped_dirs += 1;
                continue;
            }
        };
        let size = metadata.len() as i64;
        if size == 0 {
            continue;
        }
        let mtime = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let path_str = path.to_string_lossy().to_string();
        seen_paths.insert(path_str.clone());

        let cached: Option<(i64, i64, String)> = {
            let db = conn.lock().unwrap();
            db.query_row(
                "SELECT size, mtime, content_hash FROM files WHERE path = ?1",
                params![path_str],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .ok()
        };

        let content_hash = match &cached {
            Some((csize, cmtime, chash)) if *csize == size && *cmtime == mtime => chash.clone(),
            _ => match hash_file(path) {
                Ok(h) => h,
                Err(_) => {
                    skipped_dirs += 1;
                    continue;
                }
            },
        };

        {
            let db = conn.lock().unwrap();
            let _ = db.execute(
                "INSERT INTO files (path, file_type, size, mtime, content_hash, last_scanned)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(path) DO UPDATE SET
                    file_type = excluded.file_type,
                    size = excluded.size,
                    mtime = excluded.mtime,
                    content_hash = excluded.content_hash,
                    last_scanned = excluded.last_scanned",
                params![path_str, file_type, size, mtime, content_hash, now_unix()],
            );
        }

        scanned += 1;
        on_progress(scanned, &path_str);
    }

    let canceled = cancel_flag.load(Ordering::Relaxed);

    if !canceled {
        let db = conn.lock().unwrap();
        let stale: Vec<String> = {
            let mut stmt = db.prepare("SELECT path FROM files").unwrap();
            let rows = stmt
                .query_map([], |row| row.get::<_, String>(0))
                .map(|r| r.filter_map(|x| x.ok()).collect::<Vec<_>>())
                .unwrap_or_default();
            rows.into_iter()
                .filter(|p| (p == root || p.starts_with(&root_prefix)) && !seen_paths.contains(p))
                .collect()
        };
        for path in stale {
            let _ = db.execute("DELETE FROM files WHERE path = ?1", params![path]);
        }
    }

    ScanComplete {
        scanned,
        skipped_dirs,
        canceled,
    }
}

pub fn run_scan(
    app: AppHandle,
    conn: Arc<Mutex<Connection>>,
    root: String,
    cancel_flag: Arc<AtomicBool>,
) {
    let mut last_emit = Instant::now();
    let result = scan_folder(&conn, &root, &cancel_flag, |scanned, current_path| {
        if last_emit.elapsed() >= Duration::from_millis(50) || scanned == 1 {
            let _ = app.emit(
                "scan-progress",
                ScanProgress {
                    scanned,
                    current_path: current_path.to_string(),
                },
            );
            last_emit = Instant::now();
        }
    });
    let _ = app.emit("scan-complete", result);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use std::fs;
    use std::sync::atomic::AtomicBool;
    use tempfile::tempdir;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:")).unwrap()
    }

    #[test]
    fn finds_exact_duplicates_and_ignores_unsupported_types() {
        let src = tempdir().unwrap();
        fs::write(src.path().join("a.txt"), b"hello world").unwrap();
        fs::write(src.path().join("b.txt"), b"hello world").unwrap();
        fs::write(src.path().join("c.txt"), b"different content").unwrap();
        fs::write(src.path().join("ignored.bin"), b"hello world").unwrap();

        let conn = Mutex::new(open_test_db());
        let cancel = AtomicBool::new(false);
        let result = scan_folder(&conn, src.path().to_str().unwrap(), &cancel, |_, _| {});

        assert_eq!(result.scanned, 3); // a.txt, b.txt, c.txt (not the .bin)
        assert!(!result.canceled);

        let db = conn.lock().unwrap();
        let mut stmt = db
            .prepare(
                "SELECT content_hash, COUNT(*) FROM files GROUP BY content_hash HAVING COUNT(*) > 1",
            )
            .unwrap();
        let dup_groups: Vec<(String, i64)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert_eq!(dup_groups.len(), 1);
        assert_eq!(dup_groups[0].1, 2);
    }

    #[test]
    fn skips_empty_files_and_hidden_entries() {
        let src = tempdir().unwrap();
        fs::write(src.path().join("empty.txt"), b"").unwrap();
        fs::create_dir(src.path().join(".hidden")).unwrap();
        fs::write(src.path().join(".hidden/secret.txt"), b"hello world").unwrap();
        fs::write(src.path().join(".dotfile.txt"), b"hello world").unwrap();
        fs::write(src.path().join("visible.txt"), b"hello world").unwrap();

        let conn = Mutex::new(open_test_db());
        let cancel = AtomicBool::new(false);
        let result = scan_folder(&conn, src.path().to_str().unwrap(), &cancel, |_, _| {});

        assert_eq!(result.scanned, 1); // only visible.txt
    }

    #[test]
    fn reuses_cached_hash_when_size_and_mtime_unchanged() {
        let src = tempdir().unwrap();
        let file_path = src.path().join("a.txt");
        fs::write(&file_path, b"hello world").unwrap();

        let conn = Mutex::new(open_test_db());
        let cancel = AtomicBool::new(false);
        scan_folder(&conn, src.path().to_str().unwrap(), &cancel, |_, _| {});

        let hash_before: String = {
            let db = conn.lock().unwrap();
            db.query_row("SELECT content_hash FROM files WHERE path = ?1", params![file_path.to_str().unwrap()], |r| r.get(0))
                .unwrap()
        };

        // Re-scan without touching the file; cache should short-circuit re-hashing
        // and the stored hash must be identical (content unchanged).
        scan_folder(&conn, src.path().to_str().unwrap(), &cancel, |_, _| {});
        let hash_after: String = {
            let db = conn.lock().unwrap();
            db.query_row("SELECT content_hash FROM files WHERE path = ?1", params![file_path.to_str().unwrap()], |r| r.get(0))
                .unwrap()
        };
        assert_eq!(hash_before, hash_after);
    }

    #[test]
    fn prunes_deleted_files_from_cache_on_rescan() {
        let src = tempdir().unwrap();
        let a = src.path().join("a.txt");
        let b = src.path().join("b.txt");
        fs::write(&a, b"hello world").unwrap();
        fs::write(&b, b"hello world").unwrap();

        let conn = Mutex::new(open_test_db());
        let cancel = AtomicBool::new(false);
        scan_folder(&conn, src.path().to_str().unwrap(), &cancel, |_, _| {});

        fs::remove_file(&b).unwrap();
        scan_folder(&conn, src.path().to_str().unwrap(), &cancel, |_, _| {});

        let db = conn.lock().unwrap();
        let count: i64 = db.query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn cancel_flag_stops_walk_and_skips_pruning() {
        let src = tempdir().unwrap();
        for i in 0..5 {
            fs::write(src.path().join(format!("f{i}.txt")), b"hello world").unwrap();
        }

        let conn = Mutex::new(open_test_db());
        let cancel = AtomicBool::new(false);
        let cancel_ref = &cancel;
        let result = scan_folder(&conn, src.path().to_str().unwrap(), &cancel, |scanned, _| {
            if scanned == 2 {
                cancel_ref.store(true, Ordering::Relaxed);
            }
        });

        assert!(result.canceled);
        assert!(result.scanned <= 3);
    }
}
