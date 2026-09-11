use rusqlite::{params, Connection};
use std::path::Path;

/// Bump this whenever `scanner::compute_phash`'s output changes. On mismatch,
/// `open` wipes every cached `phash` so the next Images-tab visit re-indexes
/// with the new algorithm instead of comparing new hashes against old,
/// incompatible ones (which would silently produce nonsense similarity
/// groups — exactly the kind of bug this version check exists to prevent).
const PHASH_ALGO_VERSION: &str = "2-phash-dct";

pub fn open(db_path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "busy_timeout", 5000)?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            file_type TEXT NOT NULL,
            size INTEGER NOT NULL,
            mtime INTEGER NOT NULL,
            content_hash TEXT NOT NULL,
            phash INTEGER,
            last_scanned INTEGER NOT NULL
        )",
        (),
    )?;

    // Migration for DBs created before the `phash` column existed (near-duplicate
    // image detection). SQLite has no "ADD COLUMN IF NOT EXISTS" we can rely on
    // across bundled versions, so check PRAGMA table_info first.
    let mut existing_cols = Vec::new();
    {
        let mut stmt = conn.prepare("PRAGMA table_info(files)")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
        for r in rows {
            existing_cols.push(r?);
        }
    }
    if !existing_cols.iter().any(|c| c == "phash") {
        conn.execute("ALTER TABLE files ADD COLUMN phash INTEGER", ())?;
    }

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_files_content_hash ON files(content_hash)",
        (),
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_files_path ON files(path)",
        (),
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_files_phash ON files(phash) WHERE phash IS NOT NULL",
        (),
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
        (),
    )?;
    let current_version: Option<String> = conn
        .query_row(
            "SELECT value FROM meta WHERE key = 'phash_algo_version'",
            (),
            |row| row.get(0),
        )
        .ok();
    if current_version.as_deref() != Some(PHASH_ALGO_VERSION) {
        conn.execute("UPDATE files SET phash = NULL WHERE phash IS NOT NULL", ())?;
        conn.execute(
            "INSERT INTO meta (key, value) VALUES ('phash_algo_version', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![PHASH_ALGO_VERSION],
        )?;
    }

    Ok(conn)
}
