use crate::scanner;
use crate::AppState;
use rusqlite::params;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
pub struct FileEntry {
    pub path: String,
    pub mtime: i64,
}

#[derive(Serialize)]
pub struct DuplicateGroup {
    pub content_hash: String,
    pub file_type: String,
    pub size: i64,
    pub files: Vec<FileEntry>,
}

#[tauri::command]
pub async fn pick_folder(app: AppHandle) -> Option<String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().pick_folder(move |folder| {
        let _ = tx.send(folder);
    });
    match rx.recv() {
        Ok(Some(path)) => path.into_path().ok().map(|p| p.to_string_lossy().to_string()),
        _ => None,
    }
}

#[tauri::command]
pub fn start_scan(app: AppHandle, state: State<AppState>, root: String) -> Result<(), String> {
    let path = std::path::Path::new(&root);
    let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;
    if !metadata.is_dir() {
        return Err("Selected path is not a folder".into());
    }

    state.cancel_flag.store(false, Ordering::Relaxed);
    let conn = state.db.clone();
    let cancel_flag = state.cancel_flag.clone();
    let app_handle = app.clone();

    std::thread::spawn(move || {
        scanner::run_scan(app_handle, conn, root, cancel_flag);
    });

    Ok(())
}

#[tauri::command]
pub fn cancel_scan(state: State<AppState>) {
    state.cancel_flag.store(true, Ordering::Relaxed);
}

#[tauri::command]
pub fn get_duplicate_groups(state: State<AppState>) -> Result<Vec<DuplicateGroup>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT content_hash, file_type, size, path, mtime
             FROM files
             WHERE content_hash IN (
                 SELECT content_hash FROM files GROUP BY content_hash HAVING COUNT(*) > 1
             )
             ORDER BY content_hash",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut groups: HashMap<String, DuplicateGroup> = HashMap::new();
    for row in rows {
        let (content_hash, file_type, size, path, mtime) = row.map_err(|e| e.to_string())?;
        groups
            .entry(content_hash.clone())
            .or_insert_with(|| DuplicateGroup {
                content_hash,
                file_type,
                size,
                files: Vec::new(),
            })
            .files
            .push(FileEntry { path, mtime });
    }

    let mut result: Vec<DuplicateGroup> = groups.into_values().collect();
    result.sort_by(|a, b| {
        let reclaim_a = a.size * (a.files.len() as i64 - 1);
        let reclaim_b = b.size * (b.files.len() as i64 - 1);
        reclaim_b.cmp(&reclaim_a)
    });

    Ok(result)
}

#[derive(Serialize)]
pub struct TrashOutcome {
    pub trashed: Vec<String>,
    pub failed: Vec<(String, String)>,
}

#[tauri::command]
pub fn clear_cache(state: State<AppState>) -> Result<usize, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let cleared = db.execute("DELETE FROM files", []).map_err(|e| e.to_string())?;
    db.execute("VACUUM", []).map_err(|e| e.to_string())?;
    Ok(cleared)
}

#[derive(Serialize, Clone)]
pub struct SimilarImageFile {
    pub path: String,
    pub size: i64,
    pub mtime: i64,
}

#[derive(Serialize, Clone)]
pub struct SimilarImageGroup {
    pub id: String,
    pub max_distance: u32,
    pub files: Vec<SimilarImageFile>,
}

#[derive(Serialize)]
pub struct SimilarImageGroupsResult {
    pub groups: Vec<SimilarImageGroup>,
    pub indexed_count: u32,
}

fn find_root(parent: &mut [usize], x: usize) -> usize {
    let mut root = x;
    while parent[root] != root {
        root = parent[root];
    }
    let mut cur = x;
    while parent[cur] != root {
        let next = parent[cur];
        parent[cur] = root;
        cur = next;
    }
    root
}

/// Splits a set of items into clique-like groups where every pair inside a
/// group is within `threshold` of each other (by `dist`), using a greedy
/// heuristic: repeatedly seed a group with whichever remaining item has the
/// most threshold-neighbors among what's left, then absorb any other
/// remaining item that's within threshold of *every* member already in the
/// group (not just the seed). This is what keeps a group's true diameter
/// (the max distance between its two farthest members) bounded by
/// `threshold` — see the big comment on `get_similar_image_groups` for why
/// that guarantee matters.
///
/// Not a guaranteed-optimal clique cover (that's NP-hard) — just a cheap
/// heuristic that's good enough for the sizes these groups come in in
/// practice (a handful to a few dozen images that survived the pairwise
/// pre-filter, not the whole library).
fn split_into_cliques(idxs: &[usize], dist: impl Fn(usize, usize) -> u32, threshold: u32) -> Vec<Vec<usize>> {
    let mut remaining = idxs.to_vec();
    let mut groups = Vec::new();

    while let Some(&seed) = remaining.first() {
        let mut best = seed;
        let mut best_count = 0;
        for &a in &remaining {
            let count = remaining.iter().filter(|&&b| b != a && dist(a, b) <= threshold).count();
            if count > best_count {
                best_count = count;
                best = a;
            }
        }
        remaining.retain(|&x| x != best);

        let mut group = vec![best];
        remaining.retain(|&candidate| {
            let fits = group.iter().all(|&member| dist(member, candidate) <= threshold);
            if fits {
                group.push(candidate);
            }
            !fits
        });
        groups.push(group);
    }

    groups
}

