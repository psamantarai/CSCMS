import sqlite3
from pathlib import Path

from app.settings import settings


def get_connection(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    # check_same_thread=False: FastAPI's sync endpoints run each request on a
    # threadpool worker, not necessarily the thread that opened the
    # connection (H.1) — WAL + a busy timeout let concurrent readers/writers
    # coexist instead of hitting "database is locked".
    conn = sqlite3.connect(db_path, check_same_thread=False, timeout=10)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn


def get_db():
    """FastAPI dependency: one connection per request."""
    conn = get_connection(settings.db_path)
    try:
        yield conn
    finally:
        conn.close()


def begin_write(conn: sqlite3.Connection) -> None:
    """H.11: acquire the write lock before a read-check-write guard's SELECT.
    A bare SELECT starts no transaction at all — sqlite3 only auto-BEGINs on
    the first INSERT/UPDATE — and under WAL (H.1) readers never block
    writers, so without this every "reject the write if the current state
    says X" guard on a money path checks pre-state against N concurrent
    requests doing the same thing at once. Call this immediately before the
    guard's SELECT; the caller commits or rolls back as usual."""
    conn.execute("BEGIN IMMEDIATE")


def run_migrations(conn: sqlite3.Connection, migrations_dir: Path) -> None:
    """Apply numbered .sql files (e.g. 001_init.sql) whose number exceeds
    PRAGMA user_version, in ascending order. Each applied file bumps
    user_version to its number, so a second run applies nothing."""
    current = conn.execute("PRAGMA user_version").fetchone()[0]
    for path in sorted(migrations_dir.glob("*.sql")):
        version = int(path.name.split("_", 1)[0])
        if version <= current:
            continue
        conn.executescript(path.read_text())
        conn.execute(f"PRAGMA user_version = {version}")
        conn.commit()
        current = version
