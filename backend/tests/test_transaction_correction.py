"""Self-check for transaction correction (PLAN 3.6). Calls the route function
directly against a temp DB. Run: python tests/test_transaction_correction.py"""
import sys
import tempfile
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import HTTPException

from app.accounts import AccountCreate, AccountUpdate, create_account, update_account
from app.customers import CustomerCreate, create_customer
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


def test_customer_bill_correction_does_not_touch_ledger():
    # H.14: a customer's creation-time entry is only ever the amount
    # collected then — later settlement runs through app/payments.py and
    # posts its own rows, so a fee/charge/discount correction leaves it
    # alone (unlike a walk-in, see test_walk_in_full_payment_correction_*).
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)
        customer = create_customer(CustomerCreate(name="Ramesh"), conn)

        txn = create_transaction(
            TransactionCreate(business_date="2026-08-04", customer_id=customer["id"], service_id=service_id,
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


def test_walk_in_full_payment_correction_resyncs_the_live_ledger_entry():
    # H.14: a walk-in has no other settlement path (payments.customer_id is
    # NOT NULL), so a bill correction that already covered the old total in
    # full is resynced to the corrected total instead of stranding the
    # transaction as an unsettleable partial.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)

        txn = create_transaction(
            TransactionCreate(business_date="2026-08-04", service_id=service_id,
                               fee_paise=150, account_id=cash_id, amount_paid_paise=150),
            conn,
        )
        cash_before = account_balance(conn, cash_id)

        corrected = correct_transaction(txn["id"], TransactionCorrection(fee_paise=250), conn)
        assert corrected["total_paise"] == 250
        assert corrected["status"] == "completed"
        assert account_balance(conn, cash_id) == cash_before + 100

        rows = conn.execute(
            "SELECT * FROM ledger WHERE source_type = 'transaction' AND source_id = ? ORDER BY id",
            (txn["id"],),
        ).fetchall()
        assert len(rows) == 3
        assert rows[0]["amount_paise"] == 150
        assert rows[1]["entry_type"] == "reversal" and rows[1]["reverses_id"] == rows[0]["id"]
        assert rows[2]["entry_type"] == "service_income" and rows[2]["amount_paise"] == 250

        # correcting again (even downward) keeps status completed and the
        # ledger in sync — never status='completed' with a stale ledger total.
        corrected = correct_transaction(txn["id"], TransactionCorrection(fee_paise=50), conn)
        assert corrected["total_paise"] == 50
        assert corrected["status"] == "completed"
        assert account_balance(conn, cash_id) == cash_before - 100

        conn.close()


def test_business_date_correction_moves_the_live_ledger_entry():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)

        txn = create_transaction(
            TransactionCreate(business_date="2026-08-04", service_id=service_id,
                               fee_paise=150, account_id=cash_id, amount_paid_paise=150),
            conn,
        )

        corrected = correct_transaction(txn["id"], TransactionCorrection(business_date="2026-07-01"), conn)
        assert corrected["business_date"] == "2026-07-01"

        live = conn.execute(
            "SELECT * FROM ledger WHERE source_type = 'transaction' AND source_id = ? "
            "AND entry_type = 'service_income' AND id NOT IN "
            "(SELECT reverses_id FROM ledger WHERE reverses_id IS NOT NULL)",
            (txn["id"],),
        ).fetchone()
        assert live["business_date"] == "2026-07-01"
        assert live["amount_paise"] == 150

        conn.close()


def test_malformed_business_date_rejected_on_correction():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)

        txn = create_transaction(
            TransactionCreate(business_date="2026-08-04", service_id=service_id,
                               fee_paise=150, account_id=cash_id),
            conn,
        )

        try:
            correct_transaction(txn["id"], TransactionCorrection(business_date="not-a-date"), conn)
            assert False, "a malformed business_date must be rejected"
        except HTTPException as e:
            assert e.status_code == 400

        assert conn.execute(
            "SELECT business_date FROM transactions WHERE id = ?", (txn["id"],)
        ).fetchone()[0] == "2026-08-04"

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


def test_correction_to_non_positive_total_rejected():
    # H.16: correction shares create's total computation, so a discount
    # correction that overtakes the fee must be rejected the same way.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)

        txn = create_transaction(
            TransactionCreate(business_date="2026-08-04", service_id=service_id,
                               fee_paise=150, account_id=cash_id),
            conn,
        )

        try:
            correct_transaction(txn["id"], TransactionCorrection(discount_paise=150), conn)
            assert False, "a correction driving the total to zero must be rejected"
        except HTTPException as e:
            assert e.status_code == 400

        unchanged = conn.execute("SELECT total_paise FROM transactions WHERE id = ?", (txn["id"],)).fetchone()
        assert unchanged["total_paise"] == 150

        conn.close()


