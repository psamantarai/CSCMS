"""Self-check for the migration runner. Run: python tests/test_db.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import get_connection, run_migrations


def test_migrations_apply_once_and_advance_version():
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        migrations_dir = tmp / "migrations"
        migrations_dir.mkdir()
        (migrations_dir / "001_init.sql").write_text("CREATE TABLE t (id INTEGER PRIMARY KEY);")
        (migrations_dir / "002_add_col.sql").write_text("ALTER TABLE t ADD COLUMN name TEXT;")

        conn = get_connection(tmp / "test.db")
        run_migrations(conn, migrations_dir)
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 2

        conn.execute("INSERT INTO t (id, name) VALUES (1, 'a')")
        conn.commit()

        # Second run must be a no-op: re-applying would error (table/column already exists).
        run_migrations(conn, migrations_dir)
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 2
        assert conn.execute("SELECT COUNT(*) FROM t").fetchone()[0] == 1

        conn.close()


if __name__ == "__main__":
    test_migrations_apply_once_and_advance_version()
    print("OK")
