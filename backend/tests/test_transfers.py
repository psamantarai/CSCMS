"""Self-check for the transfers API. Calls the route function directly against
a temp DB. Run: python tests/test_transfers.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.accounts import AccountCreate, create_account
from app.db import get_connection, run_migrations
from app.ledger import account_balance
from app.seed import run_seed
from app.transfers import TransferCreate, create_transfer, list_transfers

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def _seeded_conn(tmp: Path):
    conn = get_connection(tmp / "test.db")
    run_migrations(conn, MIGRATIONS_DIR)
    run_seed(conn)
    return conn


def test_transfer_moves_balance_between_accounts():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        sbi = create_account(AccountCreate(name="SBI", account_type="savings", opening_balance_paise=0), conn)

        create_transfer(
            TransferCreate(business_date="2026-08-04", from_account_id=cash_id,
                            to_account_id=sbi["id"], amount_paise=500000),
            conn,
        )

        assert account_balance(conn, cash_id) == -500000
        assert account_balance(conn, sbi["id"]) == 500000

        conn.close()


def test_transfer_to_same_account_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]

        try:
            create_transfer(
                TransferCreate(business_date="2026-08-04", from_account_id=cash_id,
                                to_account_id=cash_id, amount_paise=100),
                conn,
            )
            assert False, "transferring to the same account must be rejected"
        except Exception as e:
            assert "400" in str(e) or "same account" in str(e)

        conn.close()


def test_list_transfers_includes_account_names():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        sbi = create_account(AccountCreate(name="SBI", account_type="savings", opening_balance_paise=0), conn)

        create_transfer(
            TransferCreate(business_date="2026-08-04", from_account_id=cash_id,
                            to_account_id=sbi["id"], amount_paise=500000),
            conn,
        )

        rows = list_transfers(20, conn)
        assert len(rows) == 1
        assert rows[0]["from_account_name"] == "Cash Drawer"
        assert rows[0]["to_account_name"] == "SBI"
        assert rows[0]["amount_paise"] == 500000

        conn.close()


if __name__ == "__main__":
    test_transfer_moves_balance_between_accounts()
    test_transfer_to_same_account_rejected()
    test_list_transfers_includes_account_names()
    print("OK")