/// Groups every indexed image by visual similarity (Hamming distance between
/// pHash perceptual hashes), not just byte-identical content.
///
/// This is a two-step clustering, not plain single-linkage: a first pass
/// (union-find) finds *candidate* connected components — any two images
/// within `max_distance` join the same component, and that alone would let
/// similarity chain transitively (A~B~C even if A and C alone are nothing
/// alike, dragging unrelated photos into one group). The second pass
/// (`split_into_cliques`) then breaks each candidate component into
/// subgroups where *every* pair is actually within `max_distance` of each
/// other, so what the user sees as "N similar photos" always means all N are
/// mutually similar, not just transitively linked through some chain of
/// intermediate photos they never see.
#[tauri::command]
pub fn get_similar_image_groups(
    state: State<AppState>,
    max_distance: u32,
) -> Result<SimilarImageGroupsResult, String> {
    let rows: Vec<(String, i64, i64, i64)> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db
            .prepare(
                "SELECT path, size, mtime, phash FROM files
                 WHERE file_type = 'image' AND phash IS NOT NULL",
            )
            .map_err(|e| e.to_string())?;
        let mapped = stmt
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .collect();
        mapped
    };

    let n = rows.len();
    let dist = |a: usize, b: usize| ((rows[a].3 as u64) ^ (rows[b].3 as u64)).count_ones();

    let mut parent: Vec<usize> = (0..n).collect();
    for i in 0..n {
        for j in (i + 1)..n {
            if dist(i, j) <= max_distance {
                let ri = find_root(&mut parent, i);
                let rj = find_root(&mut parent, j);
                if ri != rj {
                    parent[ri] = rj;
                }
            }
        }
    }

    let mut candidates: HashMap<usize, Vec<usize>> = HashMap::new();
    for i in 0..n {
        let root = find_root(&mut parent, i);
        candidates.entry(root).or_default().push(i);
    }

    let mut groups = Vec::new();
    for idxs in candidates.into_values() {
        if idxs.len() < 2 {
            continue;
        }
        for clique in split_into_cliques(&idxs, dist, max_distance) {
            if clique.len() < 2 {
                continue;
            }
            let mut max_dist = 0u32;
            for a in 0..clique.len() {
                for b in (a + 1)..clique.len() {
                    max_dist = max_dist.max(dist(clique[a], clique[b]));
                }
            }

            let mut sorted_paths: Vec<&str> = clique.iter().map(|&i| rows[i].0.as_str()).collect();
            sorted_paths.sort();
            let id = blake3::hash(sorted_paths.join("\n").as_bytes()).to_hex().to_string();

            let files = clique
                .iter()
                .map(|&i| SimilarImageFile {
                    path: rows[i].0.clone(),
                    size: rows[i].1,
                    mtime: rows[i].2,
                })
                .collect();

            groups.push(SimilarImageGroup {
                id,
                max_distance: max_dist,
                files,
            });
        }
    }

    groups.sort_by(|a, b| {
        b.files
            .len()
            .cmp(&a.files.len())
            .then(a.max_distance.cmp(&b.max_distance))
    });

    Ok(SimilarImageGroupsResult {
        groups,
        indexed_count: n as u32,
    })
}

#[derive(Serialize, Clone)]
pub struct ImageIndexProgress {
    pub indexed: u64,
    pub total: u64,
}

