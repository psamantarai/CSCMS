"""Self-check for the payments API. Calls the route function directly against
a temp DB. Run: python tests/test_payments.py"""
import sys
import tempfile
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import HTTPException

from app.accounts import AccountCreate, AccountUpdate, create_account, update_account
from app.customers import CustomerCreate, create_customer, get_customer_outstanding
from app.db import get_connection, run_migrations
from app.ledger import account_balance
from app.payments import PaymentCreate, create_payment
from app.reports import profit_loss_report
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


def _cash_service_customer(conn, name="Ramesh", phone="9800000040"):
    cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
    service = create_service(ServiceCreate(name="PAN Card", category="PAN", default_fee_paise=10000), conn)
    customer = create_customer(CustomerCreate(name=name, phone=phone), conn)
    return cash_id, service["id"], customer["id"]


def _cash_wallet_outlay_service_customer(conn, wallet_balance_paise=1000000):
    # ServiceCreate doesn't expose has_outlay yet (PLAN 16.5.7) — set it
    # directly, same as test_transactions.py's sibling helper.
    cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
    wallet = create_account(
        AccountCreate(name="Portal Wallet", account_type="wallet", opening_balance_paise=wallet_balance_paise), conn
    )
    service = create_service(ServiceCreate(name="Insurance Premium", category="Insurance", default_fee_paise=5000), conn)
    conn.execute("UPDATE services SET has_outlay = 1 WHERE id = ?", (service["id"],))
    conn.commit()
    customer = create_customer(CustomerCreate(name="Ramesh", phone="9800000040"), conn)
    return cash_id, wallet["id"], service["id"], customer["id"]


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


def test_payment_to_deactivated_account_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id, customer_id = _cash_service_customer(conn)
        sbi = create_account(AccountCreate(name="SBI", account_type="savings"), conn)
        update_account(sbi["id"], AccountUpdate(is_active=False), conn)

        create_transaction(
            TransactionCreate(business_date="2026-08-01", customer_id=customer_id, service_id=service_id,
                               fee_paise=100, account_id=cash_id),
            conn,
        )

        try:
            create_payment(
                PaymentCreate(business_date="2026-08-04", customer_id=customer_id, amount_paise=100,
                              account_id=sbi["id"]),
                conn,
            )
            assert False, "a payment into a deactivated account must be rejected"
        except HTTPException as e:
            assert e.status_code == 400

        conn.close()


