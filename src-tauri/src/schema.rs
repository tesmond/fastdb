use crate::db::{self, Schema, Table, Column, Index};
use crate::postgres;
use uuid::Uuid;
use chrono::Utc;

pub async fn refresh_schema_for_server(
    server: &db::Server,
    password: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let pool = postgres::get_or_create_pool(
        &server.id,
        &server.host,
        server.port as u16,
        &server.username,
        password,
        &server.database,
    )
    .await?;
    let client = pool.get().await?;

    // Clear existing schema data for the server
    db::clear_server_schema_data(&server.id)?;

    // Collect all data before inserting
    let mut schemas_to_insert = Vec::new();
    let mut tables_to_insert = Vec::new();
    let mut columns_to_insert = Vec::new();
    let mut indexes_to_insert = Vec::new();

    // Fetch schemas
    let schema_rows = client
        .query(
            "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema', 'pg_catalog')",
            &[],
        )
        .await?;
    for row in schema_rows {
        let schema_name: String = row.get(0);
        let schema_id = Uuid::new_v4().to_string();
        schemas_to_insert.push(Schema {
            id: schema_id.clone(),
            server_id: server.id.to_string(),
            name: schema_name.clone(),
            last_updated: Utc::now().timestamp(),
        });

        // Fetch tables for this schema
        let table_rows = client
            .query(
                "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = $1",
                &[&schema_name],
            )
            .await?;
        for table_row in table_rows {
            let table_name: String = table_row.get(0);
            let table_type: String = table_row.get(1);
            let table_id = Uuid::new_v4().to_string();
            tables_to_insert.push(Table {
                id: table_id.clone(),
                schema_id: schema_id.clone(),
                name: table_name.clone(),
                type_: table_type,
            });

            // Fetch columns for this table
            let column_rows = client
                .query(
                    "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2",
                    &[&schema_name, &table_name],
                )
                .await?;
            for column_row in column_rows {
                let column_name: String = column_row.get(0);
                let data_type: String = column_row.get(1);
                let is_nullable: String = column_row.get(2);
                let nullable = if is_nullable == "YES" { 1 } else { 0 };
                let column_id = Uuid::new_v4().to_string();
                columns_to_insert.push(Column {
                    id: column_id,
                    table_id: table_id.clone(),
                    name: column_name,
                    data_type,
                    nullable,
                });
            }

            // Fetch indexes for this table
            let index_rows = client
                .query(
                    "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = $2",
                    &[&schema_name, &table_name],
                )
                .await?;
            for index_row in index_rows {
                let index_name: String = index_row.get(0);
                let index_def: String = index_row.get(1);
                let index_id = Uuid::new_v4().to_string();
                indexes_to_insert.push(Index {
                    id: index_id,
                    table_id: table_id.clone(),
                    name: index_name,
                    definition: index_def,
                });
            }
        }
    }

    // Batch insert all collected data
    db::refresh_server_schema(
        &server.id,
        &schemas_to_insert,
        &tables_to_insert,
        &columns_to_insert,
        &indexes_to_insert,
    )?;

    Ok(())
}
