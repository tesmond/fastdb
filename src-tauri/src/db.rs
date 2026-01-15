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
pub struct QueryHistory {
    pub id: String,
    pub server_id: String,
    pub sql: String,
    pub executed_at: i64,
    pub success: i32,
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

// Bulk operations for schema refresh
pub fn clear_server_schema_data(server_id: &str) -> Result<(), rusqlite::Error> {
    let mut conn = DB.lock().unwrap();
    let tx = conn.transaction()?;

    // Delete in reverse order of foreign key dependencies
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
) -> Result<(), rusqlite::Error> {
    let mut conn = DB.lock().unwrap();
    let tx = conn.transaction()?;

    // Clear old data
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
