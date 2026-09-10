use crate::scanner;
use crate::AppState;
use rusqlite::params;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, State};
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
