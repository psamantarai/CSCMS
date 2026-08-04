"""Self-check for the accounts API. Calls the route functions directly against
a temp DB — no httpx/TestClient dependency needed for this. Run:
python tests/test_accounts.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.accounts import AccountCreate, AccountUpdate, create_account, get_account_balance, list_accounts, update_account
from app.db import get_connection, run_migrations
from app.seed import run_seed

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def _seeded_conn(tmp: Path):
    conn = get_connection(tmp / "test.db")
    run_migrations(conn, MIGRATIONS_DIR)
    run_seed(conn)
    return conn


def test_opening_balance_seeds_exactly_one_ledger_entry():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))

        account = create_account(
            AccountCreate(name="SBI", account_type="savings", opening_balance_paise=920000),
            conn,
        )

        ledger_rows = conn.execute(
            "SELECT * FROM ledger WHERE account_id = ?", (account["id"],)
        ).fetchall()
        assert len(ledger_rows) == 1
        assert ledger_rows[0]["entry_type"] == "opening_balance"

        balance = get_account_balance(account["id"], conn)
        assert balance["balance_paise"] == 920000

        conn.close()


def test_list_excludes_nothing_soft_deleted_yet_and_includes_created():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        create_account(AccountCreate(name="SBI", account_type="savings"), conn)

        accounts = list_accounts(conn)
        names = {a["name"] for a in accounts}
        assert "Cash Drawer" in names  # from seed
        assert "SBI" in names

        conn.close()


def test_update_deactivates_account():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        account = create_account(AccountCreate(name="SBI", account_type="savings"), conn)

        updated = update_account(account["id"], AccountUpdate(is_active=False), conn)
        assert updated["is_active"] == 0

        conn.close()


if __name__ == "__main__":
    test_opening_balance_seeds_exactly_one_ledger_entry()
    test_list_excludes_nothing_soft_deleted_yet_and_includes_created()
    test_update_deactivates_account()
    print("OK")