def test_correction_to_overflowing_total_rejected():
    # H.17: same shared computation, checked on the correction path too.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)

        txn = create_transaction(
            TransactionCreate(business_date="2026-08-04", service_id=service_id,
                               fee_paise=150, account_id=cash_id),
            conn,
        )

        try:
            correct_transaction(txn["id"], TransactionCorrection(fee_paise=2**62, charge_paise=2**62), conn)
            assert False, "a correction overflowing the total must be rejected"
        except HTTPException as e:
            assert e.status_code == 400

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


def test_correction_onto_deactivated_account_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id = _cash_and_service(conn)
        sbi = create_account(AccountCreate(name="SBI", account_type="savings"), conn)
        update_account(sbi["id"], AccountUpdate(is_active=False), conn)

        txn = create_transaction(
            TransactionCreate(business_date="2026-08-04", service_id=service_id,
                               fee_paise=150, account_id=cash_id),
            conn,
        )

        try:
            correct_transaction(txn["id"], TransactionCorrection(account_id=sbi["id"]), conn)
            assert False, "correcting onto a deactivated account must be rejected"
        except HTTPException as e:
            assert e.status_code == 400

        conn.close()


def test_concurrent_account_corrections_never_double_reverse_the_same_entry():
    # H.11/H.9: without begin_write, N concurrent corrections of the same
    # transaction all read the same live entry and each reverses it — 8
    # separate reversal rows all pointing at one entry. Each thread here
    # opens its own connection, like a real concurrent request would.
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "test.db"
        setup = get_connection(db_path)
        run_migrations(setup, MIGRATIONS_DIR)
        run_seed(setup)
        cash_id, service_id = _cash_and_service(setup)
        target_accounts = [
            create_account(AccountCreate(name=f"Acc{i}", account_type="savings"), setup)["id"] for i in range(8)
        ]
        txn = create_transaction(
            TransactionCreate(business_date="2026-08-04", service_id=service_id,
                               fee_paise=60000, account_id=cash_id, amount_paid_paise=60000),
            setup,
        )
        setup.close()

        errors = []

        def correct(target_account_id):
            conn = get_connection(db_path)
            try:
                correct_transaction(txn["id"], TransactionCorrection(account_id=target_account_id), conn)
            except Exception as e:  # noqa: BLE001 — capturing to assert from the main thread
                errors.append(e)
            finally:
                conn.close()

        threads = [threading.Thread(target=correct, args=(acc,)) for acc in target_accounts]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert not errors, f"concurrent corrections raised: {errors}"

        check = get_connection(db_path)
        rows = check.execute(
            "SELECT * FROM ledger WHERE source_type = 'transaction' AND source_id = ? ORDER BY id",
            (txn["id"],),
        ).fetchall()

        reversed_ids = [r["reverses_id"] for r in rows if r["reverses_id"] is not None]
        assert len(reversed_ids) == len(set(reversed_ids)), \
            f"an entry was reversed more than once: {reversed_ids}"

        live = [r for r in rows if r["entry_type"] == "service_income" and r["id"] not in reversed_ids]
        assert len(live) == 1, f"expected exactly one live service_income row, found {len(live)}"
        assert live[0]["amount_paise"] == 60000

        check.close()


if __name__ == "__main__":
    test_account_correction_moves_the_ledger_entry_via_reversal_and_replacement()
    test_customer_bill_correction_does_not_touch_ledger()
    test_walk_in_full_payment_correction_resyncs_the_live_ledger_entry()
    test_business_date_correction_moves_the_live_ledger_entry()
    test_malformed_business_date_rejected_on_correction()
    test_correction_of_unpaid_transaction_is_a_plain_update()
    test_correction_to_non_positive_total_rejected()
    test_correction_to_overflowing_total_rejected()
    test_no_fields_is_a_no_op()
    test_unknown_transaction_rejected()
    test_explicit_null_on_not_null_field_rejected()
    test_correction_onto_deactivated_account_rejected()
    test_concurrent_account_corrections_never_double_reverse_the_same_entry()
    print("OK")
