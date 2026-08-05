"""Self-check for the audit log read API (PLAN 8.4). Calls the route
function directly against a temp DB. Run: python tests/test_audit_api.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.accounts import AccountCreate, create_account
from app.audit import MAX_LIST_LIMIT, list_audit_logs
from app.db import get_connection, run_migrations
from app.expenses import ExpenseCreate, create_expense, delete_expense
from app.seed import run_seed

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def _seeded_conn(tmp: Path):
    conn = get_connection(tmp / "test.db")
    run_migrations(conn, MIGRATIONS_DIR)
    run_seed(conn)
    return conn


def _populate(conn):
    account = create_account(AccountCreate(name="SBI", account_type="savings", opening_balance_paise=100000), conn)
    expense = create_expense(
        ExpenseCreate(business_date="2026-08-05", category="Rent", amount_paise=5000, account_id=account["id"]), conn
    )
    delete_expense(expense["id"], conn)
    return account, expense


def test_viewer_shows_the_row_written_by_a_mutation():
    """PLAN 8.4's own verify line: the viewer shows the row 8.3 wrote."""
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        account, expense = _populate(conn)

        result = list_audit_logs(table_name="expenses", conn=conn)
        assert [r["action"] for r in result["items"]] == ["delete", "create"]  # newest first
        assert result["total"] == 2
        conn.close()


def test_filters_narrow_results():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        account, expense = _populate(conn)

        by_table = list_audit_logs(table_name="accounts", conn=conn)
        assert all(r["table_name"] == "accounts" for r in by_table["items"])
        assert by_table["total"] == 1

        by_action = list_audit_logs(action="delete", conn=conn)
        assert all(r["action"] == "delete" for r in by_action["items"])
        assert by_action["total"] == 1

        admin_id = conn.execute("SELECT id FROM users WHERE username = 'admin'").fetchone()[0]
        by_user = list_audit_logs(user_id=admin_id, conn=conn)
        assert by_user["total"] == 3  # account create + expense create + expense delete

        # audit_logs.created_at is a real timestamp (datetime('now')), not the
        # expense's business_date — filter on today's actual date, not a
        # hardcoded one, so this doesn't rot the day this test stops running
        # on 2026-08-05.
        today = conn.execute("SELECT date('now')").fetchone()[0]
        by_date = list_audit_logs(business_date=today, conn=conn)
        assert by_date["total"] == 3

        conn.close()


def test_date_filter_excludes_other_days():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        _populate(conn)

        assert list_audit_logs(business_date="2000-01-01", conn=conn)["total"] == 0

        conn.close()


def test_username_is_joined_in():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        _populate(conn)

        result = list_audit_logs(table_name="accounts", conn=conn)
        assert result["items"][0]["username"] == "admin"
        conn.close()


def test_limit_and_offset_are_clamped():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        _populate(conn)

        assert list_audit_logs(limit=-1, conn=conn)["limit"] == MAX_LIST_LIMIT
        assert list_audit_logs(limit=10_000_000, conn=conn)["limit"] == MAX_LIST_LIMIT
        assert list_audit_logs(limit=1000, offset=-5, conn=conn)["offset"] == 0
        conn.close()


if __name__ == "__main__":
    test_viewer_shows_the_row_written_by_a_mutation()
    test_filters_narrow_results()
    test_date_filter_excludes_other_days()
    test_username_is_joined_in()
    test_limit_and_offset_are_clamped()
    print("OK")
