"""Self-check for the transactions create API. Calls the route function
directly against a temp DB. Run: python tests/test_transactions.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import HTTPException

from app.db import get_connection, run_migrations
from app.ledger import account_balance
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


def test_total_computed_from_fee_charge_discount():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)

        txn = create_transaction(
            TransactionCreate(business_date="2026-08-04", service_id=service_id,
                               fee_paise=10000, charge_paise=2000, discount_paise=500,
                               account_id=cash_id),
            conn,
        )
        assert txn["total_paise"] == 11500
        assert txn["status"] == "pending"

        conn.close()


def test_client_supplied_total_is_never_trusted():
    # PLAN 3.1: no total_paise field exists on the model, so a tampered value
    # sent by the client is dropped, not used as the stored total.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)

        body = TransactionCreate.model_validate({
            "business_date": "2026-08-04", "service_id": service_id,
            "fee_paise": 100, "charge_paise": 0, "discount_paise": 0,
            "account_id": cash_id, "total_paise": 999999999,
        })
        txn = create_transaction(body, conn)
        assert txn["total_paise"] == 100

        conn.close()


def test_unknown_service_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, _ = _cash_and_service(conn)

        try:
            create_transaction(
                TransactionCreate(business_date="2026-08-04", service_id=999999,
                                   fee_paise=100, account_id=cash_id),
                conn,
            )
            assert False, "an unknown service_id must be rejected"
        except HTTPException as e:
            assert e.status_code == 404

        conn.close()


def test_unknown_account_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        _, service_id = _cash_and_service(conn)

        try:
            create_transaction(
                TransactionCreate(business_date="2026-08-04", service_id=service_id,
                                   fee_paise=100, account_id=999999),
                conn,
            )
            assert False, "an unknown account_id must be rejected"
        except HTTPException as e:
            assert e.status_code == 404

        conn.close()


def test_walk_in_customer_allowed():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)

        txn = create_transaction(
            TransactionCreate(business_date="2026-08-04", service_id=service_id,
                               fee_paise=100, account_id=cash_id),
            conn,
        )
        assert txn["customer_id"] is None

        conn.close()


def test_full_payment_raises_cash_by_exact_amount_and_completes():
    # PLAN 3.2: a 150 transaction paid in full raises cash by exactly 150 and
    # appears in the ledger — not the billed total if they ever differ.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)
        balance_before = account_balance(conn, cash_id)

        txn = create_transaction(
            TransactionCreate(business_date="2026-08-04", service_id=service_id,
                               fee_paise=150, account_id=cash_id, amount_paid_paise=150),
            conn,
        )
        assert txn["status"] == "completed"
        assert account_balance(conn, cash_id) == balance_before + 150

        entry = conn.execute(
            "SELECT * FROM ledger WHERE source_type = 'transaction' AND source_id = ?", (txn["id"],)
        ).fetchone()
        assert entry["entry_type"] == "service_income"
        assert entry["amount_paise"] == 150

        conn.close()


def test_partial_payment_posts_only_the_amount_paid():
    # PLAN 3.2: the unpaid remainder is never a ledger row.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)
        balance_before = account_balance(conn, cash_id)

        txn = create_transaction(
            TransactionCreate(business_date="2026-08-04", service_id=service_id,
                               fee_paise=357, account_id=cash_id, amount_paid_paise=107),
            conn,
        )
        assert txn["status"] == "partial"
        assert account_balance(conn, cash_id) == balance_before + 107

        conn.close()


def test_unpaid_transaction_posts_nothing_to_ledger():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)
        balance_before = account_balance(conn, cash_id)

        txn = create_transaction(
            TransactionCreate(business_date="2026-08-04", service_id=service_id,
                               fee_paise=200, account_id=cash_id),
            conn,
        )
        assert txn["status"] == "pending"
        assert account_balance(conn, cash_id) == balance_before

        count = conn.execute(
            "SELECT COUNT(*) FROM ledger WHERE source_type = 'transaction' AND source_id = ?", (txn["id"],)
        ).fetchone()[0]
        assert count == 0

        conn.close()


def test_malformed_business_date_rejected_when_paid():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)

        try:
            create_transaction(
                TransactionCreate(business_date="2026-13-45", service_id=service_id,
                                   fee_paise=150, account_id=cash_id, amount_paid_paise=150),
                conn,
            )
            assert False, "a malformed business_date must be rejected"
        except HTTPException as e:
            assert e.status_code == 400

        assert conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0] == 0

        conn.close()


if __name__ == "__main__":
    test_total_computed_from_fee_charge_discount()
    test_client_supplied_total_is_never_trusted()
    test_unknown_service_rejected()
    test_unknown_account_rejected()
    test_walk_in_customer_allowed()
    test_full_payment_raises_cash_by_exact_amount_and_completes()
    test_partial_payment_posts_only_the_amount_paid()
    test_unpaid_transaction_posts_nothing_to_ledger()
    test_malformed_business_date_rejected_when_paid()
    print("OK")
