"""Self-check for migration 001. Run: python tests/test_schema.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import get_connection, run_migrations

EXPECTED_TABLES = {
    "accounts", "customers", "services", "users", "transactions", "payments",
    "banking_transactions", "expenses", "account_transfers", "ledger",
    "daily_account_balance", "business_days", "settings", "audit_logs",
    "attachments",
}


def test_schema_applies_cleanly():
    with tempfile.TemporaryDirectory() as tmp:
        conn = get_connection(Path(tmp) / "test.db")
        run_migrations(conn, Path(__file__).resolve().parent.parent / "migrations")

        tables = {r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )}
        assert EXPECTED_TABLES <= tables, f"missing: {EXPECTED_TABLES - tables}"

        assert conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert conn.execute("PRAGMA foreign_key_check").fetchone() is None

        conn.close()


if __name__ == "__main__":
    test_schema_applies_cleanly()
    print("OK")