def test_concurrent_payments_against_one_bill_only_one_succeeds():
    # H.11: a bare SELECT takes no lock at all, so without begin_write, N
    # concurrent payments against the same bill all read the same pre-state
    # outstanding balance and all pass the guard. Each thread here opens its
    # own connection, like a real concurrent request would via Depends(get_db).
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "test.db"
        setup = get_connection(db_path)
        run_migrations(setup, MIGRATIONS_DIR)
        run_seed(setup)
        seed_admin_user(setup)
        cash_id, service_id, customer_id = _cash_service_customer(setup)
        create_transaction(
            TransactionCreate(business_date="2026-08-01", customer_id=customer_id, service_id=service_id,
                               fee_paise=100000, account_id=cash_id),
            setup,
        )
        balance_before = account_balance(setup, cash_id)
        setup.close()

        results = []

        def pay():
            conn = get_connection(db_path)
            try:
                r = create_payment(
                    PaymentCreate(business_date="2026-08-04", customer_id=customer_id,
                                  amount_paise=100000, account_id=cash_id),
                    conn,
                )
                results.append(("ok", r))
            except Exception as e:  # noqa: BLE001 — capturing to assert from the main thread
                results.append(("err", e))
            finally:
                conn.close()

        threads = [threading.Thread(target=pay) for _ in range(12)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        oks = [r for kind, r in results if kind == "ok"]
        errs = [r for kind, r in results if kind == "err"]
        assert len(oks) == 1, f"expected exactly 1 success against a fully-covering bill, got {len(oks)}"
        assert len(errs) == 11
        assert all(isinstance(e, HTTPException) and e.status_code == 400 for e in errs)

        check = get_connection(db_path)
        assert check.execute("SELECT COUNT(*) FROM payments").fetchone()[0] == 1
        assert get_customer_outstanding(customer_id, check)["outstanding_paise"] == 0
        assert account_balance(check, cash_id) == balance_before + 100000
        check.close()


def test_outlay_bill_settled_later_splits_recovery_before_income():
    # PLAN 16.5.5's own Verify numbers: a ₹5,050 bill (₹5,000 outlay) created
    # wholly unpaid posts only the outlay row; settlement recovers the outlay
    # first and only the remainder ever becomes income.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, wallet_id, service_id, customer_id = _cash_wallet_outlay_service_customer(conn)

        txn = create_transaction(
            TransactionCreate(business_date="2026-08-04", customer_id=customer_id, service_id=service_id,
                               fee_paise=505000, account_id=cash_id,
                               outlay_paise=500000, outlay_account_id=wallet_id),
            conn,
        )
        assert txn["total_paise"] == 505000
        rows = conn.execute(
            "SELECT * FROM ledger WHERE source_type = 'transaction' AND source_id = ?", (txn["id"],)
        ).fetchall()
        assert len(rows) == 1
        assert rows[0]["account_id"] == wallet_id and rows[0]["amount_paise"] == -500000

        # Settling ₹2,000 recovers outlay only — no income yet.
        create_payment(
            PaymentCreate(business_date="2026-08-05", customer_id=customer_id, amount_paise=200000, account_id=cash_id),
            conn,
        )
        new_rows = conn.execute(
            "SELECT * FROM ledger WHERE source_type = 'transaction' AND source_id = ? ORDER BY id", (txn["id"],)
        ).fetchall()
        assert [(r["account_id"], r["amount_paise"], r["entry_type"]) for r in new_rows[1:]] == [
            (cash_id, 200000, "transfer"),
        ]

        # Settling the remaining ₹3,050 recovers the last ₹3,000 of outlay
        # and posts the ₹50 fee as income.
        create_payment(
            PaymentCreate(business_date="2026-08-06", customer_id=customer_id, amount_paise=305000, account_id=cash_id),
            conn,
        )
        final_rows = conn.execute(
            "SELECT * FROM ledger WHERE source_type = 'transaction' AND source_id = ? ORDER BY id", (txn["id"],)
        ).fetchall()
        assert [(r["account_id"], r["amount_paise"], r["entry_type"]) for r in final_rows[2:]] == [
            (cash_id, 300000, "transfer"),
            (cash_id, 5000, "service_income"),
        ]

        report = profit_loss_report(start_date="2026-08-04", end_date="2026-08-06", conn=conn)
        assert report["service_income_paise"] == 5000

        assert account_balance(conn, wallet_id) == 1000000 - 500000
        assert account_balance(conn, cash_id) == 200000 + 305000
        assert get_customer_outstanding(customer_id, conn)["outstanding_paise"] == 0

        conn.close()


def test_no_outlay_settlement_now_counts_as_income():
    # Deliberate behaviour change (PLAN 16.5.5): an ordinary credit sale
    # settled later used to post entry_type=customer_payment, which
    # income_expenses() ignores — ₹0 reported income forever. It now posts
    # service_income like any other receipt, closing that gap.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id, customer_id = _cash_service_customer(conn)

        create_transaction(
            TransactionCreate(business_date="2026-08-01", customer_id=customer_id, service_id=service_id,
                               fee_paise=100, account_id=cash_id),
            conn,
        )
        assert profit_loss_report(start_date="2026-08-01", end_date="2026-08-04", conn=conn)["service_income_paise"] == 0

        create_payment(
            PaymentCreate(business_date="2026-08-04", customer_id=customer_id, amount_paise=100, account_id=cash_id),
            conn,
        )
        row = conn.execute(
            "SELECT entry_type FROM ledger WHERE source_type = 'transaction' AND business_date = '2026-08-04'"
        ).fetchone()
        assert row["entry_type"] == "service_income"
        assert profit_loss_report(start_date="2026-08-01", end_date="2026-08-04", conn=conn)["service_income_paise"] == 100

        conn.close()


def test_auto_remark_fully_paid_with_username():
    # PLAN 16.6.5: settling a customer's full outstanding writes "Fully Paid
    # by <username>" on both the payments row and the ledger description.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id, customer_id = _cash_service_customer(conn)

        txn = create_transaction(
            TransactionCreate(business_date="2026-08-01", customer_id=customer_id, service_id=service_id,
                               fee_paise=100, account_id=cash_id),
            conn,
        )

        payments = create_payment(
            PaymentCreate(business_date="2026-08-04", customer_id=customer_id, amount_paise=100,
                          account_id=cash_id, username="Priya"),
            conn,
        )
        assert payments[0]["remarks"] == "Fully Paid by Priya"

        ledger_row = conn.execute(
            "SELECT description FROM ledger WHERE source_type = 'transaction' AND source_id = ? "
            "ORDER BY id DESC LIMIT 1",
            (txn["id"],),
        ).fetchone()
        assert ledger_row["description"] == "Fully Paid by Priya"

        conn.close()


def test_auto_remark_partially_paid_with_username():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id, customer_id = _cash_service_customer(conn)

        create_transaction(
            TransactionCreate(business_date="2026-08-01", customer_id=customer_id, service_id=service_id,
                               fee_paise=357, account_id=cash_id),
            conn,
        )

        payments = create_payment(
            PaymentCreate(business_date="2026-08-04", customer_id=customer_id, amount_paise=107,
                          account_id=cash_id, username="Priya"),
            conn,
        )
        assert payments[0]["remarks"] == "Partially Paid by Priya"

        conn.close()


def test_auto_remark_kind_reflects_total_outstanding_not_one_bill():
    # A payment clearing two bills at once is "Fully"; one that clears only
    # one of two open bills is "Partially" — the total across the customer's
    # open bills decides, not whether any single bill closed.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id, customer_id = _cash_service_customer(conn)

        bill1 = create_transaction(
            TransactionCreate(business_date="2026-08-01", customer_id=customer_id, service_id=service_id,
                               fee_paise=200, account_id=cash_id),
            conn,
        )
        create_transaction(
            TransactionCreate(business_date="2026-08-02", customer_id=customer_id, service_id=service_id,
                               fee_paise=150, account_id=cash_id),
            conn,
        )

        partial = create_payment(
            PaymentCreate(business_date="2026-08-03", customer_id=customer_id, amount_paise=200,
                          account_id=cash_id, username="Priya"),
            conn,
        )
        assert conn.execute("SELECT status FROM transactions WHERE id = ?", (bill1["id"],)).fetchone()[0] == "completed"
        assert partial[0]["remarks"] == "Partially Paid by Priya"

        full = create_payment(
            PaymentCreate(business_date="2026-08-04", customer_id=customer_id, amount_paise=150,
                          account_id=cash_id, username="Priya"),
            conn,
        )
        assert full[0]["remarks"] == "Fully Paid by Priya"

        conn.close()


def test_auto_remark_keeps_operator_note():
    # Blank operator note -> auto remark alone (covered by the tests above).
    # A typed note is appended, not replaced.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, service_id, customer_id = _cash_service_customer(conn)

        create_transaction(
            TransactionCreate(business_date="2026-08-01", customer_id=customer_id, service_id=service_id,
                               fee_paise=100, account_id=cash_id),
            conn,
        )

        payments = create_payment(
            PaymentCreate(business_date="2026-08-04", customer_id=customer_id, amount_paise=100,
                          account_id=cash_id, username="Priya", remarks="cash at counter"),
            conn,
        )
        assert payments[0]["remarks"] == "Fully Paid by Priya — cash at counter"

        conn.close()


if __name__ == "__main__":
    test_one_payment_clears_two_separate_outstanding_bills()
    test_payment_smaller_than_one_bill_leaves_it_partial()
    test_amount_exceeding_outstanding_rejected()
    test_payment_with_no_outstanding_bills_rejected()
    test_creation_time_payment_reduces_outstanding_immediately()
    test_payment_to_deactivated_account_rejected()
    test_concurrent_payments_against_one_bill_only_one_succeeds()
    test_outlay_bill_settled_later_splits_recovery_before_income()
    test_no_outlay_settlement_now_counts_as_income()
    test_auto_remark_fully_paid_with_username()
    test_auto_remark_partially_paid_with_username()
    test_auto_remark_kind_reflects_total_outstanding_not_one_bill()
    test_auto_remark_keeps_operator_note()
    print("OK")
