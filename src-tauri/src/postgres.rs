use deadpool_postgres::{Config, ManagerConfig, Pool, RecyclingMethod, Runtime, PoolConfig};
use tokio_postgres::NoTls;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::time::Duration;

static POOLS: once_cell::sync::Lazy<Arc<Mutex<HashMap<String, Pool>>>> =
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
        max_size: 2,
        timeouts: deadpool_postgres::Timeouts::default(),
    });

    let pool = cfg.create_pool(Some(Runtime::Tokio1), NoTls)?;
    pools.insert(server_id.to_string(), pool.clone());
    Ok(pool)
}

pub async fn execute_query(
    server_id: &str,
    host: &str,
    port: u16,
    user: &str,
    password: &str,
    dbname: &str,
    sql: &str,
) -> Result<Vec<tokio_postgres::Row>, Box<dyn std::error::Error>> {
    // Ensure pool exists
    get_or_create_pool(server_id, host, port, user, password, dbname).await?;
    let pools = POOLS.lock().await;
    let pool = pools.get(server_id).ok_or("Pool not found for this server")?;
    let client = pool.get().await?;
    let rows = client.query(sql, &[]).await?;
    Ok(rows)
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
