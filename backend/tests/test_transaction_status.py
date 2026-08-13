"""Self-check for PLAN 3.4 — derived transaction status. Calls the route
functions directly against a temp DB. Run: python tests/test_transaction_status.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import HTTPException

from app.accounts import AccountCreate, create_account
from app.customers import CustomerCreate, create_customer
from app.db import get_connection, run_migrations
from app.payments import PaymentCreate, create_payment
from app.seed import run_seed, seed_admin_user
from app.services import ServiceCreate, create_service
from app.transactions import TransactionCreate, create_transaction, list_transactions

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def _seeded_conn(tmp: Path):
    conn = get_connection(tmp / "test.db")
    run_migrations(conn, MIGRATIONS_DIR)
    run_seed(conn)
    seed_admin_user(conn)
    return conn


def _cash_and_service(conn):
    cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
    service = create_service(ServiceCreate(name="PAN Card", category="PAN", default_fee_paise=10000), conn)
    return cash_id, service["id"]


def _cash_wallet_and_outlay_service(conn):
    # ServiceCreate doesn't expose has_outlay yet (that's PLAN 16.5.7) — set
    # it directly, same as test_transactions.py's pre-catalog-UI setup.
    cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
    wallet = create_account(
        AccountCreate(name="Portal Wallet", account_type="wallet", opening_balance_paise=1000000), conn
    )
    service = create_service(ServiceCreate(name="Insurance Premium", category="Insurance", default_fee_paise=5000), conn)
    conn.execute("UPDATE services SET has_outlay = 1 WHERE id = ?", (service["id"],))
    conn.commit()  # raw DML auto-begins a transaction; create_transaction's begin_write needs none open
    return cash_id, wallet["id"], service["id"]


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


def test_walk_in_outlay_paid_in_full_derives_completed():
    # PLAN 16.5.4: the receipt splits into a service_income leg and a
    # transfer recovery leg (16.5.2) — both must count toward paid_paise or
    # a fully paid outlay walk-in derives as partial.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, wallet_id, service_id = _cash_wallet_and_outlay_service(conn)

        txn = create_transaction(
            TransactionCreate(business_date="2026-08-01", service_id=service_id, fee_paise=505000,
                               account_id=cash_id, amount_paid_paise=505000,
                               outlay_paise=500000, outlay_account_id=wallet_id),
            conn,
        )
        assert txn["status"] == "completed"

        row = list_transactions(conn=conn)["items"][0]
        assert row["paid_paise"] == row["total_paise"] == 505000

        conn.close()


def test_customer_outlay_partial_payment_derives_partial():
    # A customer's paid_paise still comes from the payments table (unaffected
    # by the ledger split), so it must keep reporting the amount actually
    # taken rather than being thrown off by the outlay change.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, wallet_id, service_id = _cash_wallet_and_outlay_service(conn)
        customer = create_customer(CustomerCreate(name="Gita"), conn)

        txn = create_transaction(
            TransactionCreate(business_date="2026-08-01", customer_id=customer["id"], service_id=service_id,
                               fee_paise=505000, account_id=cash_id, amount_paid_paise=200000,
                               outlay_paise=500000, outlay_account_id=wallet_id),
            conn,
        )
        assert txn["status"] == "partial"

        row = list_transactions(conn=conn)["items"][0]
        assert row["paid_paise"] == 200000

        conn.close()


if __name__ == "__main__":
    test_status_flips_to_completed_on_final_payment_with_no_explicit_write()
    test_walk_in_full_payment_at_creation_is_completed()
    test_walk_in_partial_payment_at_creation_is_rejected()
    test_walk_in_outlay_paid_in_full_derives_completed()
    test_customer_outlay_partial_payment_derives_partial()
    print("OK")
