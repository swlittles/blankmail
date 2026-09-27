//! The app's SQLite database, owned by the backend.
//!
//! Replaces tauri-plugin-sql, which ran every statement on whichever of up to
//! 10 pooled connections was free (and opened a second pool on each `load`).
//! The frontend's transactions are separate `BEGIN` / statement / `COMMIT`
//! calls, so they could land on different connections: statements ran outside
//! their transaction and stray open transactions held locks, producing
//! "database is locked" (SQLITE_BUSY / SQLITE_BUSY_SNAPSHOT, code 517).
//!
//! Here there is exactly one connection, so a transaction's statements always
//! share it, and callers queue for it instead of racing each other.

use serde_json::{Map, Value as JsonValue};
use sqlx::sqlite::{SqliteArguments, SqliteConnectOptions, SqlitePool, SqlitePoolOptions, SqliteRow};
use sqlx::{Column, Row, TypeInfo, Value, ValueRef};
use std::time::Duration;
use tauri::Manager;

/// Same file the SQL plugin used (`sqlite:blankmail.db` in the app config dir).
const DB_FILE: &str = "blankmail.db";

pub struct Db(pub SqlitePool);

pub async fn open(app: &tauri::AppHandle) -> Result<SqlitePool, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("No app config directory: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not create {dir:?}: {e}"))?;

    let options = SqliteConnectOptions::new()
        .filename(dir.join(DB_FILE))
        .create_if_missing(true)
        // Only another process (e.g. a second copy of the app) can hold the
        // lock now; wait for it instead of failing immediately.
        .busy_timeout(Duration::from_secs(10));

    SqlitePoolOptions::new()
        .max_connections(1)
        .min_connections(1)
        // Queued statements wait for the single connection; long syncs can
        // keep it busy for a while.
        .acquire_timeout(Duration::from_secs(120))
        // Keep the connection forever: an idle-timeout reconnect in the middle
        // of a frontend transaction would silently drop it.
        .idle_timeout(None)
        .max_lifetime(None)
        .connect_with(options)
        .await
        .map_err(|e| format!("Could not open database: {e}"))
}

/// Bind JSON values the way the frontend expects: strings as TEXT, whole
/// numbers as INTEGER, other numbers as REAL, null as NULL, and anything else
/// (booleans, arrays, objects) as its JSON text.
fn bind_values<'q>(
    mut query: sqlx::query::Query<'q, sqlx::Sqlite, SqliteArguments<'q>>,
    values: Vec<JsonValue>,
) -> sqlx::query::Query<'q, sqlx::Sqlite, SqliteArguments<'q>> {
    for value in values {
        query = match value {
            JsonValue::Null => query.bind(None::<String>),
            JsonValue::String(s) => query.bind(s),
            JsonValue::Number(n) => match n.as_i64() {
                Some(i) => query.bind(i),
                None => query.bind(n.as_f64().unwrap_or_default()),
            },
            other => query.bind(other.to_string()),
        };
    }
    query
}

fn column_to_json(row: &SqliteRow, index: usize) -> Result<JsonValue, String> {
    let raw = row.try_get_raw(index).map_err(|e| e.to_string())?;
    if raw.is_null() {
        return Ok(JsonValue::Null);
    }
    let value = ValueRef::to_owned(&raw);
    let type_name = raw.type_info().name().to_ascii_uppercase();
    Ok(match type_name.as_str() {
        "INTEGER" | "NUMERIC" => value.try_decode::<i64>().map(JsonValue::from).unwrap_or(JsonValue::Null),
        "REAL" => value.try_decode::<f64>().map(JsonValue::from).unwrap_or(JsonValue::Null),
        "BOOLEAN" => value.try_decode::<bool>().map(JsonValue::Bool).unwrap_or(JsonValue::Null),
        "BLOB" => value
            .try_decode::<Vec<u8>>()
            .map(|bytes| JsonValue::Array(bytes.into_iter().map(JsonValue::from).collect()))
            .unwrap_or(JsonValue::Null),
        // TEXT, DATE, TIME, DATETIME and anything else: return what's stored.
        _ => value
            .try_decode::<String>()
            .map(JsonValue::String)
            .or_else(|_| value.try_decode::<i64>().map(JsonValue::from))
            .or_else(|_| value.try_decode::<f64>().map(JsonValue::from))
            .unwrap_or(JsonValue::Null),
    })
}

