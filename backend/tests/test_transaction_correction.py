"""Self-check for transaction correction (PLAN 3.6). Calls the route function
directly against a temp DB. Run: python tests/test_transaction_correction.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import HTTPException

from app.accounts import AccountCreate, create_account
from app.db import get_connection, run_migrations
from app.ledger import account_balance
from app.seed import run_seed
from app.services import ServiceCreate, create_service
from app.transactions import TransactionCorrection, TransactionCreate, correct_transaction, create_transaction

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


def test_account_correction_moves_the_ledger_entry_via_reversal_and_replacement():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)
        sbi_id = create_account(
            AccountCreate(name="SBI", account_type="savings"), conn
        )["id"]

        txn = create_transaction(
            TransactionCreate(business_date="2026-08-04", service_id=service_id,
                               fee_paise=150, account_id=cash_id, amount_paid_paise=150),
            conn,
        )
        cash_before = account_balance(conn, cash_id)
        sbi_before = account_balance(conn, sbi_id)

        corrected = correct_transaction(txn["id"], TransactionCorrection(account_id=sbi_id), conn)
        assert corrected["account_id"] == sbi_id

        # both the reversal and the replacement are retained — 3 rows total
        # for this transaction (original, reversal, replacement).
        rows = conn.execute(
            "SELECT * FROM ledger WHERE source_type = 'transaction' AND source_id = ? ORDER BY id",
            (txn["id"],),
        ).fetchall()
        assert len(rows) == 3
        assert rows[0]["entry_type"] == "service_income" and rows[0]["amount_paise"] == 150
        assert rows[1]["entry_type"] == "reversal" and rows[1]["reverses_id"] == rows[0]["id"]
        assert rows[2]["entry_type"] == "service_income" and rows[2]["account_id"] == sbi_id

        # balance reflects only the corrected figure: cash back to before,
        # SBI up by exactly the amount that was paid.
        assert account_balance(conn, cash_id) == cash_before - 150
        assert account_balance(conn, sbi_id) == sbi_before + 150

        conn.close()


def test_bill_correction_without_account_change_does_not_touch_ledger():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)

        txn = create_transaction(
            TransactionCreate(business_date="2026-08-04", service_id=service_id,
                               fee_paise=150, account_id=cash_id, amount_paid_paise=150),
            conn,
        )
        balance_before = account_balance(conn, cash_id)

        corrected = correct_transaction(txn["id"], TransactionCorrection(fee_paise=200), conn)
        assert corrected["total_paise"] == 200
        # status flips: 150 paid against a corrected 200 bill is now partial.
        assert corrected["status"] == "partial"
        assert account_balance(conn, cash_id) == balance_before

        count = conn.execute(
            "SELECT COUNT(*) FROM ledger WHERE source_type = 'transaction' AND source_id = ?", (txn["id"],)
        ).fetchone()[0]
        assert count == 1

        conn.close()


def test_correction_of_unpaid_transaction_is_a_plain_update():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)
        sbi_id = create_account(AccountCreate(name="SBI", account_type="savings"), conn)["id"]

        txn = create_transaction(
            TransactionCreate(business_date="2026-08-04", service_id=service_id,
                               fee_paise=150, account_id=cash_id),
            conn,
        )
        assert txn["status"] == "pending"

        corrected = correct_transaction(txn["id"], TransactionCorrection(account_id=sbi_id, fee_paise=180), conn)
        assert corrected["account_id"] == sbi_id
        assert corrected["total_paise"] == 180

        count = conn.execute(
            "SELECT COUNT(*) FROM ledger WHERE source_type = 'transaction' AND source_id = ?", (txn["id"],)
        ).fetchone()[0]
        assert count == 0

        conn.close()


def test_no_fields_is_a_no_op():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)

        txn = create_transaction(
            TransactionCreate(business_date="2026-08-04", service_id=service_id,
                               fee_paise=150, account_id=cash_id),
            conn,
        )
        result = correct_transaction(txn["id"], TransactionCorrection(), conn)
        assert result == txn

        conn.close()


def test_unknown_transaction_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        try:
            correct_transaction(999999, TransactionCorrection(fee_paise=100), conn)
            assert False, "an unknown transaction_id must be rejected"
        except HTTPException as e:
            assert e.status_code == 404
        conn.close()


def test_explicit_null_on_not_null_field_rejected():
    try:
        TransactionCorrection.model_validate({"fee_paise": None})
        assert False, "explicit null on a NOT NULL field must be rejected"
    except Exception:
        pass


if __name__ == "__main__":
    test_account_correction_moves_the_ledger_entry_via_reversal_and_replacement()
    test_bill_correction_without_account_change_does_not_touch_ledger()
    test_correction_of_unpaid_transaction_is_a_plain_update()
    test_no_fields_is_a_no_op()
    test_unknown_transaction_rejected()
    test_explicit_null_on_not_null_field_rejected()
    print("OK")
