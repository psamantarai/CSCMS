"""Self-check for the monthly/service-wise/customer-wise reports (PLAN 7.3/
7.4): every total equals a direct SUM over ledger for the same period.
Run: python tests/test_reports.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import HTTPException

from app.customers import CustomerCreate, create_customer
from app.db import get_connection, run_migrations
from app.expenses import ExpenseCreate, create_expense
from app.payments import PaymentCreate, create_payment
from app.reports import customer_wise_report, monthly_report, service_wise_report
from app.seed import run_seed
from app.services import ServiceCreate, create_service
from app.transactions import TransactionCreate, create_transaction

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def _seeded_conn(tmp: Path):
    conn = get_connection(tmp / "test.db")
    run_migrations(conn, MIGRATIONS_DIR)
    run_seed(conn)
    return conn


def test_monthly_report_reconciles_with_ledger():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        service = create_service(ServiceCreate(name="PAN Card", category="PAN", default_fee_paise=10000), conn)
        create_transaction(
            TransactionCreate(business_date="2026-09-15", service_id=service["id"], fee_paise=10000, account_id=cash_id, amount_paid_paise=10000),
            conn,
        )
        create_expense(ExpenseCreate(business_date="2026-09-20", category="Rent", amount_paise=4000, account_id=cash_id), conn)
        # Outside the month -- must not leak in.
        create_transaction(
            TransactionCreate(business_date="2026-10-01", service_id=service["id"], fee_paise=99900, account_id=cash_id, amount_paid_paise=99900),
            conn,
        )

        report = monthly_report(2026, 9, conn)
        assert report["start_date"] == "2026-09-01"
        assert report["end_date"] == "2026-09-30"
        direct_income = conn.execute(
            "SELECT COALESCE(SUM(amount_paise), 0) FROM ledger WHERE business_date BETWEEN '2026-09-01' AND '2026-09-30' AND entry_type IN ('service_income', 'commission')"
        ).fetchone()[0]
        direct_expenses = -conn.execute(
            "SELECT COALESCE(SUM(amount_paise), 0) FROM ledger WHERE business_date BETWEEN '2026-09-01' AND '2026-09-30' AND entry_type = 'expense'"
        ).fetchone()[0]
        assert report["income_paise"] == direct_income == 10000
        assert report["expenses_paise"] == direct_expenses == 4000
        assert report["profit_paise"] == direct_income - direct_expenses
        conn.close()


def test_monthly_report_rejects_bad_month():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        try:
            monthly_report(2026, 13, conn)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 400
        conn.close()


def test_service_wise_report_reconciles_with_ledger():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        pan = create_service(ServiceCreate(name="PAN Card", category="PAN", default_fee_paise=10000), conn)
        printing = create_service(ServiceCreate(name="Printing", category="Printing", default_fee_paise=500), conn)
        create_transaction(TransactionCreate(business_date="2026-09-01", service_id=pan["id"], fee_paise=10000, account_id=cash_id, amount_paid_paise=10000), conn)
        create_transaction(TransactionCreate(business_date="2026-09-02", service_id=pan["id"], fee_paise=10000, account_id=cash_id, amount_paid_paise=5000), conn)
        create_transaction(TransactionCreate(business_date="2026-09-02", service_id=printing["id"], fee_paise=500, account_id=cash_id, amount_paid_paise=500), conn)

        rows = {r["service_id"]: r for r in service_wise_report(conn=conn)}
        direct_pan_income = conn.execute(
            "SELECT COALESCE(SUM(l.amount_paise), 0) FROM ledger l JOIN transactions t ON t.id = l.source_id "
            "WHERE l.source_type = 'transaction' AND t.service_id = ?", (pan["id"],)
        ).fetchone()[0]
        assert rows[pan["id"]]["transaction_count"] == 2
        assert rows[pan["id"]]["billed_paise"] == 20000
        assert rows[pan["id"]]["income_paise"] == direct_pan_income == 15000
        assert rows[printing["id"]]["income_paise"] == 500

        # Date filter narrows both billed and income to the one txn on the 2nd.
        narrowed = {r["service_id"]: r for r in service_wise_report(start_date="2026-09-02", end_date="2026-09-02", conn=conn)}
        assert narrowed[pan["id"]]["transaction_count"] == 1
        assert narrowed[pan["id"]]["income_paise"] == 5000
        conn.close()


def test_customer_wise_report_includes_later_settlement():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        service = create_service(ServiceCreate(name="Certificate", category="Certificates", default_fee_paise=35000), conn)
        alice = create_customer(CustomerCreate(name="Alice"), conn)
        create_transaction(
            TransactionCreate(business_date="2026-09-01", customer_id=alice["id"], service_id=service["id"], fee_paise=35000, account_id=cash_id, amount_paid_paise=10700),
            conn,
        )
        create_payment(PaymentCreate(business_date="2026-09-10", customer_id=alice["id"], amount_paise=24300, account_id=cash_id), conn)

        rows = {r["customer_id"]: r for r in customer_wise_report(conn=conn)}
        direct_collected = conn.execute(
            "SELECT COALESCE(SUM(amount_paise), 0) FROM ledger WHERE entry_type IN ('service_income', 'customer_payment')"
        ).fetchone()[0]
        assert rows[alice["id"]]["billed_paise"] == 35000
        assert rows[alice["id"]]["collected_paise"] == direct_collected == 35000

        # A date range excluding the settlement only picks up the creation-time payment.
        narrowed = {r["customer_id"]: r for r in customer_wise_report(start_date="2026-09-01", end_date="2026-09-01", conn=conn)}
        assert narrowed[alice["id"]]["collected_paise"] == 10700
        conn.close()


if __name__ == "__main__":
    test_monthly_report_reconciles_with_ledger()
    test_monthly_report_rejects_bad_month()
    test_service_wise_report_reconciles_with_ledger()
    test_customer_wise_report_includes_later_settlement()
    print("OK")
