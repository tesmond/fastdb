use once_cell::sync::Lazy;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

// Global SQLite connection with optimized settings
static DB: Lazy<Arc<Mutex<Connection>>> = Lazy::new(|| {
    let data_dir = dirs::data_dir().expect("Failed to get data directory").join("FastDB");
    std::fs::create_dir_all(&data_dir).expect("Failed to create data directory");
    let db_path = data_dir.join("fastdb.db");
    let conn = Connection::open(db_path).expect("Failed to open database");

    // Performance optimizations
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA temp_store = MEMORY;
         PRAGMA mmap_size = 30000000000;
         PRAGMA page_size = 4096;
         PRAGMA cache_size = -64000;",
    )
    .expect("Failed to set pragmas");

    Arc::new(Mutex::new(conn))
});

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Server {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: i32,
    pub database: String,
    pub username: String,
    pub credential_key: String,
    pub group_name: Option<String>,
    pub last_connected: Option<i64>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Schema {
    pub id: String,
    pub server_id: String,
    pub name: String,
    pub last_updated: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Table {
    pub id: String,
    pub schema_id: String,
    pub name: String,
    #[serde(rename = "type_")]
    pub type_: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Column {
    pub id: String,
    pub table_id: String,
    pub name: String,
    pub data_type: String,
    pub nullable: i32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Index {
    pub id: String,
    pub table_id: String,
    pub name: String,
    pub definition: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AutocompleteItems {
    pub tables: Vec<String>,
    pub columns: Vec<String>,
    pub indexes: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct QueryHistory {
    pub id: String,
    pub server_id: String,
    pub sql: String,
    pub executed_at: i64,
    pub success: i32,
}

/// Deduplicated query history entry
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct QueryHistoryEntry {
    pub id: String,
    pub server_id: String,
    /// The original SQL text (preserving formatting from last execution)
    pub sql: String,
    /// Normalized SQL for deduplication (trimmed, collapsed whitespace)
    pub normalized_sql: String,
    /// Timestamp of the last execution
    pub last_executed_at: i64,
    /// Number of times this query was executed
    pub execution_count: i64,
}

pub fn init_db() -> Result<(), rusqlite::Error> {
    let conn = DB.lock().unwrap();

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS servers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            host TEXT NOT NULL,
            port INTEGER NOT NULL DEFAULT 5432,
            database TEXT NOT NULL,
            username TEXT NOT NULL,
            credential_key TEXT NOT NULL,
            group_name TEXT,
            last_connected INTEGER
        ) WITHOUT ROWID;

        CREATE INDEX IF NOT EXISTS idx_servers_group ON servers(group_name) WHERE group_name IS NOT NULL;

        CREATE TABLE IF NOT EXISTS schemas (
            id TEXT PRIMARY KEY,
            server_id TEXT NOT NULL,
            name TEXT NOT NULL,
            last_updated INTEGER NOT NULL,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_schemas_server_updated ON schemas(server_id, last_updated DESC);

        CREATE TABLE IF NOT EXISTS tables (
            id TEXT PRIMARY KEY,
            schema_id TEXT NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            FOREIGN KEY (schema_id) REFERENCES schemas(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_tables_schema_name ON tables(schema_id, name, type);

        CREATE TABLE IF NOT EXISTS columns (
            id TEXT PRIMARY KEY,
            table_id TEXT NOT NULL,
            name TEXT NOT NULL,
            data_type TEXT NOT NULL,
            nullable INTEGER NOT NULL,
            FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_columns_table_id ON columns(table_id);

        CREATE TABLE IF NOT EXISTS indexes (
            id TEXT PRIMARY KEY,
            table_id TEXT NOT NULL,
            name TEXT NOT NULL,
            definition TEXT NOT NULL,
            FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_indexes_table_id ON indexes(table_id);

        CREATE TABLE IF NOT EXISTS query_history (
            id TEXT PRIMARY KEY,
            server_id TEXT NOT NULL,
            sql TEXT NOT NULL,
            executed_at INTEGER NOT NULL,
            success INTEGER NOT NULL,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_query_history_server_exec
            ON query_history(server_id, executed_at DESC)
            WHERE success = 1;

        -- Deduplicated query history for UI
        CREATE TABLE IF NOT EXISTS query_history_dedup (
            id TEXT PRIMARY KEY,
            server_id TEXT NOT NULL,
            sql TEXT NOT NULL,
            normalized_sql TEXT NOT NULL,
            last_executed_at INTEGER NOT NULL,
            execution_count INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_query_history_dedup_server_time
            ON query_history_dedup(server_id, last_executed_at DESC);

        CREATE UNIQUE INDEX IF NOT EXISTS idx_query_history_dedup_normalized
            ON query_history_dedup(server_id, normalized_sql);
        "#
    )?;

    Ok(())
}

// Server operations
pub fn get_servers() -> Result<Vec<Server>, rusqlite::Error> {
    let conn = DB.lock().unwrap();
    let mut stmt = conn.prepare_cached(
        "SELECT id, name, host, port, database, username, credential_key, group_name, last_connected
         FROM servers
         ORDER BY last_connected DESC NULLS LAST, name"
    )?;

    let servers = stmt
        .query_map([], |row| {
            Ok(Server {
                id: row.get(0)?,
                name: row.get(1)?,
                host: row.get(2)?,
                port: row.get(3)?,
                database: row.get(4)?,
                username: row.get(5)?,
                credential_key: row.get(6)?,
                group_name: row.get(7)?,
                last_connected: row.get(8)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(servers)
}

pub fn get_server_by_id(server_id: &str) -> Result<Option<Server>, rusqlite::Error> {
    let conn = DB.lock().unwrap();
    let mut stmt = conn.prepare_cached(
        "SELECT id, name, host, port, database, username, credential_key, group_name, last_connected
         FROM servers WHERE id = ?"
    )?;

    stmt.query_row([server_id], |row| {
        Ok(Server {
            id: row.get(0)?,
            name: row.get(1)?,
            host: row.get(2)?,
            port: row.get(3)?,
            database: row.get(4)?,
            username: row.get(5)?,
            credential_key: row.get(6)?,
            group_name: row.get(7)?,
            last_connected: row.get(8)?,
        })
    })
    .optional()
}

pub fn add_server(server: &Server) -> Result<(), rusqlite::Error> {
    let conn = DB.lock().unwrap();
    let mut stmt = conn.prepare_cached(
        "INSERT INTO servers (id, name, host, port, database, username, credential_key, group_name, last_connected)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )?;

    stmt.execute(params![
        server.id,
        server.name,
        server.host,
        server.port,
        server.database,
        server.username,
        server.credential_key,
        server.group_name,
        server.last_connected
    ])?;

    Ok(())
}

pub fn update_server_last_connected(
    server_id: &str,
    timestamp: i64,
) -> Result<(), rusqlite::Error> {
    let conn = DB.lock().unwrap();
    let mut stmt = conn.prepare_cached("UPDATE servers SET last_connected = ? WHERE id = ?")?;
    stmt.execute(params![timestamp, server_id])?;
    Ok(())
}

pub fn delete_server(server_id: &str) -> Result<(), rusqlite::Error> {
    let conn = DB.lock().unwrap();
    let mut stmt = conn.prepare_cached("DELETE FROM servers WHERE id = ?")?;
    stmt.execute([server_id])?;
    Ok(())
}

// Schema operations
pub fn get_schemas(server_id: &str) -> Result<Vec<Schema>, rusqlite::Error> {
    let conn = DB.lock().unwrap();
    let mut stmt = conn.prepare_cached(
        "SELECT id, server_id, name, last_updated
         FROM schemas
         WHERE server_id = ?
         ORDER BY name",
    )?;

    let schemas = stmt
        .query_map([server_id], |row| {
            Ok(Schema {
                id: row.get(0)?,
                server_id: row.get(1)?,
                name: row.get(2)?,
                last_updated: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(schemas)
}

// Batch insert schemas (much faster than individual inserts)
pub fn batch_insert_schemas(schemas: &[Schema]) -> Result<(), rusqlite::Error> {
    if schemas.is_empty() {
        return Ok(());
    }

    let mut conn = DB.lock().unwrap();
    let tx = conn.transaction()?;

    {
        let mut stmt = tx.prepare_cached(
            "INSERT INTO schemas (id, server_id, name, last_updated) VALUES (?, ?, ?, ?)",
        )?;

        for schema in schemas {
            stmt.execute(params![
                schema.id,
                schema.server_id,
                schema.name,
                schema.last_updated
            ])?;
        }
    }

    tx.commit()?;
    Ok(())
}

// Table operations
pub fn get_tables(schema_id: &str) -> Result<Vec<Table>, rusqlite::Error> {
    let conn = DB.lock().unwrap();
    let mut stmt = conn.prepare_cached(
        "SELECT id, schema_id, name, type
         FROM tables
         WHERE schema_id = ?
         ORDER BY name",
    )?;

    let tables = stmt
        .query_map([schema_id], |row| {
            Ok(Table {
                id: row.get(0)?,
                schema_id: row.get(1)?,
                name: row.get(2)?,
                type_: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(tables)
}

pub fn batch_insert_tables(tables: &[Table]) -> Result<(), rusqlite::Error> {
    if tables.is_empty() {
        return Ok(());
    }

    let mut conn = DB.lock().unwrap();
    let tx = conn.transaction()?;

    {
        let mut stmt = tx
            .prepare_cached("INSERT INTO tables (id, schema_id, name, type) VALUES (?, ?, ?, ?)")?;

        for table in tables {
            stmt.execute(params![table.id, table.schema_id, table.name, table.type_])?;
        }
    }

    tx.commit()?;
    Ok(())
}

// Column operations
pub fn get_columns(table_id: &str) -> Result<Vec<Column>, rusqlite::Error> {
    let conn = DB.lock().unwrap();
    let mut stmt = conn.prepare_cached(
        "SELECT id, table_id, name, data_type, nullable
         FROM columns
         WHERE table_id = ?
         ORDER BY name",
    )?;

    let columns = stmt
        .query_map([table_id], |row| {
            Ok(Column {
                id: row.get(0)?,
                table_id: row.get(1)?,
                name: row.get(2)?,
                data_type: row.get(3)?,
                nullable: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(columns)
}

pub fn get_table_context(
    table_id: &str,
) -> Result<Option<(String, String, String)>, rusqlite::Error> {
    let conn = DB.lock().unwrap();
    let mut stmt = conn.prepare_cached(
        "SELECT t.name, s.name, s.server_id
         FROM tables t
         JOIN schemas s ON s.id = t.schema_id
         WHERE t.id = ?",
    )?;

    stmt.query_row([table_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    })
    .optional()
}

// Index operations
pub fn get_indexes(table_id: &str) -> Result<Vec<Index>, rusqlite::Error> {
    let conn = DB.lock().unwrap();
    let mut stmt = conn.prepare_cached(
        "SELECT id, table_id, name, definition
         FROM indexes
         WHERE table_id = ?
         ORDER BY name",
    )?;

    let indexes = stmt
        .query_map([table_id], |row| {
            Ok(Index {
                id: row.get(0)?,
                table_id: row.get(1)?,
                name: row.get(2)?,
                definition: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(indexes)
}

pub fn get_autocomplete_items(server_id: &str) -> Result<AutocompleteItems, rusqlite::Error> {
    let conn = DB.lock().unwrap();

    let mut tables_stmt = conn.prepare_cached(
        "SELECT t.name
         FROM tables t
         JOIN schemas s ON s.id = t.schema_id
         WHERE s.server_id = ?
         ORDER BY t.name",
    )?;
    let tables = tables_stmt
        .query_map([server_id], |row| row.get(0))?
        .collect::<Result<Vec<String>, _>>()?;

    let mut columns_stmt = conn.prepare_cached(
        "SELECT c.name
         FROM columns c
         JOIN tables t ON t.id = c.table_id
         JOIN schemas s ON s.id = t.schema_id
         WHERE s.server_id = ?
         ORDER BY c.name",
    )?;
    let columns = columns_stmt
        .query_map([server_id], |row| row.get(0))?
        .collect::<Result<Vec<String>, _>>()?;

    let mut indexes_stmt = conn.prepare_cached(
        "SELECT i.name
         FROM indexes i
         JOIN tables t ON t.id = i.table_id
         JOIN schemas s ON s.id = t.schema_id
         WHERE s.server_id = ?
         ORDER BY i.name",
    )?;
    let indexes = indexes_stmt
        .query_map([server_id], |row| row.get(0))?
        .collect::<Result<Vec<String>, _>>()?;

    Ok(AutocompleteItems {
        tables,
        columns,
        indexes,
    })
}

pub fn replace_indexes_for_table(
    table_id: &str,
    indexes: &[Index],
) -> Result<(), rusqlite::Error> {
    let mut conn = DB.lock().unwrap();
    let tx = conn.transaction()?;

    tx.execute("DELETE FROM indexes WHERE table_id = ?", [table_id])?;

    {
        let mut stmt = tx.prepare_cached(
            "INSERT INTO indexes (id, table_id, name, definition) VALUES (?, ?, ?, ?)",
        )?;
        for index in indexes {
            stmt.execute(params![
                index.id,
                index.table_id,
                index.name,
                index.definition
            ])?;
        }
    }

    tx.commit()?;
    Ok(())
}

pub fn batch_insert_columns(columns: &[Column]) -> Result<(), rusqlite::Error> {
    if columns.is_empty() {
        return Ok(());
    }

    let mut conn = DB.lock().unwrap();
    let tx = conn.transaction()?;

    {
        let mut stmt = tx.prepare_cached(
            "INSERT INTO columns (id, table_id, name, data_type, nullable) VALUES (?, ?, ?, ?, ?)",
        )?;

        for column in columns {
            stmt.execute(params![
                column.id,
                column.table_id,
                column.name,
                column.data_type,
                column.nullable
            ])?;
        }
    }

    tx.commit()?;
    Ok(())
}

// Query history operations
pub fn get_query_history(
    server_id: &str,
    limit: usize,
) -> Result<Vec<QueryHistory>, rusqlite::Error> {
    let conn = DB.lock().unwrap();
    let mut stmt = conn.prepare_cached(
        "SELECT id, server_id, sql, executed_at, success
         FROM query_history
         WHERE server_id = ?
         ORDER BY executed_at DESC
         LIMIT ?",
    )?;

    let history = stmt
        .query_map(params![server_id, limit], |row| {
            Ok(QueryHistory {
                id: row.get(0)?,
                server_id: row.get(1)?,
                sql: row.get(2)?,
                executed_at: row.get(3)?,
                success: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(history)
}

pub fn add_query_history(history: &QueryHistory) -> Result<(), rusqlite::Error> {
    let conn = DB.lock().unwrap();
    let mut stmt = conn.prepare_cached(
        "INSERT INTO query_history (id, server_id, sql, executed_at, success) VALUES (?, ?, ?, ?, ?)"
    )?;

    stmt.execute(params![
        history.id,
        history.server_id,
        history.sql,
        history.executed_at,
        history.success
    ])?;

    Ok(())
}

// ============================================================================
// Deduplicated Query History Operations
// ============================================================================

/// Normalize SQL for deduplication:
/// - Trim leading/trailing whitespace
/// - Collapse consecutive whitespace characters into single spaces
fn normalize_sql(sql: &str) -> String {
    sql.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Upsert a query into the deduplicated history.
/// If the normalized SQL already exists for this server, update it.
/// Otherwise, insert a new entry.
pub fn upsert_query_history_dedup(
    server_id: &str,
    sql: &str,
    executed_at: i64,
) -> Result<(), rusqlite::Error> {
    let normalized = normalize_sql(sql);
    let conn = DB.lock().unwrap();

    // Try to find existing entry
    let existing_id: Option<String> = conn
        .query_row(
            "SELECT id FROM query_history_dedup WHERE server_id = ? AND normalized_sql = ?",
            params![server_id, &normalized],
            |row| row.get(0),
        )
        .optional()?;

    if let Some(id) = existing_id {
        // Update existing entry
        let mut stmt = conn.prepare_cached(
            "UPDATE query_history_dedup 
             SET sql = ?, last_executed_at = ?, execution_count = execution_count + 1
             WHERE id = ?"
        )?;
        stmt.execute(params![sql, executed_at, id])?;
    } else {
        // Insert new entry
        let id = uuid::Uuid::new_v4().to_string();
        let mut stmt = conn.prepare_cached(
            "INSERT INTO query_history_dedup (id, server_id, sql, normalized_sql, last_executed_at, execution_count)
             VALUES (?, ?, ?, ?, ?, 1)"
        )?;
        stmt.execute(params![id, server_id, sql, &normalized, executed_at])?;
    }

    Ok(())
}

/// Get deduplicated query history for a server, sorted by most recently executed first.
pub fn get_query_history_dedup(
    server_id: &str,
    limit: usize,
) -> Result<Vec<QueryHistoryEntry>, rusqlite::Error> {
    let conn = DB.lock().unwrap();
    let mut stmt = conn.prepare_cached(
        "SELECT id, server_id, sql, normalized_sql, last_executed_at, execution_count
         FROM query_history_dedup
         WHERE server_id = ?
         ORDER BY last_executed_at DESC
         LIMIT ?"
    )?;

    let history = stmt
        .query_map(params![server_id, limit], |row| {
            Ok(QueryHistoryEntry {
                id: row.get(0)?,
                server_id: row.get(1)?,
                sql: row.get(2)?,
                normalized_sql: row.get(3)?,
                last_executed_at: row.get(4)?,
                execution_count: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(history)
}

/// Search query history with case-insensitive partial matching.
/// Results are still sorted by most recently executed first.
pub fn search_query_history_dedup(
    server_id: &str,
    search_term: &str,
    limit: usize,
) -> Result<Vec<QueryHistoryEntry>, rusqlite::Error> {
    let conn = DB.lock().unwrap();
    let search_pattern = format!("%{}%", search_term);
    
    let mut stmt = conn.prepare_cached(
        "SELECT id, server_id, sql, normalized_sql, last_executed_at, execution_count
         FROM query_history_dedup
         WHERE server_id = ? AND sql LIKE ? ESCAPE '\\'
         ORDER BY last_executed_at DESC
         LIMIT ?"
    )?;

    let history = stmt
        .query_map(params![server_id, &search_pattern, limit], |row| {
            Ok(QueryHistoryEntry {
                id: row.get(0)?,
                server_id: row.get(1)?,
                sql: row.get(2)?,
                normalized_sql: row.get(3)?,
                last_executed_at: row.get(4)?,
                execution_count: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(history)
}

/// Delete a specific query from the deduplicated history.
pub fn delete_query_history_entry(entry_id: &str) -> Result<(), rusqlite::Error> {
    let conn = DB.lock().unwrap();
    let mut stmt = conn.prepare_cached("DELETE FROM query_history_dedup WHERE id = ?")?;
    stmt.execute([entry_id])?;
    Ok(())
}

/// Clear all deduplicated query history for a server.
pub fn clear_query_history_dedup(server_id: &str) -> Result<(), rusqlite::Error> {
    let conn = DB.lock().unwrap();
    let mut stmt = conn.prepare_cached("DELETE FROM query_history_dedup WHERE server_id = ?")?;
    stmt.execute([server_id])?;
    Ok(())
}

// Bulk operations for schema refresh
pub fn clear_server_schema_data(server_id: &str) -> Result<(), rusqlite::Error> {
    let mut conn = DB.lock().unwrap();
    let tx = conn.transaction()?;

    // Delete in reverse order of foreign key dependencies
    tx.execute(
        "DELETE FROM indexes WHERE table_id IN
         (SELECT id FROM tables WHERE schema_id IN
          (SELECT id FROM schemas WHERE server_id = ?))",
        [server_id],
    )?;

    tx.execute(
        "DELETE FROM columns WHERE table_id IN
         (SELECT id FROM tables WHERE schema_id IN
          (SELECT id FROM schemas WHERE server_id = ?))",
        [server_id],
    )?;

    tx.execute(
        "DELETE FROM tables WHERE schema_id IN
         (SELECT id FROM schemas WHERE server_id = ?)",
        [server_id],
    )?;

    tx.execute("DELETE FROM schemas WHERE server_id = ?", [server_id])?;

    tx.commit()?;
    Ok(())
}

// Batch refresh entire schema for a server (transactional, fast)
pub fn refresh_server_schema(
    server_id: &str,
    schemas: &[Schema],
    tables: &[Table],
    columns: &[Column],
    indexes: &[Index],
) -> Result<(), rusqlite::Error> {
    let mut conn = DB.lock().unwrap();
    let tx = conn.transaction()?;

    // Clear old data
    tx.execute(
        "DELETE FROM indexes WHERE table_id IN
         (SELECT id FROM tables WHERE schema_id IN
          (SELECT id FROM schemas WHERE server_id = ?))",
        [server_id],
    )?;

    tx.execute(
        "DELETE FROM columns WHERE table_id IN
         (SELECT id FROM tables WHERE schema_id IN
          (SELECT id FROM schemas WHERE server_id = ?))",
        [server_id],
    )?;

    tx.execute(
        "DELETE FROM tables WHERE schema_id IN
         (SELECT id FROM schemas WHERE server_id = ?)",
        [server_id],
    )?;

    tx.execute("DELETE FROM schemas WHERE server_id = ?", [server_id])?;

    // Batch insert new data
    {
        let mut stmt = tx.prepare_cached(
            "INSERT INTO schemas (id, server_id, name, last_updated) VALUES (?, ?, ?, ?)",
        )?;
        for schema in schemas {
            stmt.execute(params![
                schema.id,
                schema.server_id,
                schema.name,
                schema.last_updated
            ])?;
        }
    }

    {
        let mut stmt = tx
            .prepare_cached("INSERT INTO tables (id, schema_id, name, type) VALUES (?, ?, ?, ?)")?;
        for table in tables {
            stmt.execute(params![table.id, table.schema_id, table.name, table.type_])?;
        }
    }

    {
        let mut stmt = tx.prepare_cached(
            "INSERT INTO columns (id, table_id, name, data_type, nullable) VALUES (?, ?, ?, ?, ?)",
        )?;
        for column in columns {
            stmt.execute(params![
                column.id,
                column.table_id,
                column.name,
                column.data_type,
                column.nullable
            ])?;
        }
    }

    {
        let mut stmt = tx.prepare_cached(
            "INSERT INTO indexes (id, table_id, name, definition) VALUES (?, ?, ?, ?)",
        )?;
        for index in indexes {
            stmt.execute(params![
                index.id,
                index.table_id,
                index.name,
                index.definition
            ])?;
        }
    }

    tx.commit()?;
    Ok(())
}

// Utility: Check if schema is stale (older than threshold)
pub fn is_schema_stale(server_id: &str, threshold_seconds: i64) -> Result<bool, rusqlite::Error> {
    let conn = DB.lock().unwrap();
    let mut stmt = conn
        .prepare_cached("SELECT COUNT(*) FROM schemas WHERE server_id = ? AND last_updated < ?")?;

    let now = chrono::Utc::now().timestamp();
    let cutoff = now - threshold_seconds;

    let count: i64 = stmt.query_row(params![server_id, cutoff], |row| row.get(0))?;

    Ok(count > 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_init_db() {
        assert!(init_db().is_ok());
    }

    #[test]
    fn test_server_crud() {
        init_db().unwrap();

        let server = Server {
            id: "test-1".to_string(),
            name: "Test Server".to_string(),
            host: "localhost".to_string(),
            port: 5432,
            database: "testdb".to_string(),
            username: "user".to_string(),
            credential_key: "key-1".to_string(),
            group_name: None,
            last_connected: None,
        };

        add_server(&server).unwrap();
        let servers = get_servers().unwrap();
        assert!(servers.iter().any(|s| s.id == "test-1"));

        delete_server("test-1").unwrap();
    }
}
