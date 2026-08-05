"""Self-check for daily closing (PLAN 6.4/6.5): the close-day snapshot and
the live closing report. Run: python tests/test_closing.py"""
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import HTTPException

from app.accounts import AccountCreate, create_account
from app.closing import CloseDayRequest, close_day, get_day_report, get_day_status
from app.db import get_connection, run_migrations
from app.expenses import ExpenseCreate, create_expense
from app.seed import run_seed
from app.transfers import TransferCreate, create_transfer

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def _seeded_conn(tmp: Path):
    conn = get_connection(tmp / "test.db")
    run_migrations(conn, MIGRATIONS_DIR)
    run_seed(conn)
    return conn


def _fund_cash(conn, cash_id, amount_paise, business_date):
    """Get money into the Cash Drawer (opening_balance_paise only seeds at
    creation time) via a transfer from a funded settlement account."""
    sbi = create_account(AccountCreate(name="SBI", account_type="settlement", opening_balance_paise=amount_paise), conn)
    create_transfer(TransferCreate(business_date=business_date, from_account_id=sbi["id"], to_account_id=cash_id, amount_paise=amount_paise), conn)
    return sbi["id"]


def test_untouched_date_reads_as_open():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        status = get_day_status("2024-10-01", conn)
        assert status["status"] == "open"
        assert status["closed_at"] is None
        conn.close()


def test_close_with_no_variance_needs_no_remarks():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        _fund_cash(conn, cash_id, 500000, "2024-10-05")

        result = close_day("2024-10-05", CloseDayRequest(physical_cash_paise=500000), conn)
        assert result["status"] == "closed"
        assert result["cash_variance_paise"] == 0

        status = get_day_status("2024-10-05", conn)
        assert status["status"] == "closed"
        conn.close()


def test_close_with_variance_requires_remarks():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        _fund_cash(conn, cash_id, 500000, "2024-10-06")

        try:
            close_day("2024-10-06", CloseDayRequest(physical_cash_paise=499000), conn)
            assert False, "a variance without remarks must be rejected"
        except Exception as e:
            assert "400" in str(e)

        # the failed attempt posted no adjustment and didn't close the day
        status = get_day_status("2024-10-06", conn)
        assert status["status"] == "open"

        result = close_day("2024-10-06", CloseDayRequest(physical_cash_paise=499000, remarks="counted short"), conn)
        assert result["status"] == "closed"
        assert result["cash_variance_paise"] == -1000
        conn.close()


def test_double_close_is_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        _fund_cash(conn, cash_id, 100000, "2024-10-07")
        close_day("2024-10-07", CloseDayRequest(physical_cash_paise=100000), conn)

        try:
            close_day("2024-10-07", CloseDayRequest(physical_cash_paise=100000), conn)
            assert False, "closing an already-closed day must be rejected"
        except Exception as e:
            assert "409" in str(e)
        conn.close()


def test_snapshot_matches_derived_balances_exactly():
    """PLAN 6.4's own verify line, checked against an independent raw query
    rather than reusing closing_balance() (which would be a tautology)."""
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        sbi_id = _fund_cash(conn, cash_id, 800000, "2024-10-10")
        create_expense(ExpenseCreate(business_date="2024-10-10", category="Rent", amount_paise=50000, account_id=cash_id), conn)

        close_day("2024-10-10", CloseDayRequest(physical_cash_paise=750000), conn)

        for account_id in (cash_id, sbi_id):
            snapshot = conn.execute(
                "SELECT * FROM daily_account_balance WHERE business_date = ? AND account_id = ?",
                ("2024-10-10", account_id),
            ).fetchone()
            direct = conn.execute(
                "SELECT SUM(amount_paise) FROM ledger WHERE account_id = ? AND business_date <= ?",
                (account_id, "2024-10-10"),
            ).fetchone()[0] or 0
            assert snapshot["closing_paise"] == direct, f"account {account_id}: snapshot {snapshot['closing_paise']} != derived {direct}"
            # PRD §6 formula reconciles too, not just the direct figure
            reconciled = (
                snapshot["opening_paise"] + snapshot["received_paise"] - snapshot["paid_paise"]
                + snapshot["transfer_in_paise"] - snapshot["transfer_out_paise"] + snapshot["adjustment_paise"]
            )
            assert reconciled == snapshot["closing_paise"]
        conn.close()


