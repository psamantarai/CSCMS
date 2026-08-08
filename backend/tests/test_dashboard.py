"""Self-check for the dashboard API (PLAN 7.1): each tile reconciles
against a direct ledger/transactions query. Run: python tests/test_dashboard.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.accounts import AccountCreate, create_account
from app.closing import CloseDayRequest, close_day
from app.customers import CustomerCreate, create_customer
from app.dashboard import get_dashboard
from app.db import get_connection, run_migrations
from app.expenses import ExpenseCreate, create_expense
from app.payments import PaymentCreate, create_payment
from app.seed import run_seed, seed_admin_user
from app.services import ServiceCreate, create_service
from app.transactions import TransactionCreate, create_transaction

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def _seeded_conn(tmp: Path):
    conn = get_connection(tmp / "test.db")
    run_migrations(conn, MIGRATIONS_DIR)
    run_seed(conn)
    seed_admin_user(conn)
    return conn


def test_income_expenses_profit_reconcile_with_ledger():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        service = create_service(ServiceCreate(name="PAN Card", category="PAN", default_fee_paise=10000), conn)
        create_transaction(
            TransactionCreate(business_date="2026-09-01", service_id=service["id"],
                               fee_paise=10000, account_id=cash_id, amount_paid_paise=10000),
            conn,
        )
        create_expense(ExpenseCreate(business_date="2026-09-01", category="Paper", amount_paise=3500, account_id=cash_id), conn)

        dash = get_dashboard("2026-09-01", conn)
        direct_income = conn.execute(
            "SELECT COALESCE(SUM(amount_paise), 0) FROM ledger WHERE business_date = '2026-09-01' AND entry_type IN ('service_income', 'commission')"
        ).fetchone()[0]
        direct_expenses = -conn.execute(
            "SELECT COALESCE(SUM(amount_paise), 0) FROM ledger WHERE business_date = '2026-09-01' AND entry_type = 'expense'"
        ).fetchone()[0]
        assert dash["today_income_paise"] == direct_income == 10000
        assert dash["today_expenses_paise"] == direct_expenses == 3500
        assert dash["today_profit_paise"] == direct_income - direct_expenses == 6500
        conn.close()


def test_cash_and_bank_balances_reconcile_with_ledger():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        create_account(AccountCreate(name="SBI", account_type="settlement", opening_balance_paise=500000), conn)

        dash = get_dashboard("2026-09-01", conn)
        direct_cash = conn.execute(
            "SELECT COALESCE(SUM(l.amount_paise), 0) FROM ledger l JOIN accounts a ON a.id = l.account_id "
            "WHERE a.account_type = 'cash' AND a.deleted_at IS NULL"
        ).fetchone()[0]
        direct_bank = conn.execute(
            "SELECT COALESCE(SUM(l.amount_paise), 0) FROM ledger l JOIN accounts a ON a.id = l.account_id "
            "WHERE a.account_type != 'cash' AND a.deleted_at IS NULL"
        ).fetchone()[0]
        assert dash["cash_in_hand_paise"] == direct_cash == 0
        assert dash["total_bank_balance_paise"] == direct_bank == 500000
        conn.close()


def test_pending_credits_sums_every_customers_outstanding():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        service = create_service(ServiceCreate(name="Certificate", category="Certificates", default_fee_paise=35000), conn)
        alice = create_customer(CustomerCreate(name="Alice"), conn)
        bob = create_customer(CustomerCreate(name="Bob"), conn)
        # Alice: 350 billed, 100 paid at creation -> 250 outstanding.
        create_transaction(
            TransactionCreate(business_date="2026-09-01", customer_id=alice["id"], service_id=service["id"],
                               fee_paise=35000, account_id=cash_id, amount_paid_paise=10000),
            conn,
        )
        # Bob: 350 billed, unpaid -> 350 outstanding.
        create_transaction(
            TransactionCreate(business_date="2026-09-01", customer_id=bob["id"], service_id=service["id"],
                               fee_paise=35000, account_id=cash_id),
            conn,
        )
        # Walk-in: fully paid, no customer -> not part of anyone's credit.
        create_transaction(
            TransactionCreate(business_date="2026-09-01", service_id=service["id"],
                               fee_paise=35000, account_id=cash_id, amount_paid_paise=35000),
            conn,
        )

        dash = get_dashboard("2026-09-01", conn)
        assert dash["pending_credits_paise"] == 25000 + 35000
        conn.close()


def test_todays_customers_counts_distinct_customers_not_walkins():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        service = create_service(ServiceCreate(name="Printing", category="Printing", default_fee_paise=1000), conn)
        alice = create_customer(CustomerCreate(name="Alice"), conn)
        # Alice transacts twice today -> counted once.
        create_transaction(TransactionCreate(business_date="2026-09-01", customer_id=alice["id"], service_id=service["id"], fee_paise=1000, account_id=cash_id), conn)
        create_transaction(TransactionCreate(business_date="2026-09-01", customer_id=alice["id"], service_id=service["id"], fee_paise=1000, account_id=cash_id), conn)
        # A walk-in transacts too -> not a "customer".
        create_transaction(TransactionCreate(business_date="2026-09-01", service_id=service["id"], fee_paise=1000, account_id=cash_id), conn)

        dash = get_dashboard("2026-09-01", conn)
        assert dash["today_customers"] == 1
        conn.close()


def test_closing_status_reflects_business_days():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        assert get_dashboard("2024-09-02", conn)["closing_status"] == "open"
        close_day("2024-09-02", CloseDayRequest(), conn)
        assert get_dashboard("2024-09-02", conn)["closing_status"] == "closed"
        conn.close()


def test_future_dated_entries_do_not_move_an_earlier_dates_balances():
    # H.39: cash_in_hand_paise/total_bank_balance_paise had no business_date
    # filter at all, so a transaction dated after D still moved D's dashboard
    # figures, disagreeing with Daily Closing/Reports (business_date <= D).
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        service = create_service(ServiceCreate(name="Xerox", category="Printing", default_fee_paise=1000), conn)

        dash_before = get_dashboard("2026-09-01", conn)
        create_transaction(
            TransactionCreate(business_date="2026-09-05", service_id=service["id"],
                               fee_paise=1000, account_id=cash_id, amount_paid_paise=1000),
            conn,
        )
        dash_after = get_dashboard("2026-09-01", conn)
        assert dash_after["cash_in_hand_paise"] == dash_before["cash_in_hand_paise"]
        conn.close()


if __name__ == "__main__":
    test_income_expenses_profit_reconcile_with_ledger()
    test_cash_and_bank_balances_reconcile_with_ledger()
    test_pending_credits_sums_every_customers_outstanding()
    test_todays_customers_counts_distinct_customers_not_walkins()
    test_closing_status_reflects_business_days()
    test_future_dated_entries_do_not_move_an_earlier_dates_balances()
    print("OK")
