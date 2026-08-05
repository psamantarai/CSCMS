"""Self-check for PLAN 3.4 — derived transaction status. Calls the route
functions directly against a temp DB. Run: python tests/test_transaction_status.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import HTTPException

from app.customers import CustomerCreate, create_customer
from app.db import get_connection, run_migrations
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


def _cash_and_service(conn):
    cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
    service = create_service(ServiceCreate(name="PAN Card", category="PAN", default_fee_paise=10000), conn)
    return cash_id, service["id"]


def test_status_flips_to_completed_on_final_payment_with_no_explicit_write():
    # PLAN 3.4: status flips to completed the moment the final payment lands,
    # with no explicit status write from the caller of the payments API.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)
        customer = create_customer(CustomerCreate(name="Sita"), conn)

        txn = create_transaction(
            TransactionCreate(business_date="2026-08-01", customer_id=customer["id"], service_id=service_id,
                               fee_paise=357, account_id=cash_id, amount_paid_paise=107),
            conn,
        )
        assert txn["status"] == "partial"

        create_payment(
            PaymentCreate(business_date="2026-08-05", customer_id=customer["id"], amount_paise=250, account_id=cash_id),
            conn,
        )
        status = conn.execute("SELECT status FROM transactions WHERE id = ?", (txn["id"],)).fetchone()[0]
        assert status == "completed"

        conn.close()


def test_walk_in_full_payment_at_creation_is_completed():
    # A walk-in has no customer to attach a payments row to, so status must
    # derive from the creation-time ledger entry instead.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)

        txn = create_transaction(
            TransactionCreate(business_date="2026-08-01", service_id=service_id,
                               fee_paise=150, account_id=cash_id, amount_paid_paise=150),
            conn,
        )
        assert txn["customer_id"] is None
        assert txn["status"] == "completed"

        conn.close()


def test_walk_in_partial_payment_at_creation_is_rejected():
    # H.50: a walk-in has no customer row to carry the unpaid remainder as
    # outstanding, so a partial payment at creation is now rejected instead
    # of silently landing in "partial" status.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)

        try:
            create_transaction(
                TransactionCreate(business_date="2026-08-01", service_id=service_id,
                                   fee_paise=200, account_id=cash_id, amount_paid_paise=50),
                conn,
            )
            assert False, "a walk-in partial payment at creation must be rejected"
        except HTTPException as e:
            assert e.status_code == 400

        conn.close()


if __name__ == "__main__":
    test_status_flips_to_completed_on_final_payment_with_no_explicit_write()
    test_walk_in_full_payment_at_creation_is_completed()
    test_walk_in_partial_payment_at_creation_is_rejected()
    print("OK")
