#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use fastdb::{commands, db};
use tauri::{WebviewWindowBuilder, WebviewUrl};

#[tokio::main]
async fn main() {
    // Initialize database synchronously (fast with rusqlite)
    db::init_db().expect("Failed to initialize database");

    // Start pool cleanup task
    // postgres::start_cleanup_task();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(debug_assertions)]
            let url = WebviewUrl::External("http://localhost:3000".parse().unwrap());
            #[cfg(not(debug_assertions))]
            let url = WebviewUrl::App("index.html".into());

            let window = WebviewWindowBuilder::new(app, "main", url)
                .title("FastDB")
                .inner_size(1200.0, 800.0)
                .min_inner_size(800.0, 600.0)
                .center()
                .build()
                .expect("Failed to create main window");

            // Show window after 100ms to avoid white flash
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(100));
                let _ = window.show();
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_cached_servers,
            commands::get_dashboard_metrics,
            commands::connect_to_server,
            commands::execute_query,
            commands::cancel_query,
            commands::get_sql_file_metadata,
            commands::execute_sql_file,
            commands::export_schema_sql,
            commands::export_table_sql,
            commands::get_schema_tree,
            commands::refresh_schema,
            commands::get_query_history,
            commands::get_tables,
            commands::get_views,
            commands::get_columns,
            commands::get_indexes,
            commands::get_primary_key_columns,
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
