"""Self-check for seed data. Run: python tests/test_seed.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import get_connection, run_migrations
from app.seed import SERVICES, run_seed, seed_admin_user

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def test_seed_is_idempotent():
    with tempfile.TemporaryDirectory() as tmp:
        conn = get_connection(Path(tmp) / "test.db")
        run_migrations(conn, MIGRATIONS_DIR)

        run_seed(conn)
        run_seed(conn)  # second run must not duplicate anything

        assert conn.execute("SELECT COUNT(*) FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0] == 1
        assert conn.execute("SELECT COUNT(*) FROM services").fetchone()[0] == len(SERVICES)
        assert conn.execute("SELECT COUNT(*) FROM settings").fetchone()[0] == 2

        conn.close()


# 9.8: run_seed() must NOT create a user — a standing admin row would make
# /api/auth/bootstrap's "zero users" precondition never true on a real
# fresh install. seed_admin_user() is the separate, test-only opt-in.
def test_run_seed_creates_no_user():
    with tempfile.TemporaryDirectory() as tmp:
        conn = get_connection(Path(tmp) / "test.db")
        run_migrations(conn, MIGRATIONS_DIR)

        run_seed(conn)

        assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0

        conn.close()


def test_seed_admin_user_is_idempotent_and_hashes_the_password():
    with tempfile.TemporaryDirectory() as tmp:
        conn = get_connection(Path(tmp) / "test.db")
        run_migrations(conn, MIGRATIONS_DIR)

        seed_admin_user(conn)
        seed_admin_user(conn)  # second call must not duplicate

        assert conn.execute("SELECT COUNT(*) FROM users WHERE username = 'admin'").fetchone()[0] == 1
        password_hash = conn.execute("SELECT password_hash FROM users WHERE username = 'admin'").fetchone()[0]
        assert password_hash != "admin123", "password must be hashed, not stored in plaintext"

        conn.close()


if __name__ == "__main__":
    test_seed_is_idempotent()
    test_run_seed_creates_no_user()
    test_seed_admin_user_is_idempotent_and_hashes_the_password()
    print("OK")
