"""Self-check for the payments API. Calls the route function directly against
a temp DB. Run: python tests/test_payments.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import HTTPException

from app.customers import CustomerCreate, create_customer, get_customer_outstanding
from app.db import get_connection, run_migrations
from app.ledger import account_balance
from app.payments import PaymentCreate, create_payment
from app.seed import run_seed
from app.services import ServiceCreate, create_service
from app.transactions import TransactionCreate, create_transaction

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def _seeded_conn(tmp: Path):
    conn = get_connection(tmp / "test.db")
    run_migrations(conn, MIGRATIONS_DIR)
    run_seed(conn)
    return conn


def _cash_service_customer(conn, name="Ramesh"):
    cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
    service = create_service(ServiceCreate(name="PAN Card", category="PAN", default_fee_paise=10000), conn)
    customer = create_customer(CustomerCreate(name=name), conn)
    return cash_id, service["id"], customer["id"]


def test_one_payment_clears_two_separate_outstanding_bills():
    # PLAN 3.3: one 350 payment clears two separate outstanding bills correctly.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id, customer_id = _cash_service_customer(conn)

        bill1 = create_transaction(
            TransactionCreate(business_date="2026-08-01", customer_id=customer_id, service_id=service_id,
                               fee_paise=200, account_id=cash_id),
            conn,
        )
        bill2 = create_transaction(
            TransactionCreate(business_date="2026-08-02", customer_id=customer_id, service_id=service_id,
                               fee_paise=150, account_id=cash_id),
            conn,
        )
        balance_before = account_balance(conn, cash_id)

        payments = create_payment(
            PaymentCreate(business_date="2026-08-04", customer_id=customer_id, amount_paise=350, account_id=cash_id),
            conn,
        )

        assert len(payments) == 2
        assert {p["transaction_id"] for p in payments} == {bill1["id"], bill2["id"]}
        assert sum(p["amount_paise"] for p in payments) == 350

        assert conn.execute("SELECT status FROM transactions WHERE id = ?", (bill1["id"],)).fetchone()[0] == "completed"
        assert conn.execute("SELECT status FROM transactions WHERE id = ?", (bill2["id"],)).fetchone()[0] == "completed"

        assert account_balance(conn, cash_id) == balance_before + 350
        assert get_customer_outstanding(customer_id, conn)["outstanding_paise"] == 0

        conn.close()


def test_payment_smaller_than_one_bill_leaves_it_partial():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id, customer_id = _cash_service_customer(conn)

        bill = create_transaction(
            TransactionCreate(business_date="2026-08-01", customer_id=customer_id, service_id=service_id,
                               fee_paise=357, account_id=cash_id),
            conn,
        )

        payments = create_payment(
            PaymentCreate(business_date="2026-08-04", customer_id=customer_id, amount_paise=107, account_id=cash_id),
            conn,
        )
        assert len(payments) == 1
        assert payments[0]["amount_paise"] == 107

        assert conn.execute("SELECT status FROM transactions WHERE id = ?", (bill["id"],)).fetchone()[0] == "partial"
        assert get_customer_outstanding(customer_id, conn)["outstanding_paise"] == 250

        # a later payment of the remainder clears it
        create_payment(
            PaymentCreate(business_date="2026-08-05", customer_id=customer_id, amount_paise=250, account_id=cash_id),
            conn,
        )
        assert conn.execute("SELECT status FROM transactions WHERE id = ?", (bill["id"],)).fetchone()[0] == "completed"
        assert get_customer_outstanding(customer_id, conn)["outstanding_paise"] == 0

        conn.close()


def test_amount_exceeding_outstanding_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id, customer_id = _cash_service_customer(conn)

        create_transaction(
            TransactionCreate(business_date="2026-08-01", customer_id=customer_id, service_id=service_id,
                               fee_paise=100, account_id=cash_id),
            conn,
        )

        try:
            create_payment(
                PaymentCreate(business_date="2026-08-04", customer_id=customer_id, amount_paise=500, account_id=cash_id),
                conn,
            )
            assert False, "a payment exceeding outstanding must be rejected"
        except HTTPException as e:
            assert e.status_code == 400

        assert conn.execute("SELECT COUNT(*) FROM payments").fetchone()[0] == 0

        conn.close()


def test_payment_with_no_outstanding_bills_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        _, _, customer_id = _cash_service_customer(conn)
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]

        try:
            create_payment(
                PaymentCreate(business_date="2026-08-04", customer_id=customer_id, amount_paise=100, account_id=cash_id),
                conn,
            )
            assert False, "a payment against a customer with nothing outstanding must be rejected"
        except HTTPException as e:
            assert e.status_code == 400

        conn.close()


def test_creation_time_payment_reduces_outstanding_immediately():
    # Guards the 3.2 retrofit: a payment taken at transaction creation must
    # land in the payments table too, or customers.py's outstanding query
    # double-counts it as still owed.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id, customer_id = _cash_service_customer(conn)

        create_transaction(
            TransactionCreate(business_date="2026-08-01", customer_id=customer_id, service_id=service_id,
                               fee_paise=357, account_id=cash_id, amount_paid_paise=107),
            conn,
        )
        assert get_customer_outstanding(customer_id, conn)["outstanding_paise"] == 250

        conn.close()


if __name__ == "__main__":
    test_one_payment_clears_two_separate_outstanding_bills()
    test_payment_smaller_than_one_bill_leaves_it_partial()
    test_amount_exceeding_outstanding_rejected()
    test_payment_with_no_outstanding_bills_rejected()
    test_creation_time_payment_reduces_outstanding_immediately()
    print("OK")