/// Computes perceptual hashes for every indexed image that doesn't have one
/// yet (new files, changed files, or a first run after upgrading) and stores
/// them. Deliberately separate from `start_scan`: decoding+resizing an image
/// is ~90x slower than the BLAKE3 hash a regular scan does, so folding it
/// into the Files-tab scan made every scan of a photo-heavy folder feel
/// dramatically slower. This runs only when the Images tab actually needs
/// it, on a background thread, spread across all CPU cores via rayon, and
/// reports progress so the UI can show it instead of looking hung.
#[tauri::command]
pub fn start_image_indexing(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    use rayon::prelude::*;
    use std::sync::atomic::AtomicU64;

    let paths: Vec<String> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db
            .prepare("SELECT path FROM files WHERE file_type = 'image' AND phash IS NULL")
            .map_err(|e| e.to_string())?;
        let mapped = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .collect();
        mapped
    };

    let total = paths.len() as u64;
    if total == 0 {
        let _ = app.emit("image-index-complete", ImageIndexProgress { indexed: 0, total: 0 });
        return Ok(());
    }

    let conn = state.db.clone();
    std::thread::spawn(move || {
        let indexed = AtomicU64::new(0);
        // Aim for roughly 50 progress emits across the whole run rather than
        // one per file — plenty smooth for a progress bar without flooding
        // IPC when there are thousands of images. `fetch_add` is atomic, so
        // this is safe to call concurrently from rayon's worker threads.
        let emit_every = (total / 50).max(1);

        let results: Vec<(String, Option<i64>)> = paths
            .par_iter()
            .map(|path| {
                let hash = scanner::compute_phash(std::path::Path::new(path)).map(|h| h as i64);
                let n = indexed.fetch_add(1, Ordering::Relaxed) + 1;
                if n == total || n % emit_every == 0 {
                    let _ = app.emit("image-index-progress", ImageIndexProgress { indexed: n, total });
                }
                (path.clone(), hash)
            })
            .collect();

        {
            let db = conn.lock().unwrap();
            for (path, hash) in &results {
                let _ = db.execute(
                    "UPDATE files SET phash = ?1 WHERE path = ?2",
                    params![hash, path],
                );
            }
        }

        let _ = app.emit("image-index-complete", ImageIndexProgress { indexed: total, total });
    });

    Ok(())
}

/// Reads an image file straight from disk and returns a JPEG preview (no
/// larger than `max_size` on its longest side) as a data URI, so the
/// frontend never needs filesystem read access of its own — every path
/// comes from our own scan cache. Used for both the small grid thumbnails
/// and the larger comparison-view previews, just with a different
/// `max_size` — the decode cost is the same either way (resizing down
/// further is cheap), so one command covers both.
#[tauri::command]
pub fn get_image_thumbnail(path: String, max_size: u32) -> Result<String, String> {
    use base64::Engine;

    let max_size = max_size.clamp(32, 2400);
    let img = image::open(&path).map_err(|e| e.to_string())?;
    let resized = img.resize(max_size, max_size, image::imageops::FilterType::Triangle);
    let rgb = image::DynamicImage::ImageRgb8(resized.to_rgb8());

    let mut buf = Vec::new();
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 88);
    rgb.write_with_encoder(encoder).map_err(|e| e.to_string())?;

    let encoded = base64::engine::general_purpose::STANDARD.encode(&buf);
    Ok(format!("data:image/jpeg;base64,{encoded}"))
}

#[tauri::command]
pub fn trash_files(state: State<AppState>, paths: Vec<String>) -> Result<TrashOutcome, String> {
    let mut trashed = Vec::new();
    let mut failed = Vec::new();

    for path in &paths {
        match trash::delete(path) {
            Ok(()) => trashed.push(path.clone()),
            Err(e) => failed.push((path.clone(), e.to_string())),
        }
    }

    if !trashed.is_empty() {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        for path in &trashed {
            let _ = db.execute("DELETE FROM files WHERE path = ?1", params![path]);
        }
    }

    Ok(TrashOutcome { trashed, failed })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Regression test for the exact chaining bug: A and B are close, B and C
    /// are close, but A and C are far apart. Plain single-linkage (union-find
    /// alone) would put all three in one group; `split_into_cliques` must
    /// keep A and C apart since they aren't actually within threshold of
    /// each other.
    #[test]
    fn split_into_cliques_breaks_transitive_chains() {
        // distances: (0,1)=2, (1,2)=2, (0,2)=20 — 0 and 2 must end up separate.
        let dist = |a: usize, b: usize| -> u32 {
            match (a.min(b), a.max(b)) {
                (0, 1) => 2,
                (1, 2) => 2,
                (0, 2) => 20,
                _ => unreachable!(),
            }
        };

        let groups = split_into_cliques(&[0, 1, 2], dist, 5);

        assert!(
            !groups.iter().any(|g| g.contains(&0) && g.contains(&2)),
            "0 and 2 are 20 apart and must not end up in the same group: {groups:?}"
        );
        // Every pair within any reported group must actually be within threshold.
        for group in &groups {
            for i in 0..group.len() {
                for j in (i + 1)..group.len() {
                    assert!(dist(group[i], group[j]) <= 5, "group {group:?} has a pair over threshold");
                }
            }
        }
    }

    #[test]
    fn split_into_cliques_keeps_a_true_clique_together() {
        let dist = |_a: usize, _b: usize| 1u32; // everyone mutually close
        let groups = split_into_cliques(&[0, 1, 2, 3], dist, 5);
        assert_eq!(groups, vec![vec![0, 1, 2, 3]]);
    }
}
