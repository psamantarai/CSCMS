"""Self-check for the ledger core. Run: python tests/test_ledger.py"""
import sqlite3
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import get_connection, run_migrations
from app.ledger import account_balance, insert_entry
from app.seed import run_seed

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def _seeded_conn(tmp: Path) -> sqlite3.Connection:
    conn = get_connection(tmp / "test.db")
    run_migrations(conn, MIGRATIONS_DIR)
    run_seed(conn)  # gives us a real account and user row to reference
    return conn


def test_balance_sums_mixed_signs_per_account():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        account_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        user_id = conn.execute("SELECT id FROM users WHERE username = 'admin'").fetchone()[0]
        other_account_id = conn.execute(
            "INSERT INTO accounts (name, account_type) VALUES ('Other', 'cash') RETURNING id"
        ).fetchone()[0]

        insert_entry(conn, business_date="2026-08-04", account_id=account_id, amount_paise=1000,
                     entry_type="opening_balance", source_type="account", created_by=user_id)
        insert_entry(conn, business_date="2026-08-04", account_id=account_id, amount_paise=-300,
                     entry_type="expense", source_type="expense", created_by=user_id)
        insert_entry(conn, business_date="2026-08-04", account_id=account_id, amount_paise=200,
                     entry_type="service_income", source_type="transaction", created_by=user_id)
        insert_entry(conn, business_date="2026-08-04", account_id=other_account_id, amount_paise=99999,
                     entry_type="opening_balance", source_type="account", created_by=user_id)
        conn.commit()

        assert account_balance(conn, account_id) == 900
        assert account_balance(conn, other_account_id) == 99999

        conn.close()


def test_balance_is_zero_with_no_entries():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        account_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        assert account_balance(conn, account_id) == 0
        conn.close()


def test_ledger_rows_are_immutable():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        account_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        user_id = conn.execute("SELECT id FROM users WHERE username = 'admin'").fetchone()[0]
        entry_id = insert_entry(conn, business_date="2026-08-04", account_id=account_id, amount_paise=500,
                                 entry_type="opening_balance", source_type="account", created_by=user_id)
        conn.commit()

        try:
            conn.execute("UPDATE ledger SET amount_paise = 1 WHERE id = ?", (entry_id,))
            assert False, "updating a ledger row must raise"
        except sqlite3.IntegrityError:
            pass

        try:
            conn.execute("DELETE FROM ledger WHERE id = ?", (entry_id,))
            assert False, "deleting a ledger row must raise"
        except sqlite3.IntegrityError:
            pass

        conn.close()


if __name__ == "__main__":
    test_balance_sums_mixed_signs_per_account()
    test_balance_is_zero_with_no_entries()
    test_ledger_rows_are_immutable()
    print("OK")
