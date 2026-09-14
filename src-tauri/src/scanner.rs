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

/// 1D DCT-II of a fixed-size 32-element row/column. Used to build a 2D DCT via
/// the standard separable approach (rows, then columns). The `1/sqrt(2)` term
/// on the DC coefficient (k=0) matches the textbook DCT-II definition; the
/// `sqrt(2/N)` normalization every coefficient would otherwise share is
/// dropped since it's a uniform scale factor and `compute_phash` only ever
/// compares coefficients to each other, never to an absolute reference.
fn dct_1d(input: &[f64; 32]) -> [f64; 32] {
    let mut output = [0.0; 32];
    for (k, out) in output.iter_mut().enumerate() {
        let mut sum = 0.0;
        for (i, &v) in input.iter().enumerate() {
            sum += v * (std::f64::consts::PI * (2.0 * i as f64 + 1.0) * k as f64 / 64.0).cos();
        }
        *out = if k == 0 { sum / std::f64::consts::SQRT_2 } else { sum };
    }
    output
}

/// Perceptual hash (pHash): shrink to 32x32 grayscale, run a 2D DCT, keep the
/// top-left 8x8 block of low-frequency coefficients (the shapes/gradients
/// that survive resizing and recompression), drop the single DC coefficient
/// (just overall brightness — no shape information), and set one bit per
/// remaining coefficient based on whether it's above the block's mean ->
/// 63-bit hash. Near-duplicate images (resized, recompressed, lightly
/// edited) end up with a small Hamming distance between hashes; unrelated
/// images end up far apart.
///
/// This replaced an earlier dHash (adjacent-pixel-comparison) implementation
/// after real photo libraries showed it collapsing very different low-detail
/// images (a mostly-dark photo, a near-blank scan, a flat-color icon) toward
/// similar hashes — dHash only looks at local pixel-to-pixel gradients, which
/// are nearly uniform (and therefore uninformative) across a plain or mostly
/// one-color image. The DCT's low-frequency coefficients instead summarize
/// the image's overall structure, which stays discriminative even for
/// low-detail images. See `PHASH_ALGO_VERSION` in `db.rs` — bump it whenever
/// this function's output changes, so already-indexed photos get re-hashed
/// instead of being compared against a stale, incompatible hash.
///
/// Returns `None` for formats the `image` crate can't decode (e.g. SVG, some
/// HEIC files) — those files still get exact-duplicate matching via
/// `content_hash`, just not near-duplicate matching.
pub fn compute_phash(path: &Path) -> Option<u64> {
    let img = image::open(path).ok()?;
    let small = img
        .resize_exact(32, 32, image::imageops::FilterType::Triangle)
        .into_luma8();

    let mut pixels = [[0.0f64; 32]; 32];
    for y in 0..32u32 {
        for x in 0..32u32 {
            pixels[y as usize][x as usize] = small.get_pixel(x, y)[0] as f64;
        }
    }

    let mut after_rows = [[0.0f64; 32]; 32];
    for y in 0..32 {
        after_rows[y] = dct_1d(&pixels[y]);
    }

    let mut dct = [[0.0f64; 32]; 32];
    for x in 0..32 {
        let column: [f64; 32] = std::array::from_fn(|y| after_rows[y][x]);
        let transformed = dct_1d(&column);
        for y in 0..32 {
            dct[y][x] = transformed[y];
        }
    }

    let low_freq: Vec<f64> = (0..8)
        .flat_map(|y| (0..8).map(move |x| (y, x)))
        .filter(|&(y, x)| !(y == 0 && x == 0)) // skip DC: pure brightness, no shape info
        .map(|(y, x)| dct[y][x])
        .collect();
    let mean: f64 = low_freq.iter().sum::<f64>() / low_freq.len() as f64;

    let mut hash: u64 = 0;
    for &v in &low_freq {
        hash = (hash << 1) | u64::from(v > mean);
    }
    Some(hash)
}

