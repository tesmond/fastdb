use tauri::{command, Window};
use crate::db::{self, QueryHistory, QueryHistoryEntry};
use crate::credentials;
use serde::{Deserialize, Serialize};
use chrono::Utc;
use uuid::Uuid;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::fs::File;
use tokio::io::{AsyncReadExt, BufReader};
use tokio_postgres::CopyInSink;
use bytes::Bytes;
use futures_util::SinkExt;
use std::pin::Pin;

#[derive(Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<ColumnInfo>,
    pub rows: Vec<serde_json::Value>,
    #[serde(rename = "rowsAffected")]
    pub rows_affected: Option<usize>,
    pub message: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct ColumnInfo {
    pub name: String,
    #[serde(rename = "type")]
    pub type_: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct SqlFileMetadata {
    pub path: String,
    pub name: String,
    #[serde(rename = "sizeBytes")]
    pub size_bytes: u64,
    #[serde(rename = "createdAt")]
    pub created_at: Option<i64>,
}

fn system_time_to_epoch_millis(time: SystemTime) -> Option<i64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|d| i64::try_from(d.as_millis()).ok())
}

fn format_pg_error(error: &tokio_postgres::Error) -> String {
    if let Some(db_err) = error.as_db_error() {
        format!(
            "{}: {}\nDetail: {}\nHint: {}\nWhere: {}",
            db_err.code().code(),
            db_err.message(),
            db_err.detail().unwrap_or("(none)"),
            db_err.hint().unwrap_or("(none)"),
            db_err.where_().unwrap_or("(none)")
        )
    } else {
        error.to_string()
    }
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
pub async fn get_sql_file_metadata(file_path: String) -> Result<SqlFileMetadata, String> {
    let path = Path::new(&file_path);
    let name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("(unknown)")
        .to_string();

    let metadata = std::fs::metadata(&file_path)
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;

    let created_at = metadata
        .created()
        .ok()
        .and_then(system_time_to_epoch_millis);

    Ok(SqlFileMetadata {
        path: file_path,
        name,
        size_bytes: metadata.len(),
        created_at,
    })
}

#[command]
pub async fn execute_query(
    window: Window,
    server_id: String,
    sql: String,
    query_id: Option<String>,
) -> Result<QueryResult, String> {
    let normalized = normalize_sql_head(&sql);
    let is_create_table = normalized.starts_with("create table");
    let is_drop_table = normalized.starts_with("drop table");
    let is_drop_database = normalized.starts_with("drop database");

    let server = db::get_server_by_id(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or("Server not found")?;

    let password = credentials::retrieve_password(&server.credential_key)
        .map_err(|e| format!("Failed to retrieve password: {}", e))?;

    let exec_result = crate::postgres::execute_query(
        &server.id,
        &server.host,
        server.port as u16,
        &server.username,
        &password,
        &server.database,
        &sql,
        query_id.as_deref(),
    )
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

    let (columns, json_rows, rows_affected) = match exec_result {
        crate::postgres::QueryExecutionResult::Rows(rows) => {
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

            let json_rows: Vec<serde_json::Value> = rows
                .iter()
                .map(|row: &tokio_postgres::Row| {
                    let mut map = serde_json::Map::new();
                    for (idx, col) in row.columns().iter().enumerate() {
                        let value: serde_json::Value = match col.type_().name() {
                            "void" => serde_json::Value::Null,
                            "int4" => row
                                .try_get::<_, Option<i32>>(idx)
                                .ok()
                                .flatten()
                                .map(|v: i32| v.into())
                                .unwrap_or(serde_json::Value::Null),
                            "int8" => row
                                .try_get::<_, Option<i64>>(idx)
                                .ok()
                                .flatten()
                                .map(|v: i64| v.into())
                                .unwrap_or(serde_json::Value::Null),
                            "float4" => row
                                .try_get::<_, Option<f32>>(idx)
                                .ok()
                                .flatten()
                                .map(|v: f32| v.into())
                                .unwrap_or(serde_json::Value::Null),
                            "float8" => row
                                .try_get::<_, Option<f64>>(idx)
                                .ok()
                                .flatten()
                                .map(|v: f64| v.into())
                                .unwrap_or(serde_json::Value::Null),
                            "bool" => row
                                .try_get::<_, Option<bool>>(idx)
                                .ok()
                                .flatten()
                                .map(|v: bool| v.into())
                                .unwrap_or(serde_json::Value::Null),
                            "text" | "varchar" => row
                                .try_get::<_, Option<String>>(idx)
                                .ok()
                                .flatten()
                                .map(|v: String| v.into())
                                .unwrap_or(serde_json::Value::Null),
                            _ => row
                                .try_get::<_, Option<String>>(idx)
                                .ok()
                                .flatten()
                                .map(|v: String| v.into())
                                .unwrap_or(serde_json::Value::Null),
                        };
                        map.insert(col.name().to_string(), value);
                    }
                    serde_json::Value::Object(map)
                })
                .collect();

            (columns, json_rows, Some(rows.len()))
        }
        crate::postgres::QueryExecutionResult::Affected(affected) => {
            (vec![], vec![], Some(affected as usize))
        }
    };

    if is_drop_table || is_drop_database {
        if let Err(e) = crate::schema::refresh_schema_for_server(&server, &password).await {
            eprintln!("Failed to refresh schema after DROP TABLE/DATABASE: {}", e);
        } else {
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
        }
    }

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

    let message = if is_create_table {
        Some("Table created".to_string())
    } else if is_drop_table {
        Some("Table dropped".to_string())
    } else if is_drop_database {
        Some("Database dropped".to_string())
    } else {
        None
    };

    Ok(QueryResult {
        columns,
        rows: json_rows,
        rows_affected,
        message,
    })
}

#[command]
pub async fn execute_sql_file(server_id: String, file_path: String) -> Result<QueryResult, String> {
    let server = db::get_server_by_id(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or("Server not found")?;

    let password = credentials::retrieve_password(&server.credential_key)
        .map_err(|e| format!("Failed to retrieve password: {}", e))?;

    let pool = crate::postgres::get_or_create_pool(
        &server.id,
        &server.host,
        server.port as u16,
        &server.username,
        &password,
        &server.database,
    )
    .await
    .map_err(|e| format!("Failed to connect to database: {}", e))?;

    let client = pool
        .get()
        .await
        .map_err(|e| format!("Failed to get database client: {}", e))?;

    let path = Path::new(&file_path);
    let file_name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("SQL file");

    let file = File::open(&file_path)
        .await
        .map_err(|e| format!("Failed to open SQL file: {}", e))?;
    let mut reader = BufReader::new(file);
    let mut buffer = vec![0u8; 64 * 1024];

    let mut statement = String::new();
    let mut statement_count: usize = 0;

    let mut in_copy = false;
    let mut copy_sink: Option<Pin<Box<CopyInSink<Bytes>>>> = None;
    let mut copy_line_buffer = String::new();

    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut pending_single_quote_end = false;
    let mut pending_double_quote_end = false;
    let mut in_line_comment = false;
    let mut in_block_comment = false;
    let mut block_prev_char: Option<char> = None;
    let mut dollar_tag: Option<String> = None;
    let mut dollar_candidate: Option<String> = None;

    loop {
        let bytes_read = reader
            .read(&mut buffer)
            .await
            .map_err(|e| format!("Failed to read SQL file: {}", e))?;

        if bytes_read == 0 {
            break;
        }

        let chunk = String::from_utf8_lossy(&buffer[..bytes_read]);
        let mut iter = chunk.chars().peekable();

        while let Some(c) = iter.next() {
            let mut ch = c;
            let mut reprocess = true;

            while reprocess {
                reprocess = false;

                if in_copy {
                    if ch == '\n' {
                        let line = copy_line_buffer.trim_end_matches('\r');
                        if line == "\\." {
                            if let Some(mut sink) = copy_sink.take() {
                                match sink.as_mut().finish().await {
                                    Ok(_) => {}
                                    Err(e) => {
                                        let detail = format_pg_error(&e);
                                        return Err(format!("Failed to finalize COPY: {}", detail));
                                    }
                                }
                            }
                            in_copy = false;
                        } else if line.trim().is_empty() {
                            copy_line_buffer.clear();
                            continue;
                        } else if let Some(sink) = copy_sink.as_mut() {
                            sink.as_mut()
                                .send(Bytes::from(line.to_owned()))
                                .await
                                .map_err(|e| format!("Failed writing COPY data: {}", e))?;
                            sink.as_mut()
                                .send(Bytes::from_static(b"\n"))
                                .await
                                .map_err(|e| format!("Failed writing COPY data: {}", e))?;
                        }
                        copy_line_buffer.clear();
                    } else {
                        copy_line_buffer.push(ch);
                    }
                    continue;
                }

                if pending_single_quote_end {
                    if ch == '\'' {
                        statement.push(ch);
                        pending_single_quote_end = false;
                        continue;
                    } else {
                        in_single_quote = false;
                        pending_single_quote_end = false;
                        reprocess = true;
                        continue;
                    }
                }

                if pending_double_quote_end {
                    if ch == '"' {
                        statement.push(ch);
                        pending_double_quote_end = false;
                        continue;
                    } else {
                        in_double_quote = false;
                        pending_double_quote_end = false;
                        reprocess = true;
                        continue;
                    }
                }

                if in_line_comment {
                    if ch == '\n' {
                        in_line_comment = false;
                    }
                    continue;
                }

                if in_block_comment {
                    if block_prev_char == Some('*') && ch == '/' {
                        in_block_comment = false;
                        block_prev_char = None;
                    } else {
                        block_prev_char = Some(ch);
                    }
                    continue;
                }

                if let Some(tag) = &dollar_tag {
                    statement.push(ch);
                    if ch == '$' && statement.ends_with(tag) {
                        dollar_tag = None;
                    }
                    continue;
                }

                if let Some(tag) = dollar_candidate.as_mut() {
                    statement.push(ch);
                    if ch == '$' {
                        let tag_value = dollar_candidate.take().unwrap_or_default();
                        dollar_tag = Some(format!("${}$", tag_value));
                    } else if ch.is_ascii_alphanumeric() || ch == '_' {
                        tag.push(ch);
                    } else {
                        dollar_candidate = None;
                    }
                    continue;
                }

                if in_single_quote {
                    statement.push(ch);
                    if ch == '\'' {
                        pending_single_quote_end = true;
                    }
                    continue;
                }

                if in_double_quote {
                    statement.push(ch);
                    if ch == '"' {
                        pending_double_quote_end = true;
                    }
                    continue;
                }

                if ch == '-' && iter.peek() == Some(&'-') {
                    if let Some(_) = iter.next() {
                        in_line_comment = true;
                    }
                    continue;
                }

                if ch == '/' && iter.peek() == Some(&'*') {
                    if let Some(_) = iter.next() {
                        in_block_comment = true;
                        block_prev_char = Some('*');
                    }
                    continue;
                }

                if ch == '$' {
                    statement.push(ch);
                    dollar_candidate = Some(String::new());
                    continue;
                }

                if ch == '\'' {
                    statement.push(ch);
                    in_single_quote = true;
                    continue;
                }

                if ch == '"' {
                    statement.push(ch);
                    in_double_quote = true;
                    continue;
                }

                if ch == ';' {
                    let trimmed = statement.trim();
                    if !trimmed.is_empty() {
                        let trimmed_lower = trimmed.to_lowercase();
                        if trimmed_lower.starts_with("copy")
                            && trimmed_lower.contains("from stdin")
                        {
                            let sink = client
                                .copy_in(trimmed)
                                .await
                                .map_err(|e| format!("Failed to start COPY: {}", e))?;
                            copy_sink = Some(Box::pin(sink));
                            in_copy = true;
                        } else {
                            if let Err(e) = client.batch_execute(trimmed).await {
                                let preview: String = trimmed.chars().take(500).collect();
                                return Err(format!(
                                    "Failed executing SQL statement {}: {}\nStatement preview:\n{}",
                                    statement_count + 1,
                                    e,
                                    preview
                                ));
                            }
                            statement_count += 1;
                        }
                    }
                    statement.clear();
                    continue;
                }

                statement.push(ch);
            }
        }
    }

    if in_copy {
        if !copy_line_buffer.is_empty() {
            let line = copy_line_buffer.trim_end_matches('\r');
            if line == "\\." {
                if let Some(mut sink) = copy_sink.take() {
                    match sink.as_mut().finish().await {
                        Ok(_) => {}
                        Err(e) => {
                            let detail = format_pg_error(&e);
                            return Err(format!("Failed to finalize COPY: {}", detail));
                        }
                    }
                }
                in_copy = false;
            }
        }
    }

    if in_copy {
        return Err("COPY data did not terminate with \\.".to_string());
    }

    if !statement.trim().is_empty() {
        let trimmed = statement.trim();
        let trimmed_lower = trimmed.to_lowercase();
        if trimmed_lower.starts_with("copy") && trimmed_lower.contains("from stdin") {
            return Err("COPY statement missing data section".to_string());
        }

        if let Err(e) = client.batch_execute(trimmed).await {
            let preview: String = trimmed.chars().take(500).collect();
            return Err(format!(
                "Failed executing SQL statement {}: {}\nStatement preview:\n{}",
                statement_count + 1,
                e,
                preview
            ));
        }
        statement_count += 1;
    }

    let message = Some(format!(
        "Executed {} ({} statement{})",
        file_name,
        statement_count,
        if statement_count == 1 { "" } else { "s" }
    ));

    Ok(QueryResult {
        columns: vec![],
        rows: vec![],
        rows_affected: None,
        message,
    })
}

fn normalize_sql_head(sql: &str) -> String {
    let mut s = sql.trim_start().to_string();

    loop {
        let trimmed = s.trim_start();
        if trimmed.starts_with("--") {
            if let Some(pos) = trimmed.find('\n') {
                s = trimmed[pos + 1..].to_string();
                continue;
            }
            return "".to_string();
        }
        if trimmed.starts_with("/*") {
            if let Some(end) = trimmed.find("*/") {
                s = trimmed[end + 2..].to_string();
                continue;
            }
            return "".to_string();
        }
        return trimmed.to_lowercase();
    }
}

#[command]
pub async fn cancel_query(query_id: String) -> Result<(), String> {
    crate::postgres::cancel_query(&query_id)
        .await
        .map_err(|e| e.to_string())
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
pub async fn get_views(schema_id: String) -> Result<Vec<db::View>, String> {
    db::get_views(&schema_id).map_err(|e| e.to_string())
}

#[command]
pub async fn get_columns(table_id: String) -> Result<Vec<db::Column>, String> {
    db::get_columns(&table_id).map_err(|e| e.to_string())
}

#[command]
pub async fn get_indexes(table_id: String) -> Result<Vec<db::Index>, String> {
    let cached = db::get_indexes(&table_id).map_err(|e| e.to_string())?;
    if !cached.is_empty() {
        return Ok(cached);
    }

    let context = db::get_table_context(&table_id).map_err(|e| e.to_string())?;
    let Some((table_name, schema_name, server_id, database_name)) = context else {
        return Ok(vec![]);
    };

    let server = db::get_server_by_id(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or("Server not found")?;

    let password = credentials::retrieve_password(&server.credential_key)
        .map_err(|e| format!("Failed to retrieve password: {}", e))?;

    let target_database = if database_name.is_empty() {
        server.database.clone()
    } else {
        database_name
    };

    let pool = crate::postgres::get_or_create_pool(
        &server.id,
        &server.host,
        server.port as u16,
        &server.username,
        &password,
        &target_database,
    )
    .await
    .map_err(|e| e.to_string())?;

    let client = pool.get().await.map_err(|e| e.to_string())?;
    let rows = client
        .query(
            "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = $2",
            &[&schema_name, &table_name],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut indexes: Vec<db::Index> = Vec::new();
    for row in rows {
        let name: String = row.get(0);
        let definition: String = row.get(1);
        indexes.push(db::Index {
            id: Uuid::new_v4().to_string(),
            table_id: table_id.clone(),
            name,
            definition,
        });
    }

    db::replace_indexes_for_table(&table_id, &indexes).map_err(|e| e.to_string())?;

    Ok(indexes)
}

#[command]
pub async fn get_autocomplete_items(server_id: String) -> Result<db::AutocompleteItems, String> {
    db::get_autocomplete_items(&server_id).map_err(|e| e.to_string())
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
