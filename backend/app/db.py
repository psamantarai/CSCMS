import sqlite3
from pathlib import Path


def get_connection(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


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