/// The prefix a file's path must start with (or equal exactly) to be
/// considered "under" `root`. Shared between the scan's own prune step and
/// the duplicate/similarity queries in `commands.rs`, which scope their
/// results to one folder the same way.
pub fn root_prefix(root: &str) -> String {
    format!("{}{}", root.trim_end_matches(MAIN_SEPARATOR), MAIN_SEPARATOR)
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
    let prefix = root_prefix(root);

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

        // Note: perceptual hashing (`phash`, for the Images tab's near-duplicate
        // detection) deliberately does NOT happen here. Decoding+resizing an
        // image to compute it is ~90x slower than the BLAKE3 streaming hash
        // below, which would make every scan of a photo-heavy folder feel
        // dramatically slower. Instead it's computed by a separate, explicitly
        // triggered, parallelized indexing pass (`commands::start_image_indexing`)
        // that only runs when the Images tab is opened — see README. A new row
        // inserted here just leaves `phash` NULL until that pass fills it in;
        // an existing row's `phash` survives an upsert unless its content_hash
        // actually changed, in which case it's reset to NULL (stale — the old
        // photo's phash doesn't describe the new content) so indexing revisits it.
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
                    phash = CASE WHEN files.content_hash = excluded.content_hash THEN files.phash ELSE NULL END,
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
                .filter(|p| (p == root || p.starts_with(&prefix)) && !seen_paths.contains(p))
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

    fn write_test_png(path: &Path, seed: u8) {
        let mut img = image::RgbImage::new(32, 32);
        for (x, y, pixel) in img.enumerate_pixels_mut() {
            let v = ((x + y + seed as u32) % 256) as u8;
            *pixel = image::Rgb([v, v, v]);
        }
        img.save(path).unwrap();
    }

    #[test]
    fn scan_does_not_eagerly_compute_phash() {
        // Perceptual hashing is deliberately NOT done during a scan (it's ~90x
        // slower than the BLAKE3 hash and would make scanning a photo-heavy
        // folder feel dramatically slower). It's left NULL for the separate
        // indexing command to fill in on demand.
        let src = tempdir().unwrap();
        let path = src.path().join("photo.png");
        write_test_png(&path, 0);

        let conn = Mutex::new(open_test_db());
        let cancel = AtomicBool::new(false);
        scan_folder(&conn, src.path().to_str().unwrap(), &cancel, |_, _| {});

        let phash: Option<i64> = {
            let db = conn.lock().unwrap();
            db.query_row(
                "SELECT phash FROM files WHERE path = ?1",
                params![path.to_str().unwrap()],
                |r| r.get(0),
            )
            .unwrap()
        };
        assert!(phash.is_none());
    }

    #[test]
    fn rescan_resets_stale_phash_when_content_changes() {
        let src = tempdir().unwrap();
        let path = src.path().join("photo.png");
        write_test_png(&path, 0);

        let conn = Mutex::new(open_test_db());
        let cancel = AtomicBool::new(false);
        scan_folder(&conn, src.path().to_str().unwrap(), &cancel, |_, _| {});

        // Simulate a completed indexing pass having filled in a phash.
        {
            let db = conn.lock().unwrap();
            db.execute(
                "UPDATE files SET phash = 12345 WHERE path = ?1",
                params![path.to_str().unwrap()],
            )
            .unwrap();
        }

        // Change the file's content (and bump mtime so the scan re-hashes it).
        write_test_png(&path, 99);
        let file = std::fs::OpenOptions::new().write(true).open(&path).unwrap();
        file.set_modified(SystemTime::now() + Duration::from_secs(5)).unwrap();

        scan_folder(&conn, src.path().to_str().unwrap(), &cancel, |_, _| {});

        let phash: Option<i64> = {
            let db = conn.lock().unwrap();
            db.query_row(
                "SELECT phash FROM files WHERE path = ?1",
                params![path.to_str().unwrap()],
                |r| r.get(0),
            )
            .unwrap()
        };
        assert!(phash.is_none(), "stale phash from the old content should have been cleared");
    }

    #[test]
    fn near_identical_images_hash_close_together() {
        let src = tempdir().unwrap();
        let a = src.path().join("a.png");
        let b = src.path().join("b_recompressed.png");
        write_test_png(&a, 0);
        // Same pattern, tiny per-pixel perturbation to simulate recompression.
        write_test_png(&b, 1);

        let hash_a = compute_phash(&a).unwrap();
        let hash_b = compute_phash(&b).unwrap();
        let distance = (hash_a ^ hash_b).count_ones();
        assert!(distance <= 8, "expected near-duplicate images to hash close together, got distance {distance}");
    }

    /// Regression test for a real false-positive: a mostly-dark "neon sign at
    /// night" photo, a near-blank scanned page, a flat-color icon, and a
    /// mostly-black photo with one bright light all clustered together at the
    /// strictest sensitivity setting. The root cause was two-fold (fixed
    /// together): dHash only compares local pixel gradients, which are nearly
    /// uniform across these low-detail images, so it collapsed them toward
    /// similar hashes (see git history for the measured distances, 9-22 bits
    /// out of 64 — close enough for single-linkage clustering to chain them
    /// through a large real photo library). pHash's DCT-based low frequencies
    /// summarize overall structure instead of local gradients, so genuinely
    /// different low-detail images should land much farther apart.
    #[test]
    fn dissimilar_low_detail_images_hash_far_apart() {
        let src = tempdir().unwrap();

        // Mostly-dark with a few small bright dots (like a night photo).
        let mut neon = image::RgbImage::new(320, 240);
        for p in neon.pixels_mut() {
            *p = image::Rgb([5, 5, 5]);
        }
        for &(cx, cy) in &[(40u32, 30u32), (150, 90), (260, 180), (90, 200)] {
            for dy in 0..6i32 {
                for dx in 0..6i32 {
                    let x = cx as i32 + dx - 3;
                    let y = cy as i32 + dy - 3;
                    if x >= 0 && y >= 0 && (x as u32) < 320 && (y as u32) < 240 {
                        neon.put_pixel(x as u32, y as u32, image::Rgb([0, 255, 80]));
                    }
                }
            }
        }
        let neon_path = src.path().join("neon.png");
        neon.save(&neon_path).unwrap();

        // Near-blank page with faint vertical lines.
        let mut blank = image::RgbImage::new(320, 240);
        for p in blank.pixels_mut() {
            *p = image::Rgb([250, 250, 248]);
        }
        for x in (40..280).step_by(24) {
            for y in 30..210 {
                blank.put_pixel(x, y, image::Rgb([210, 210, 210]));
            }
        }
        let blank_path = src.path().join("blank.png");
        blank.save(&blank_path).unwrap();

        // Flat-color icon: a solid disc on a white background.
        let mut icon = image::RgbImage::new(320, 240);
        for p in icon.pixels_mut() {
            *p = image::Rgb([255, 255, 255]);
        }
        let (cx, cy, r) = (160i32, 120i32, 90i32);
        for y in 0..240i32 {
            for x in 0..320i32 {
                if (x - cx).pow(2) + (y - cy).pow(2) <= r * r {
                    icon.put_pixel(x as u32, y as u32, image::Rgb([30, 90, 190]));
                }
            }
        }
        let icon_path = src.path().join("icon.png");
        icon.save(&icon_path).unwrap();

        let neon_hash = compute_phash(&neon_path).unwrap();
        let blank_hash = compute_phash(&blank_path).unwrap();
        let icon_hash = compute_phash(&icon_path).unwrap();

        let d_neon_blank = (neon_hash ^ blank_hash).count_ones();
        let d_neon_icon = (neon_hash ^ icon_hash).count_ones();
        let d_blank_icon = (blank_hash ^ icon_hash).count_ones();

        // These are all clearly different images; a "strict" sensitivity
        // setting (a small max_distance) must not consider any pair similar.
        assert!(d_neon_blank > 20, "neon vs blank distance too small: {d_neon_blank}");
        assert!(d_neon_icon > 20, "neon vs icon distance too small: {d_neon_icon}");
        // blank-vs-icon is the hardest of the three pairs: both are mostly a
        // single flat color with one centered feature, which genuinely is
        // coarse structural common ground for a low-frequency hash to pick
        // up on. It should still land well clear of the UI's default
        // sensitivity (6) and its "strict" end, even if it's not as far
        // apart as the other two pairs.
        assert!(d_blank_icon > 8, "blank vs icon distance too small: {d_blank_icon}");
    }
}