/// Returns `[rows_affected, last_insert_id]`.
#[tauri::command]
pub async fn db_execute(
    db: tauri::State<'_, Db>,
    query: String,
    values: Vec<JsonValue>,
) -> Result<(u64, i64), String> {
    let result = bind_values(sqlx::query(&query), values)
        .execute(&db.0)
        .await
        .map_err(|e| format!("error returned from database: {e}"))?;
    Ok((result.rows_affected(), result.last_insert_rowid()))
}

#[tauri::command]
pub async fn db_select(
    db: tauri::State<'_, Db>,
    query: String,
    values: Vec<JsonValue>,
) -> Result<Vec<Map<String, JsonValue>>, String> {
    let rows = bind_values(sqlx::query(&query), values)
        .fetch_all(&db.0)
        .await
        .map_err(|e| format!("error returned from database: {e}"))?;
    rows.iter()
        .map(|row| {
            let mut obj = Map::new();
            for (i, column) in row.columns().iter().enumerate() {
                obj.insert(column.name().to_string(), column_to_json(row, i)?);
            }
            Ok(obj)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    async fn memory_pool() -> SqlitePool {
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(SqliteConnectOptions::new().in_memory(true))
            .await
            .unwrap()
    }

    async fn select(pool: &SqlitePool, sql: &str, values: Vec<JsonValue>) -> Vec<Map<String, JsonValue>> {
        let rows = bind_values(sqlx::query(sql), values).fetch_all(pool).await.unwrap();
        rows.iter()
            .map(|r| {
                (0..r.columns().len())
                    .map(|i| (r.columns()[i].name().to_string(), column_to_json(r, i).unwrap()))
                    .collect()
            })
            .collect()
    }

    #[tokio::test]
    async fn binds_and_decodes_like_the_sql_plugin() {
        let pool = memory_pool().await;
        sqlx::query("CREATE TABLE t (i INTEGER, r REAL, s TEXT, b BLOB, n TEXT, j TEXT)")
            .execute(&pool)
            .await
            .unwrap();
        bind_values(sqlx::query("INSERT INTO t VALUES ($1, $2, $3, x'0102', $4, $5)"), vec![
            json!(1_700_000_000_123i64),
            json!(1.5),
            json!("héllo"),
            JsonValue::Null,
            json!(true),
        ])
        .execute(&pool)
        .await
        .unwrap();

        let rows = select(&pool, "SELECT * FROM t WHERE i = $1", vec![json!(1_700_000_000_123i64)]).await;
        assert_eq!(rows.len(), 1);
        let row = &rows[0];
        assert_eq!(row["i"], json!(1_700_000_000_123i64));
        assert_eq!(row["r"], json!(1.5));
        assert_eq!(row["s"], json!("héllo"));
        assert_eq!(row["b"], json!([1, 2]));
        assert_eq!(row["n"], JsonValue::Null);
        assert_eq!(row["j"], json!("true"));
    }

    #[tokio::test]
    async fn separate_calls_share_one_transaction() {
        // The frontend sends BEGIN, statements and COMMIT/ROLLBACK as separate
        // calls; with one connection they must all apply to the same transaction.
        let pool = memory_pool().await;
        sqlx::query("CREATE TABLE t (v INTEGER)").execute(&pool).await.unwrap();
        sqlx::query("BEGIN IMMEDIATE").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO t VALUES (1)").execute(&pool).await.unwrap();
        sqlx::query("ROLLBACK").execute(&pool).await.unwrap();
        let rows = select(&pool, "SELECT COUNT(*) AS c FROM t", vec![]).await;
        assert_eq!(rows[0]["c"], json!(0));
    }
}