def test_report_reconciles_with_the_ledger_before_and_after_close():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        sbi_id = _fund_cash(conn, cash_id, 300000, "2024-10-12")
        create_expense(ExpenseCreate(business_date="2024-10-12", category="Ink", amount_paise=10000, account_id=cash_id), conn)

        # report on an OPEN day: still a live derivation, not blocked
        report = get_day_report("2024-10-12", conn)
        assert report["status"] == "open"
        cash_row = next(a for a in report["accounts"] if a["account_id"] == cash_id)
        direct = conn.execute(
            "SELECT SUM(amount_paise) FROM ledger WHERE account_id = ? AND business_date <= ?",
            (cash_id, "2024-10-12"),
        ).fetchone()[0] or 0
        assert cash_row["closing_paise"] == direct == 290000
        assert cash_row["transfer_in_paise"] == 300000  # _fund_cash moves money via a transfer, not income
        assert cash_row["paid_paise"] == 10000

        close_day("2024-10-12", CloseDayRequest(physical_cash_paise=290000), conn)
        report_after = get_day_report("2024-10-12", conn)
        assert report_after["status"] == "closed"
        cash_row_after = next(a for a in report_after["accounts"] if a["account_id"] == cash_id)
        assert cash_row_after["closing_paise"] == 290000
        conn.close()


def test_opening_balance_for_the_next_day_equals_this_days_closing():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        _fund_cash(conn, cash_id, 400000, "2024-10-15")
        close_day("2024-10-15", CloseDayRequest(physical_cash_paise=400000), conn)

        from app.ledger import opening_balance
        assert opening_balance(conn, cash_id, "2024-10-16") == 400000
        conn.close()


def test_negative_physical_cash_rejected_at_pydantic_boundary():
    # H.32: physical_cash_paise used to be bare int | None — a negative count
    # (a drawer can't physically hold negative cash) returned 201 and posted
    # a real negative adjustment entry onto a now-sealed day.
    try:
        CloseDayRequest(physical_cash_paise=-100000, remarks="neg")
        assert False, "a negative physical_cash_paise must be rejected"
    except Exception as e:
        assert "ValidationError" in type(e).__name__


def test_overflowing_physical_cash_rejected_at_pydantic_boundary():
    # H.32: an out-of-int64-range count used to reach the variance
    # computation and 500 on insert instead of being rejected up front.
    try:
        CloseDayRequest(physical_cash_paise=10**19, remarks="huge")
        assert False, "an overflowing physical_cash_paise must be rejected"
    except Exception as e:
        assert "ValidationError" in type(e).__name__


def test_genuine_non_negative_count_still_closes_normally():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        _fund_cash(conn, cash_id, 300000, "2024-10-17")

        result = close_day("2024-10-17", CloseDayRequest(physical_cash_paise=300000), conn)
        assert result["status"] == "closed"
        assert result["cash_variance_paise"] == 0
        conn.close()


def test_closing_a_future_date_rejected():
    # H.35: close_day auto-opens an untouched date and seals it in the same
    # call, with no reopen path — a fat-fingered future year used to lock
    # that date permanently.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        future = (date.today() + timedelta(days=1)).isoformat()
        try:
            close_day(future, CloseDayRequest(physical_cash_paise=0), conn)
            assert False, "closing a future business_date must be rejected"
        except HTTPException as e:
            assert e.status_code == 400, e.status_code
        conn.close()


def test_closing_todays_date_still_succeeds():
    # H.35 regression guard: the future-date check must not catch today.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        today = date.today().isoformat()
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        _fund_cash(conn, cash_id, 100000, today)
        result = close_day(today, CloseDayRequest(physical_cash_paise=100000), conn)
        assert result["status"] == "closed"
        conn.close()


if __name__ == "__main__":
    test_untouched_date_reads_as_open()
    test_close_with_no_variance_needs_no_remarks()
    test_close_with_variance_requires_remarks()
    test_double_close_is_rejected()
    test_snapshot_matches_derived_balances_exactly()
    test_report_reconciles_with_the_ledger_before_and_after_close()
    test_opening_balance_for_the_next_day_equals_this_days_closing()
    test_negative_physical_cash_rejected_at_pydantic_boundary()
    test_overflowing_physical_cash_rejected_at_pydantic_boundary()
    test_genuine_non_negative_count_still_closes_normally()
    test_closing_a_future_date_rejected()
    test_closing_todays_date_still_succeeds()
    print("OK")
