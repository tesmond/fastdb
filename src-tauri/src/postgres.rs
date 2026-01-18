use deadpool_postgres::{Config, ManagerConfig, Pool, RecyclingMethod, Runtime, PoolConfig};
use tokio_postgres::{NoTls, CancelToken};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::time::Duration;

static POOLS: once_cell::sync::Lazy<Arc<Mutex<HashMap<String, Pool>>>> =
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

static CANCEL_TOKENS: once_cell::sync::Lazy<Arc<Mutex<HashMap<String, CancelToken>>>> =
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

pub async fn get_or_create_pool(
    server_id: &str,
    host: &str,
    port: u16,
    user: &str,
    password: &str,
    dbname: &str,
) -> Result<Pool, Box<dyn std::error::Error>> {
    let mut pools = POOLS.lock().await;

    if let Some(pool) = pools.get(server_id) {
        return Ok(pool.clone());
    }

    let mut cfg = Config::new();
    cfg.host = Some(host.to_string());
    cfg.port = Some(port);
    cfg.user = Some(user.to_string());
    cfg.password = Some(password.to_string());
    cfg.dbname = Some(dbname.to_string());
    cfg.manager = Some(ManagerConfig {
        recycling_method: RecyclingMethod::Fast,
    });
    cfg.pool = Some(PoolConfig {
        max_size: 10,
        timeouts: deadpool_postgres::Timeouts::default(),
    });

    let pool = cfg.create_pool(Some(Runtime::Tokio1), NoTls)?;
    pools.insert(server_id.to_string(), pool.clone());
    Ok(pool)
}

pub enum QueryExecutionResult {
    Rows(Vec<tokio_postgres::Row>),
    Affected(u64),
}

fn quote_ident(ident: &str) -> String {
    format!("\"{}\"", ident.replace('"', "\"\""))
}

fn strip_leading_comments(sql: &str) -> &str {
    let mut remaining = sql;
    loop {
        let trimmed = remaining.trim_start();
        if trimmed.starts_with("--") {
            if let Some(pos) = trimmed.find('\n') {
                remaining = &trimmed[pos + 1..];
                continue;
            }
            return "";
        }

        if trimmed.starts_with("/*") {
            if let Some(end) = trimmed.find("*/") {
                remaining = &trimmed[end + 2..];
                continue;
            }
            return "";
        }

        return trimmed;
    }
}

pub async fn execute_query(
    server_id: &str,
    host: &str,
    port: u16,
    user: &str,
    password: &str,
    dbname: &str,
    sql: &str,
    query_id: Option<&str>,
    schema_name: Option<&str>,
) -> Result<QueryExecutionResult, Box<dyn std::error::Error>> {
    // Ensure pool exists
    get_or_create_pool(server_id, host, port, user, password, dbname).await?;
    let pool = {
        let pools = POOLS.lock().await;
        pools
            .get(server_id)
            .cloned()
            .ok_or("Pool not found for this server")?
    };
    let mut client = pool.get().await?;

    if let Some(id) = query_id {
        let mut tokens = CANCEL_TOKENS.lock().await;
        tokens.insert(id.to_string(), client.cancel_token());
    }

    let trimmed = strip_leading_comments(sql).to_lowercase();
    let is_query = trimmed.starts_with("select") || trimmed.starts_with("with") || trimmed.starts_with("show") || trimmed.starts_with("explain");

    let result = if let Some(schema) = schema_name {
        let tx = client.transaction().await?;
        let search_path_sql = format!("SET LOCAL search_path TO {}", quote_ident(schema));
        tx.batch_execute(&search_path_sql).await?;

        if is_query {
            let rows = tx.query(sql, &[]).await?;
            tx.commit().await?;
            QueryExecutionResult::Rows(rows)
        } else {
            let affected = tx.execute(sql, &[]).await?;
            tx.commit().await?;
            QueryExecutionResult::Affected(affected)
        }
    } else if is_query {
        let rows = client.query(sql, &[]).await?;
        QueryExecutionResult::Rows(rows)
    } else {
        let affected = client.execute(sql, &[]).await?;
        QueryExecutionResult::Affected(affected)
    };

    if let Some(id) = query_id {
        let mut tokens = CANCEL_TOKENS.lock().await;
        tokens.remove(id);
    }

    Ok(result)
}

pub async fn cancel_query(query_id: &str) -> Result<(), Box<dyn std::error::Error>> {
    let token = {
        let tokens = CANCEL_TOKENS.lock().await;
        tokens.get(query_id).cloned()
    };

    match token {
        Some(token) => {
            token.cancel_query(NoTls).await?;
            Ok(())
        }
        None => Err("No running query for this id".into()),
    }
}

pub async fn cleanup_idle_pools() {
    let mut pools = POOLS.lock().await;
    pools.retain(|_, pool| {
        let status = pool.status();
        status.size > 0 && status.available < status.max_size.try_into().unwrap()
    });
}

pub fn start_cleanup_task() {
    tokio::spawn(async {
        loop {
            tokio::time::sleep(Duration::from_secs(300)).await;
            cleanup_idle_pools().await;
        }
    });
}
