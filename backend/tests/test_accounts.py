"""Self-check for the accounts API. Calls the route functions directly against
a temp DB — no httpx/TestClient dependency needed for this. Run:
python tests/test_accounts.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import HTTPException
from pydantic import ValidationError

from app.accounts import AccountCreate, AccountUpdate, create_account, get_account, get_account_balance, list_accounts, update_account
from app.db import get_connection, run_migrations
from app.seed import run_seed, seed_admin_user

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def _seeded_conn(tmp: Path):
    conn = get_connection(tmp / "test.db")
    run_migrations(conn, MIGRATIONS_DIR)
    run_seed(conn)
    seed_admin_user(conn)
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


def test_null_and_blank_name_rejected():
    # H.4: explicit null / whitespace-only must not reach the DB as a NOT NULL violation.
    for bad_name in (None, "   "):
        try:
            AccountCreate(name=bad_name, account_type="savings")
            assert False, f"name={bad_name!r} must be rejected on create"
        except ValidationError:
            pass
        try:
            AccountUpdate(name=bad_name)
            assert False, f"name={bad_name!r} must be rejected on update"
        except ValidationError:
            pass

    # omitting name on update (partial PATCH) must still work
    assert AccountUpdate().model_dump(exclude_unset=True) == {}


def test_null_account_type_and_is_active_rejected_on_update():
    # H.4: same NOT NULL trap for the other optional-but-required Update fields.
    try:
        AccountUpdate(account_type=None)
        assert False, "account_type=None must be rejected"
    except ValidationError:
        pass
    try:
        AccountUpdate(is_active=None)
        assert False, "is_active=None must be rejected"
    except ValidationError:
        pass


def test_opening_balance_overflow_rejected():
    # H.4: a value beyond SQLite's INTEGER range used to reach conn.execute()
    # and raise an uncaught OverflowError (500) instead of a clean 400/422.
    try:
        AccountCreate(name="SBI", account_type="savings", opening_balance_paise=10**19)
        assert False, "opening_balance_paise beyond int64 range must be rejected"
    except ValidationError:
        pass


def test_out_of_range_account_id_returns_404_not_500():
    # H.34: an id outside SQLite's 64-bit range used to raise an uncaught
    # OverflowError from _get_or_404, shared by every account-resolving route.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        for account_id in (99999999999999999999, -99999999999999999999):
            try:
                get_account(account_id, conn)
                assert False, f"expected 404 for out-of-range id {account_id}"
            except HTTPException as e:
                assert e.status_code == 404, e.status_code
        conn.close()


if __name__ == "__main__":
    test_opening_balance_seeds_exactly_one_ledger_entry()
    test_list_excludes_nothing_soft_deleted_yet_and_includes_created()
    test_update_deactivates_account()
    test_null_and_blank_name_rejected()
    test_null_account_type_and_is_active_rejected_on_update()
    test_opening_balance_overflow_rejected()
    test_out_of_range_account_id_returns_404_not_500()
    print("OK")
