import sqlite3
from pathlib import Path

from app.settings import settings


def get_connection(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
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
