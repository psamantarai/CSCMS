"""Self-check for the ledger read API. Calls the route function directly
against a temp DB. Run: python tests/test_ledger_api.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import get_connection, run_migrations
from app.ledger import MAX_LEDGER_LIMIT, insert_entry, list_ledger
from app.seed import run_seed, seed_admin_user

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def _seeded_conn(tmp: Path):
    conn = get_connection(tmp / "test.db")
    run_migrations(conn, MIGRATIONS_DIR)
    run_seed(conn)
    seed_admin_user(conn)
    return conn


def _populate(conn):
    user_id = conn.execute("SELECT id FROM users WHERE username = 'admin'").fetchone()[0]
    cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
    sbi_id = conn.execute(
        "INSERT INTO accounts (name, account_type) VALUES ('SBI', 'savings') RETURNING id"
    ).fetchone()[0]
    insert_entry(conn, business_date="2026-08-01", account_id=cash_id, amount_paise=1000,
                 entry_type="opening_balance", source_type="account", created_by=user_id)
    insert_entry(conn, business_date="2026-08-02", account_id=cash_id, amount_paise=-300,
                 entry_type="expense", source_type="expense", created_by=user_id)
    insert_entry(conn, business_date="2026-08-02", account_id=sbi_id, amount_paise=500,
                 entry_type="opening_balance", source_type="account", created_by=user_id)
    conn.commit()
    return cash_id, sbi_id


def test_unfiltered_sum_matches_direct_sum():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        _populate(conn)

        result = list_ledger(limit=1000, conn=conn)
        direct_sum = conn.execute("SELECT SUM(amount_paise) FROM ledger").fetchone()[0]

        assert sum(r["amount_paise"] for r in result["items"]) == direct_sum
        assert result["total"] == len(result["items"])

        conn.close()


def test_filters_narrow_results():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, sbi_id = _populate(conn)

        by_account = list_ledger(account_id=cash_id, limit=1000, conn=conn)
        assert all(r["account_id"] == cash_id for r in by_account["items"])
        assert by_account["total"] == 2

        by_date = list_ledger(business_date="2026-08-02", limit=1000, conn=conn)
        assert all(r["business_date"] == "2026-08-02" for r in by_date["items"])
        assert by_date["total"] == 2

        by_type = list_ledger(entry_type="expense", limit=1000, conn=conn)
        assert all(r["entry_type"] == "expense" for r in by_type["items"])
        assert by_type["total"] == 1

        conn.close()


def test_running_balance_accumulates_per_account():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, _ = _populate(conn)

        result = list_ledger(account_id=cash_id, limit=1000, conn=conn)
        balances = [r["running_balance"] for r in result["items"]]
        assert balances == [1000, 700]

        conn.close()


def test_pagination_limits_page_size():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        _populate(conn)

        page = list_ledger(limit=1, offset=0, conn=conn)
        assert len(page["items"]) == 1
        assert page["total"] == 3  # total reflects the full filtered set, not just the page

        conn.close()


def test_filtered_running_balance_continues_from_prior_balance():
    """H.6: a date filter must not restart the window function mid-history."""
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, _ = _populate(conn)

        true_balance = conn.execute(
            "SELECT SUM(amount_paise) FROM ledger WHERE account_id = ?", (cash_id,)
        ).fetchone()[0]

        filtered = list_ledger(account_id=cash_id, business_date="2026-08-02", limit=1000, conn=conn)
        assert filtered["items"][-1]["running_balance"] == true_balance

        conn.close()


def test_limit_and_offset_are_clamped():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        _populate(conn)

        assert list_ledger(limit=-1, conn=conn)["limit"] == MAX_LEDGER_LIMIT
        assert list_ledger(limit=10_000_000, conn=conn)["limit"] == MAX_LEDGER_LIMIT
        assert list_ledger(limit=1000, offset=-5, conn=conn)["offset"] == 0

        conn.close()


if __name__ == "__main__":
    test_unfiltered_sum_matches_direct_sum()
    test_filters_narrow_results()
    test_running_balance_accumulates_per_account()
    test_pagination_limits_page_size()
    test_filtered_running_balance_continues_from_prior_balance()
    test_limit_and_offset_are_clamped()
    print("OK")
