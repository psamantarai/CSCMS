"""Self-check for the business_days lifecycle (PLAN 6.1-6.3): auto-open on
first write, opening-balance derivation, and the closed-day write guard.
Run: python tests/test_business_days.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.accounts import AccountCreate, create_account
from app.banking import BankingCreate, BankingUpdate, create_banking, delete_banking, update_banking
from app.db import get_connection, run_migrations
from app.expenses import ExpenseCreate, create_expense
from app.ledger import account_balance, ensure_business_day_open, opening_balance
from app.payments import PaymentCreate, create_payment
from app.seed import run_seed
from app.transactions import (
    TransactionCorrection, TransactionCreate, correct_transaction, create_transaction,
)
from app.transfers import TransferCreate, create_transfer

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def _seeded_conn(tmp: Path):
    conn = get_connection(tmp / "test.db")
    run_migrations(conn, MIGRATIONS_DIR)
    run_seed(conn)
    return conn


def _close_day(conn, business_date: str):
    """No close-day API yet (that's 6.4) — tests drive the table directly,
    same as the app's own close workflow eventually will."""
    ensure_business_day_open(conn, business_date)
    conn.execute("UPDATE business_days SET status = 'closed' WHERE business_date = ?", (business_date,))
    conn.commit()


def _accounts(conn):
    cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
    sbi = create_account(AccountCreate(name="SBI", account_type="settlement", opening_balance_paise=1000000), conn)
    return cash_id, sbi["id"]


# ---- 6.1: auto-open ---------------------------------------------------

def test_fresh_date_has_no_business_day_row_until_first_write():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, sbi_id = _accounts(conn)
        assert conn.execute("SELECT 1 FROM business_days WHERE business_date = ?", ("2026-09-01",)).fetchone() is None

        create_expense(ExpenseCreate(business_date="2026-09-01", category="Rent", amount_paise=10000, account_id=sbi_id), conn)

        row = conn.execute("SELECT status FROM business_days WHERE business_date = ?", ("2026-09-01",)).fetchone()
        assert row is not None and row["status"] == "open"
        conn.close()


def test_second_write_to_the_same_date_does_not_reopen_or_error():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, sbi_id = _accounts(conn)
        create_expense(ExpenseCreate(business_date="2026-09-02", category="Rent", amount_paise=10000, account_id=sbi_id), conn)
        create_expense(ExpenseCreate(business_date="2026-09-02", category="Ink", amount_paise=5000, account_id=sbi_id), conn)
        assert conn.execute(
            "SELECT COUNT(*) FROM business_days WHERE business_date = ?", ("2026-09-02",)
        ).fetchone()[0] == 1
        conn.close()


# ---- 6.2: opening balance derivation -----------------------------------

def test_opening_balance_equals_prior_days_closing_with_no_copy_step():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, sbi_id = _accounts(conn)  # sbi_id's opening_balance entry is dated "today" (server date)

        create_expense(ExpenseCreate(business_date="2026-09-05", category="Rent", amount_paise=100000, account_id=sbi_id), conn)
        create_expense(ExpenseCreate(business_date="2026-09-06", category="Ink", amount_paise=20000, account_id=sbi_id), conn)
        create_expense(ExpenseCreate(business_date="2026-09-07", category="Paper", amount_paise=5000, account_id=sbi_id), conn)

        def closing_balance_asof(business_date: str) -> int:
            # D's closing balance: every entry dated <= D — computed
            # directly from the ledger, independent of opening_balance()'s
            # own implementation, so this is a real cross-check not a tautology.
            row = conn.execute(
                "SELECT SUM(amount_paise) FROM ledger WHERE account_id = ? AND business_date <= ?",
                (sbi_id, business_date),
            ).fetchone()
            return row[0] or 0

        # opening balance for D equals D-1's closing balance, with no
        # carry-forward copy step — both figures are live sums over the
        # same ledger, just with a different date cutoff (< vs <=).
        assert opening_balance(conn, sbi_id, "2026-09-07") == closing_balance_asof("2026-09-06")
        assert opening_balance(conn, sbi_id, "2026-09-06") == closing_balance_asof("2026-09-05")

        # and it picks up the account's own opening_balance ledger entry
        # (dated "today", i.e. before 2026-09-05) rather than treating the
        # account as starting from zero.
        assert opening_balance(conn, sbi_id, "2026-09-05") == 1000000
        conn.close()


# ---- 6.3: closed-day write guard ---------------------------------------

def test_closed_date_rejects_every_create_endpoint():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, sbi_id = _accounts(conn)
        customer_id = conn.execute(
            "INSERT INTO customers (name) VALUES ('Test Customer')"
        ).lastrowid
        conn.commit()
        service_id = conn.execute("SELECT id FROM services LIMIT 1").fetchone()[0]

        # give the customer an outstanding bill on an open date first, so
        # the payment attempt below actually reaches insert_entry instead
        # of failing earlier on "nothing outstanding".
        create_transaction(TransactionCreate(
            business_date="2026-09-09", customer_id=customer_id, service_id=service_id,
            fee_paise=5000, charge_paise=0, discount_paise=0, account_id=sbi_id, amount_paid_paise=0,
        ), conn)

        _close_day(conn, "2026-09-10")

        try:
            create_transaction(TransactionCreate(
                business_date="2026-09-10", customer_id=None, service_id=service_id,
                fee_paise=1000, charge_paise=0, discount_paise=0, account_id=cash_id, amount_paid_paise=0,
            ), conn)
            assert False, "transaction on a closed date must be rejected"
        except Exception as e:
            assert "409" in str(e)

        try:
            create_expense(ExpenseCreate(business_date="2026-09-10", category="Rent", amount_paise=1000, account_id=sbi_id), conn)
            assert False, "expense on a closed date must be rejected"
        except Exception as e:
            assert "409" in str(e)

        try:
            create_transfer(TransferCreate(business_date="2026-09-10", from_account_id=sbi_id, to_account_id=cash_id, amount_paise=1000), conn)
            assert False, "transfer on a closed date must be rejected"
        except Exception as e:
            assert "409" in str(e)

        try:
            create_banking(BankingCreate(
                business_date="2026-09-10", txn_type="aeps", principal_paise=1000, commission_paise=10,
                settlement_account_id=sbi_id, cash_account_id=cash_id,
            ), conn)
            assert False, "banking entry on a closed date must be rejected"
        except Exception as e:
            assert "409" in str(e)

        try:
            create_payment(PaymentCreate(business_date="2026-09-10", customer_id=customer_id, amount_paise=1000, account_id=cash_id), conn)
            assert False, "payment on a closed date must be rejected"
        except Exception as e:
            assert "409" in str(e)

        conn.close()


def test_open_date_after_a_different_closed_date_still_works():
    """The guard is per-date, not global — closing one day must not lock out
    writes to any other (open) date."""
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, sbi_id = _accounts(conn)
        _close_day(conn, "2026-09-10")

        row = create_expense(ExpenseCreate(business_date="2026-09-11", category="Rent", amount_paise=1000, account_id=sbi_id), conn)
        assert row["business_date"] == "2026-09-11"
        conn.close()


def test_moving_a_transaction_onto_a_closed_date_is_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, sbi_id = _accounts(conn)
        service_id = conn.execute("SELECT id FROM services LIMIT 1").fetchone()[0]
        _close_day(conn, "2026-09-15")

        txn = create_transaction(TransactionCreate(
            business_date="2026-09-16", customer_id=None, service_id=service_id,
            fee_paise=1000, charge_paise=0, discount_paise=0, account_id=cash_id, amount_paid_paise=1000,
        ), conn)

        try:
            correct_transaction(txn["id"], TransactionCorrection(business_date="2026-09-15"), conn)
            assert False, "moving a transaction onto a closed date must be rejected"
        except Exception as e:
            assert "409" in str(e)

        # and the transaction's own date is untouched by the failed attempt
        row = conn.execute("SELECT business_date FROM transactions WHERE id = ?", (txn["id"],)).fetchone()
        assert row["business_date"] == "2026-09-16"
        conn.close()


def test_non_money_correction_of_a_transaction_on_a_closed_date_still_works():
    """A field edit that never touches the ledger (no account/date/amount
    change) posts nothing, so it isn't gated by the closed-day guard at
    all — the guard only fires on an actual ledger write."""
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, sbi_id = _accounts(conn)
        service_id = conn.execute("SELECT id FROM services LIMIT 1").fetchone()[0]

        txn = create_transaction(TransactionCreate(
            business_date="2026-09-20", customer_id=None, service_id=service_id,
            fee_paise=1000, charge_paise=0, discount_paise=0, account_id=cash_id, amount_paid_paise=1000,
        ), conn)
        _close_day(conn, "2026-09-20")

        corrected = correct_transaction(txn["id"], TransactionCorrection(remarks="typo fix"), conn)
        assert corrected["remarks"] == "typo fix"
        conn.close()


def test_money_correction_of_a_transaction_on_a_closed_date_is_rejected():
    """ARCHITECTURE.md section 5's back-dating note says a correction to a
    closed day posts its replacement entry on the *current open* date, not
    the original one — that redirect isn't built yet (a later phase), so
    today a money-changing correction of a closed-day transaction is
    rejected outright rather than silently violating the closed-day
    guarantee by writing a fresh entry onto the closed date."""
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, sbi_id = _accounts(conn)
        service_id = conn.execute("SELECT id FROM services LIMIT 1").fetchone()[0]

        txn = create_transaction(TransactionCreate(
            business_date="2026-09-21", customer_id=None, service_id=service_id,
            fee_paise=1000, charge_paise=0, discount_paise=0, account_id=cash_id, amount_paid_paise=1000,
        ), conn)
        _close_day(conn, "2026-09-21")

        try:
            correct_transaction(txn["id"], TransactionCorrection(fee_paise=1500), conn)
            assert False, "a fee correction on a closed-date transaction must be rejected"
        except Exception as e:
            assert "409" in str(e)

        # unchanged: the failed attempt left the original entry live
        row = conn.execute("SELECT fee_paise FROM transactions WHERE id = ?", (txn["id"],)).fetchone()
        assert row["fee_paise"] == 1000
        conn.close()


def test_banking_correction_and_deletion_on_a_closed_date_are_both_rejected():
    """A money-changing correction needs a fresh replacement entry on the
    closed date, so it's rejected. H.30: deletion used to be let through —
    it only reverses the existing live entries (entry_type='reversal',
    exempt from the guard — see ensure_business_day_open's docstring) and
    posts no replacement, so nothing caught it — but that silently changed a
    sealed day's numbers after close, so delete_banking now checks the
    resource's own business_date explicitly too."""
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, sbi_id = _accounts(conn)

        row = create_banking(BankingCreate(
            business_date="2026-09-25", txn_type="aeps", principal_paise=100000, commission_paise=1000,
            settlement_account_id=sbi_id, cash_account_id=cash_id,
        ), conn)
        _close_day(conn, "2026-09-25")

        try:
            update_banking(row["id"], BankingUpdate(commission_paise=2000), conn)
            assert False, "a commission correction on a closed-date banking entry must be rejected"
        except Exception as e:
            assert "409" in str(e)

        try:
            delete_banking(row["id"], conn)
            assert False, "deleting a closed-date banking entry must be rejected"
        except Exception as e:
            assert "409" in str(e)
        deleted = conn.execute("SELECT deleted_at FROM banking_transactions WHERE id = ?", (row["id"],)).fetchone()
        assert deleted["deleted_at"] is None
        conn.close()


if __name__ == "__main__":
    test_fresh_date_has_no_business_day_row_until_first_write()
    test_second_write_to_the_same_date_does_not_reopen_or_error()
    test_opening_balance_equals_prior_days_closing_with_no_copy_step()
    test_closed_date_rejects_every_create_endpoint()
    test_open_date_after_a_different_closed_date_still_works()
    test_moving_a_transaction_onto_a_closed_date_is_rejected()
    test_non_money_correction_of_a_transaction_on_a_closed_date_still_works()
    test_money_correction_of_a_transaction_on_a_closed_date_is_rejected()
    test_banking_correction_and_deletion_on_a_closed_date_are_both_rejected()
    print("OK")
