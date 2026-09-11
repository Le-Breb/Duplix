mod commands;
mod db;
mod scanner;

use rusqlite::Connection;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tauri::Manager;

pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub cancel_flag: Arc<AtomicBool>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("duplix.sqlite");
            let conn = db::open(&db_path)?;

            app.manage(AppState {
                db: Arc::new(Mutex::new(conn)),
                cancel_flag: Arc::new(AtomicBool::new(false)),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::pick_folder,
            commands::start_scan,
            commands::cancel_scan,
            commands::get_duplicate_groups,
            commands::trash_files,
            commands::clear_cache,
            commands::get_similar_image_groups,
            commands::get_image_thumbnail,
            commands::start_image_indexing,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
