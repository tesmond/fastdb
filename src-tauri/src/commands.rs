use tauri::{command, Window};
use crate::db::{self, QueryHistory, QueryHistoryEntry};
use crate::credentials;
use serde::{Deserialize, Serialize};
use chrono::Utc;
use uuid::Uuid;
use std::panic::AssertUnwindSafe;

#[derive(Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<ColumnInfo>,
    pub rows: Vec<serde_json::Value>,
    #[serde(rename = "rowsAffected")]
    pub rows_affected: Option<usize>,
}

#[derive(Serialize, Deserialize)]
pub struct ColumnInfo {
    pub name: String,
    #[serde(rename = "type")]
    pub type_: Option<String>,
}

#[command]
pub async fn get_cached_servers() -> Result<Vec<db::Server>, String> {
    db::get_servers().map_err(|e| e.to_string())
}

#[command]
pub async fn connect_to_server(server_id: String) -> Result<String, String> {
    let server = db::get_server_by_id(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or("Server not found")?;

    let password = credentials::retrieve_password(&server.credential_key)
        .map_err(|e| format!("Failed to retrieve password: {}", e))?;

    crate::postgres::get_or_create_pool(
        &server.id,
        &server.host,
        server.port as u16,
        &server.username,
        &password,
        &server.database,
    )
    .await
    .map_err(|e| e.to_string())?;

    // Update last connected timestamp
    db::update_server_last_connected(&server_id, Utc::now().timestamp())
        .map_err(|e| e.to_string())?;

    Ok(server_id)
}

#[command]
pub async fn execute_query(server_id: String, sql: String) -> Result<QueryResult, String> {
    let server = db::get_server_by_id(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or("Server not found")?;

    let password = credentials::retrieve_password(&server.credential_key)
        .map_err(|e| format!("Failed to retrieve password: {}", e))?;

    let rows = crate::postgres::execute_query(&server.id, &server.host, server.port as u16, &server.username, &password, &server.database, &sql)
        .await
        .map_err(|e| {
            // Format database errors in a human-readable way
            if let Some(db_error) = e.downcast_ref::<tokio_postgres::Error>() {
                if let Some(db_err) = db_error.as_db_error() {
                    return format!("{}: {}", db_err.code().code(), db_err.message());
                }
            }
            format!("Error: {}", e)
        })?;

    // Extract column information
    let columns = if !rows.is_empty() {
        rows[0]
            .columns()
            .iter()
            .map(|col: &tokio_postgres::Column| ColumnInfo {
                name: col.name().to_string(),
                type_: Some(format!("{:?}", col.type_())),
            })
            .collect()
    } else {
        vec![]
    };

    // Convert rows to JSON
    let json_rows: Vec<serde_json::Value> = rows
        .iter()
        .map(|row: &tokio_postgres::Row| {
            let mut map = serde_json::Map::new();
            for (idx, col) in row.columns().iter().enumerate() {
                let value: serde_json::Value = match col.type_().name() {
                    "int4" => std::panic::catch_unwind(AssertUnwindSafe(|| row.get::<_, Option<i32>>(idx)))
                        .unwrap_or(None)
                        .map(|v: i32| v.into())
                        .unwrap_or(serde_json::Value::Null),
                    "int8" => std::panic::catch_unwind(AssertUnwindSafe(|| row.get::<_, Option<i64>>(idx)))
                        .unwrap_or(None)
                        .map(|v: i64| v.into())
                        .unwrap_or(serde_json::Value::Null),
                    "float4" => std::panic::catch_unwind(AssertUnwindSafe(|| row.get::<_, Option<f32>>(idx)))
                        .unwrap_or(None)
                        .map(|v: f32| v.into())
                        .unwrap_or(serde_json::Value::Null),
                    "float8" => std::panic::catch_unwind(AssertUnwindSafe(|| row.get::<_, Option<f64>>(idx)))
                        .unwrap_or(None)
                        .map(|v: f64| v.into())
                        .unwrap_or(serde_json::Value::Null),
                    "bool" => std::panic::catch_unwind(AssertUnwindSafe(|| row.get::<_, Option<bool>>(idx)))
                        .unwrap_or(None)
                        .map(|v: bool| v.into())
                        .unwrap_or(serde_json::Value::Null),
                    "text" | "varchar" => std::panic::catch_unwind(AssertUnwindSafe(|| row.get::<_, Option<String>>(idx)))
                        .unwrap_or(None)
                        .map(|v: String| v.into())
                        .unwrap_or(serde_json::Value::Null),
                    _ => std::panic::catch_unwind(AssertUnwindSafe(|| row.get::<_, Option<String>>(idx)))
                        .unwrap_or(None)
                        .map(|v: String| v.into())
                        .unwrap_or(serde_json::Value::Null),
                };
                map.insert(col.name().to_string(), value);
            }
            serde_json::Value::Object(map)
        })
        .collect();

    // Save to history (legacy table)
    let now = Utc::now().timestamp();
    let history = QueryHistory {
        id: Uuid::new_v4().to_string(),
        server_id: server_id.clone(),
        sql: sql.clone(),
        executed_at: now,
        success: 1,
    };
    if let Err(e) = db::add_query_history(&history) {
        eprintln!("Failed to save query history: {}", e);
    }

    // Save to deduplicated history (for UI)
    if let Err(e) = db::upsert_query_history_dedup(&server_id, &sql, now) {
        eprintln!("Failed to save deduplicated query history: {}", e);
    }

    Ok(QueryResult {
        columns,
        rows: json_rows,
        rows_affected: Some(rows.len()),
    })
}

#[command]
pub async fn get_schema_tree(server_id: String) -> Result<Vec<db::Schema>, String> {
    db::get_schemas(&server_id).map_err(|e| e.to_string())
}

#[command]
pub async fn refresh_schema(window: Window, server_id: String) -> Result<(), String> {
    let server = db::get_server_by_id(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or("Server not found")?;

    let password = credentials::retrieve_password(&server.credential_key)
        .map_err(|e| format!("Failed to retrieve password: {}", e))?;

    crate::schema::refresh_schema_for_server(&server, &password)
        .await
        .map_err(|e| e.to_string())?;

    // Emit updated schema
    let updated_schemas = db::get_schemas(&server_id).map_err(|e| e.to_string())?;

    #[derive(Serialize, Clone)]
    struct SchemaUpdate {
        #[serde(rename = "serverId")]
        server_id: String,
        schemas: Vec<db::Schema>,
    }

    window
        .emit(
            "schema_updated",
            SchemaUpdate {
                server_id: server_id.clone(),
                schemas: updated_schemas,
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[command]
pub async fn get_query_history(server_id: String) -> Result<Vec<db::QueryHistory>, String> {
    db::get_query_history(&server_id, 100).map_err(|e| e.to_string())
}

#[command]
pub async fn get_tables(schema_id: String) -> Result<Vec<db::Table>, String> {
    db::get_tables(&schema_id).map_err(|e| e.to_string())
}

#[command]
pub async fn get_columns(table_id: String) -> Result<Vec<db::Column>, String> {
    db::get_columns(&table_id).map_err(|e| e.to_string())
}

#[command]
pub async fn add_server(server: db::Server, password: String) -> Result<(), String> {
    // Store password in credential manager
    credentials::store_password(&server.credential_key, &server.username, &password)
        .map_err(|e| format!("Failed to store password: {}", e))?;

    // Add server to DB
    db::add_server(&server).map_err(|e| e.to_string())?;

    Ok(())
}

// ============================================================================
// Deduplicated Query History Commands
// ============================================================================

/// Get deduplicated query history for a server (sorted by most recently executed)
#[command]
pub async fn get_query_history_dedup(
    server_id: String,
    limit: Option<usize>,
) -> Result<Vec<QueryHistoryEntry>, String> {
    let limit = limit.unwrap_or(500);
    db::get_query_history_dedup(&server_id, limit).map_err(|e| e.to_string())
}

/// Search query history with case-insensitive partial matching
#[command]
pub async fn search_query_history(
    server_id: String,
    search_term: String,
    limit: Option<usize>,
) -> Result<Vec<QueryHistoryEntry>, String> {
    let limit = limit.unwrap_or(500);
    if search_term.trim().is_empty() {
        // If search term is empty, return all history
        db::get_query_history_dedup(&server_id, limit).map_err(|e| e.to_string())
    } else {
        db::search_query_history_dedup(&server_id, &search_term, limit).map_err(|e| e.to_string())
    }
}

/// Delete a specific query from history
#[command]
pub async fn delete_query_history_entry(entry_id: String) -> Result<(), String> {
    db::delete_query_history_entry(&entry_id).map_err(|e| e.to_string())
}

/// Clear all query history for a server
#[command]
pub async fn clear_query_history(server_id: String) -> Result<(), String> {
    db::clear_query_history_dedup(&server_id).map_err(|e| e.to_string())
}
