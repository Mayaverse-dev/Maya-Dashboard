import os
from typing import Any, Sequence

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

_POOL: ConnectionPool | None = None


def _database_url() -> str:
    return os.getenv("DATABASE_URL") or "postgresql://localhost:5432/maya_db"


def open_pool() -> None:
    global _POOL
    if _POOL is not None:
        return

    # min_size=0 avoids connecting at startup if DB is not reachable locally.
    _POOL = ConnectionPool(
        conninfo=_database_url(),
        min_size=0,
        max_size=int(os.getenv("DB_POOL_MAX_SIZE", "5")),
        kwargs={"row_factory": dict_row},
        open=True,
    )


def close_pool() -> None:
    global _POOL
    if _POOL is None:
        return
    _POOL.close()
    _POOL = None


def fetch_all(sql: str, params: Sequence[Any] | None = None) -> list[dict[str, Any]]:
    if _POOL is None:
        raise RuntimeError("Database pool not initialized")

    with _POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            rows = cur.fetchall()
            # With dict_row row_factory, rows are already dicts.
            return rows

