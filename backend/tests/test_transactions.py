"""Self-check for the transactions create API. Calls the route function
directly against a temp DB. Run: python tests/test_transactions.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import HTTPException

from app.accounts import AccountCreate, AccountUpdate, create_account, update_account
from app.db import get_connection, run_migrations
from app.ledger import account_balance
from app.seed import run_seed
from app.services import ServiceCreate, ServiceUpdate, create_service, update_service
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


def test_malformed_business_date_rejected_when_unpaid():
    # H.13: insert_entry is skipped entirely for an unpaid bill (the normal
    # bill-on-credit case), so this must be checked at the transaction write
    # path too, not only inside the ledger.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)

        for bad_date in ("not-a-date", "2026-13-45", "", "  ", "04-08-2026", "0000-00-00", "2026-08-04T00:00:00"):
            try:
                create_transaction(
                    TransactionCreate(business_date=bad_date, service_id=service_id,
                                       fee_paise=150, account_id=cash_id),
                    conn,
                )
                assert False, f"business_date {bad_date!r} must be rejected"
            except HTTPException as e:
                assert e.status_code == 400, f"expected 400 for {bad_date!r}, got {e.status_code}"

        assert conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0] == 0

        conn.close()


def test_amount_paid_exceeding_total_rejected_at_create():
    # H.12: the frontend already blocks this — the server must too, since
    # that's the side that can be bypassed.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)

        try:
            create_transaction(
                TransactionCreate(business_date="2026-08-04", service_id=service_id,
                                   fee_paise=10000, account_id=cash_id, amount_paid_paise=500000),
                conn,
            )
            assert False, "amount_paid_paise exceeding the total must be rejected"
        except HTTPException as e:
            assert e.status_code == 400

        assert conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0] == 0

        # the same bill within the total still goes through
        txn = create_transaction(
            TransactionCreate(business_date="2026-08-04", service_id=service_id,
                               fee_paise=10000, account_id=cash_id, amount_paid_paise=10000),
            conn,
        )
        assert txn["status"] == "completed"

        conn.close()


def test_deactivated_account_rejected_at_create():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)
        sbi = create_account(AccountCreate(name="SBI", account_type="savings"), conn)
        update_account(sbi["id"], AccountUpdate(is_active=False), conn)

        try:
            create_transaction(
                TransactionCreate(business_date="2026-08-04", service_id=service_id,
                                   fee_paise=100, account_id=sbi["id"]),
                conn,
            )
            assert False, "a transaction against a deactivated account must be rejected"
        except HTTPException as e:
            assert e.status_code == 400

        conn.close()


def test_negative_fee_rejected_at_pydantic_boundary():
    # H.16: fee_paise used to be ge=_INT64_MIN, so money could flow backwards
    # through a service bill. This is a field-level rejection (422), not the
    # total-level one below (400).
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)

        try:
            TransactionCreate(business_date="2026-08-04", service_id=service_id,
                               fee_paise=-50000, account_id=cash_id)
            assert False, "a negative fee_paise must be rejected"
        except Exception as e:
            assert "ValidationError" in type(e).__name__

        conn.close()


def test_discount_exceeding_fee_rejected():
    # H.16: a discount larger than the fee drove total_paise negative.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)

        try:
            create_transaction(
                TransactionCreate(business_date="2026-08-04", service_id=service_id,
                                   fee_paise=10000, discount_paise=50000, account_id=cash_id),
                conn,
            )
            assert False, "a discount exceeding the fee must be rejected"
        except HTTPException as e:
            assert e.status_code == 400

        assert conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0] == 0

        conn.close()


def test_zero_total_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)

        try:
            create_transaction(
                TransactionCreate(business_date="2026-08-04", service_id=service_id,
                                   fee_paise=0, account_id=cash_id),
                conn,
            )
            assert False, "a zero total must be rejected"
        except HTTPException as e:
            assert e.status_code == 400

        conn.close()


def test_fee_and_discount_equal_with_nonzero_charge_still_succeeds():
    # H.16: only the total is checked, not the individual fields — a fee
    # fully offset by discount is fine as long as the charge carries a
    # positive total.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)

        txn = create_transaction(
            TransactionCreate(business_date="2026-08-04", service_id=service_id,
                               fee_paise=10000, discount_paise=10000, charge_paise=500,
                               account_id=cash_id),
            conn,
        )
        assert txn["total_paise"] == 500

        conn.close()


def test_total_overflow_rejected_with_400_not_500():
    # H.17: fee_paise and charge_paise are each bounded at the pydantic
    # boundary, but their sum escapes into SQLite's int64 range and used to
    # 500. Both fields are still individually legal (2**62 < 2**63 - 1).
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)

        try:
            create_transaction(
                TransactionCreate(business_date="2026-08-04", service_id=service_id,
                                   fee_paise=2**62, charge_paise=2**62, account_id=cash_id),
                conn,
            )
            assert False, "an overflowing total must be rejected"
        except HTTPException as e:
            assert e.status_code == 400
            assert e.detail

        conn.close()


def test_deactivated_service_rejected_at_create():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)
        update_service(service_id, ServiceUpdate(is_active=False), conn)

        try:
            create_transaction(
                TransactionCreate(business_date="2026-08-04", service_id=service_id,
                                   fee_paise=100, account_id=cash_id),
                conn,
            )
            assert False, "a transaction against a deactivated service must be rejected"
        except HTTPException as e:
            assert e.status_code == 400

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
    test_malformed_business_date_rejected_when_unpaid()
    test_amount_paid_exceeding_total_rejected_at_create()
    test_negative_fee_rejected_at_pydantic_boundary()
    test_discount_exceeding_fee_rejected()
    test_zero_total_rejected()
    test_fee_and_discount_equal_with_nonzero_charge_still_succeeds()
    test_total_overflow_rejected_with_400_not_500()
    test_deactivated_account_rejected_at_create()
    test_deactivated_service_rejected_at_create()
    print("OK")
