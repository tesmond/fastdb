#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use fastdb::{commands, db};
use tauri::Manager;

#[tokio::main]
async fn main() {
    // Initialize database synchronously (fast with rusqlite)
    db::init_db().expect("Failed to initialize database");

    // Start pool cleanup task
    // postgres::start_cleanup_task();

    tauri::Builder::default()
        .setup(|app| {
            let window = app.get_window("main").unwrap();
            // Show window after 100ms to avoid white flash
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(100));
                let _ = window.show();
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_cached_servers,
            commands::connect_to_server,
            commands::execute_query,
            commands::cancel_query,
            commands::get_schema_tree,
            commands::refresh_schema,
            commands::get_query_history,
            commands::get_tables,
            commands::get_columns,
            commands::get_indexes,
            commands::get_autocomplete_items,
            commands::add_server,
            commands::get_query_history_dedup,
            commands::search_query_history,
            commands::delete_query_history_entry,
            commands::clear_query_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
