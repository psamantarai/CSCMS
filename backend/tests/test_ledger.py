"""Self-check for the ledger core. Run: python tests/test_ledger.py"""
import sqlite3
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import get_connection, run_migrations
from app.ledger import account_balance, insert_entry, insert_transfer_pair, reverse_entry
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


def test_transfer_pair_sums_to_zero():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        user_id = conn.execute("SELECT id FROM users WHERE username = 'admin'").fetchone()[0]
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        sbi_id = conn.execute(
            "INSERT INTO accounts (name, account_type) VALUES ('SBI', 'savings') RETURNING id"
        ).fetchone()[0]
        conn.commit()

        insert_transfer_pair(conn, business_date="2026-08-04", from_account_id=cash_id,
                              to_account_id=sbi_id, amount_paise=500000, source_id=1, created_by=user_id)
        conn.commit()

        rows = conn.execute(
            "SELECT amount_paise FROM ledger WHERE entry_type = 'transfer'"
        ).fetchall()
        assert sum(r[0] for r in rows) == 0
        assert account_balance(conn, cash_id) == -500000
        assert account_balance(conn, sbi_id) == 500000

        conn.close()


def test_transfer_pair_rolls_back_on_forced_failure():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        user_id = conn.execute("SELECT id FROM users WHERE username = 'admin'").fetchone()[0]
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        bogus_account_id = 999999  # violates the FK on the second insert

        try:
            insert_transfer_pair(conn, business_date="2026-08-04", from_account_id=cash_id,
                                  to_account_id=bogus_account_id, amount_paise=500000,
                                  source_id=1, created_by=user_id)
            assert False, "a forced FK failure on the second insert must raise"
        except sqlite3.IntegrityError:
            pass

        rows = conn.execute("SELECT * FROM ledger WHERE entry_type = 'transfer'").fetchall()
        assert len(rows) == 0, "the first insert must have been rolled back too"

        conn.close()


def test_reversal_nets_account_back_to_prior_balance():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        account_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        user_id = conn.execute("SELECT id FROM users WHERE username = 'admin'").fetchone()[0]
        entry_id = insert_entry(conn, business_date="2026-08-04", account_id=account_id, amount_paise=1000,
                                 entry_type="opening_balance", source_type="account", created_by=user_id)
        conn.commit()
        assert account_balance(conn, account_id) == 1000

        reverse_entry(conn, entry_id=entry_id, created_by=user_id)
        conn.commit()
        assert account_balance(conn, account_id) == 0

        conn.close()


def test_insert_entry_rejects_malformed_business_date():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        account_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        user_id = conn.execute("SELECT id FROM users WHERE username = 'admin'").fetchone()[0]

        for bad_date in ("not-a-date", "2026-13-45", ""):
            try:
                insert_entry(conn, business_date=bad_date, account_id=account_id, amount_paise=100,
                             entry_type="opening_balance", source_type="account", created_by=user_id)
                assert False, f"business_date {bad_date!r} must be rejected"
            except Exception as e:
                assert "400" in str(e), f"expected a 400 for {bad_date!r}, got {e}"

        insert_entry(conn, business_date="2026-08-04", account_id=account_id, amount_paise=100,
                     entry_type="opening_balance", source_type="account", created_by=user_id)
        conn.commit()
        assert conn.execute("SELECT COUNT(*) FROM ledger").fetchone()[0] == 1

        conn.close()


def test_reversal_rejected_twice():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        account_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        user_id = conn.execute("SELECT id FROM users WHERE username = 'admin'").fetchone()[0]
        entry_id = insert_entry(conn, business_date="2026-08-04", account_id=account_id, amount_paise=1000,
                                 entry_type="opening_balance", source_type="account", created_by=user_id)
        conn.commit()

        reverse_entry(conn, entry_id=entry_id, created_by=user_id)
        conn.commit()

        try:
            reverse_entry(conn, entry_id=entry_id, created_by=user_id)
            assert False, "reversing the same entry twice must raise"
        except ValueError:
            pass

        conn.close()


if __name__ == "__main__":
    test_balance_sums_mixed_signs_per_account()
    test_balance_is_zero_with_no_entries()
    test_ledger_rows_are_immutable()
    test_transfer_pair_sums_to_zero()
    test_transfer_pair_rolls_back_on_forced_failure()
    test_insert_entry_rejects_malformed_business_date()
    test_reversal_nets_account_back_to_prior_balance()
    test_reversal_rejected_twice()
    print("OK")
