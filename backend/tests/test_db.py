"""Self-check for the migration runner and connection layer. Run: python tests/test_db.py"""
import sys
import tempfile
import threading
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


def test_connection_usable_from_another_thread():
    """H.1: FastAPI's threadpool can hand a request to a different worker
    thread than the one that opened its DB connection. Before the fix
    (check_same_thread=False), using a connection off its creating thread
    raises sqlite3.ProgrammingError."""
    with tempfile.TemporaryDirectory() as tmp:
        conn = get_connection(Path(tmp) / "test.db")
        conn.execute("CREATE TABLE t (id INTEGER PRIMARY KEY)")
        conn.commit()

        errors = []

        def use_from_other_thread():
            try:
                conn.execute("INSERT INTO t DEFAULT VALUES")
                conn.commit()
            except Exception as e:  # noqa: BLE001 — capturing to report from the main thread
                errors.append(e)

        t = threading.Thread(target=use_from_other_thread)
        t.start()
        t.join()

        assert not errors, f"connection unusable from another thread: {errors}"
        assert conn.execute("SELECT COUNT(*) FROM t").fetchone()[0] == 1
        conn.close()


def test_concurrent_writers_do_not_error():
    """H.1: 12 threads writing through independent connections to the same
    DB file must all succeed (WAL + busy timeout), not raise 'database is
    locked'."""
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "test.db"
        setup = get_connection(db_path)
        setup.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, n INTEGER)")
        setup.commit()
        setup.close()

        errors = []

        def write(n):
            try:
                c = get_connection(db_path)
                c.execute("INSERT INTO t (n) VALUES (?)", (n,))
                c.commit()
                c.close()
            except Exception as e:  # noqa: BLE001
                errors.append(e)

        threads = [threading.Thread(target=write, args=(i,)) for i in range(12)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert not errors, f"concurrent writes failed: {errors}"
        conn = get_connection(db_path)
        assert conn.execute("SELECT COUNT(*) FROM t").fetchone()[0] == 12
        conn.close()


if __name__ == "__main__":
    test_migrations_apply_once_and_advance_version()
    test_connection_usable_from_another_thread()
    test_concurrent_writers_do_not_error()
    print("OK")
