"""Self-check for the banking ledger mapping (PLAN 5.1). One test per
txn_type: principal rows must sum to zero, commission must be the only
income booked. Run: python tests/test_banking_ledger.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.accounts import AccountCreate, create_account, _system_user_id
from app.db import get_connection, run_migrations
from app.ledger import account_balance, insert_banking_entries
from app.seed import run_seed, seed_admin_user

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def _seeded_conn(tmp: Path):
    conn = get_connection(tmp / "test.db")
    run_migrations(conn, MIGRATIONS_DIR)
    run_seed(conn)
    seed_admin_user(conn)
    return conn


def _principal_types():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        sbi = create_account(AccountCreate(name="SBI", account_type="settlement", opening_balance_paise=1000000), conn)
        user_id = _system_user_id(conn)

        for txn_type in ("withdrawal", "deposit", "aeps", "money_transfer"):
            cash_before = account_balance(conn, cash_id)
            settlement_before = account_balance(conn, sbi["id"])

            ids = insert_banking_entries(
                conn, business_date="2026-08-05", txn_type=txn_type,
                principal_paise=500000, commission_paise=5000,
                settlement_account_id=sbi["id"], cash_account_id=cash_id,
                source_id=1, created_by=user_id,
            )
            conn.commit()

            assert len(ids) == 3, f"{txn_type}: expected 2 principal rows + 1 commission row"
            rows = conn.execute("SELECT * FROM ledger WHERE id IN ({})".format(
                ",".join("?" * len(ids))), ids).fetchall()
            principal_rows = [r for r in rows if r["entry_type"] == "transfer"]
            commission_rows = [r for r in rows if r["entry_type"] == "commission"]

            assert sum(r["amount_paise"] for r in principal_rows) == 0, \
                f"{txn_type}: principal rows must sum to zero"
            assert len(commission_rows) == 1 and commission_rows[0]["amount_paise"] == 5000, \
                f"{txn_type}: commission must be booked as its own income row"
            assert commission_rows[0]["account_id"] == cash_id

            # only the commission is a net gain; principal nets to zero for
            # the pair of accounts touched.
            assert account_balance(conn, cash_id) == cash_before + 500000 + 5000
            assert account_balance(conn, sbi["id"]) == settlement_before - 500000

        conn.close()


def test_withdrawal_deposit_aeps_money_transfer_move_principal_and_book_commission():
    _principal_types()


def test_balance_enquiry_books_commission_only():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        sbi = create_account(AccountCreate(name="SBI", account_type="settlement", opening_balance_paise=1000000), conn)
        user_id = _system_user_id(conn)
        cash_before = account_balance(conn, cash_id)
        settlement_before = account_balance(conn, sbi["id"])

        ids = insert_banking_entries(
            conn, business_date="2026-08-05", txn_type="balance_enquiry",
            principal_paise=0, commission_paise=1000,
            settlement_account_id=sbi["id"], cash_account_id=cash_id,
            source_id=1, created_by=user_id,
        )
        conn.commit()

        assert len(ids) == 1
        row = conn.execute("SELECT * FROM ledger WHERE id = ?", (ids[0],)).fetchone()
        assert row["entry_type"] == "commission"
        assert row["amount_paise"] == 1000
        assert account_balance(conn, cash_id) == cash_before + 1000
        assert account_balance(conn, sbi["id"]) == settlement_before  # untouched: no principal

        conn.close()


if __name__ == "__main__":
    test_withdrawal_deposit_aeps_money_transfer_move_principal_and_book_commission()
    test_balance_enquiry_books_commission_only()
    print("OK")
