"""Self-check for the banking CRUD API (PLAN 5.2) and commission summary
(PLAN 5.3). Calls route functions directly against a temp DB.
Run: python tests/test_banking.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.accounts import AccountCreate, AccountUpdate, create_account, update_account
from app.banking import (
    BankingCreate, BankingUpdate, _live_ledger_entries, commission_summary,
    create_banking, delete_banking, list_banking, update_banking,
)
from app.db import get_connection, run_migrations
from app.ledger import account_balance
from app.seed import run_seed

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def _seeded_conn(tmp: Path):
    conn = get_connection(tmp / "test.db")
    run_migrations(conn, MIGRATIONS_DIR)
    run_seed(conn)
    return conn


def _accounts(conn):
    cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
    sbi = create_account(AccountCreate(name="SBI", account_type="settlement", opening_balance_paise=1000000), conn)
    return cash_id, sbi["id"]


def test_create_withdrawal_books_principal_and_commission():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, sbi_id = _accounts(conn)

        cash_before = account_balance(conn, cash_id)
        row = create_banking(
            BankingCreate(business_date="2026-08-05", txn_type="withdrawal", principal_paise=500000,
                           commission_paise=5000, settlement_account_id=sbi_id, cash_account_id=cash_id),
            conn,
        )
        assert row["principal_paise"] == 500000
        assert account_balance(conn, cash_id) == cash_before + 500000 + 5000
        assert account_balance(conn, sbi_id) == 1000000 - 500000

        conn.close()


def test_balance_enquiry_rejects_nonzero_principal():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, sbi_id = _accounts(conn)

        try:
            create_banking(
                BankingCreate(business_date="2026-08-05", txn_type="balance_enquiry", principal_paise=100,
                               commission_paise=1000, settlement_account_id=sbi_id, cash_account_id=cash_id),
                conn,
            )
            assert False, "balance enquiry with a principal must be rejected"
        except Exception as e:
            assert "400" in str(e)

        conn.close()


def test_withdrawal_requires_positive_principal():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, sbi_id = _accounts(conn)

        try:
            create_banking(
                BankingCreate(business_date="2026-08-05", txn_type="withdrawal", principal_paise=0,
                               commission_paise=1000, settlement_account_id=sbi_id, cash_account_id=cash_id),
                conn,
            )
            assert False, "a withdrawal with zero principal must be rejected"
        except Exception as e:
            assert "400" in str(e)

        conn.close()


def test_withdrawal_exceeding_settlement_balance_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, sbi_id = _accounts(conn)
        balance_before = account_balance(conn, sbi_id)

        try:
            create_banking(
                BankingCreate(business_date="2026-08-05", txn_type="withdrawal",
                               principal_paise=balance_before + 100, commission_paise=1000,
                               settlement_account_id=sbi_id, cash_account_id=cash_id),
                conn,
            )
            assert False, "a withdrawal exceeding the settlement balance must be rejected"
        except Exception as e:
            assert "400" in str(e) or "insufficient" in str(e)

        assert account_balance(conn, sbi_id) == balance_before

        conn.close()


def test_withdrawal_from_deactivated_settlement_account_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, sbi_id = _accounts(conn)
        update_account(sbi_id, AccountUpdate(is_active=False), conn)

        try:
            create_banking(
                BankingCreate(business_date="2026-08-05", txn_type="withdrawal", principal_paise=100,
                               commission_paise=10, settlement_account_id=sbi_id, cash_account_id=cash_id),
                conn,
            )
            assert False, "a withdrawal against a deactivated settlement account must be rejected"
        except Exception as e:
            assert "400" in str(e)

        conn.close()


def test_correction_reverses_old_entries_and_posts_new_ones():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, sbi_id = _accounts(conn)

        row = create_banking(
            BankingCreate(business_date="2026-08-05", txn_type="withdrawal", principal_paise=500000,
                           commission_paise=5000, settlement_account_id=sbi_id, cash_account_id=cash_id),
            conn,
        )
        cash_after_create = account_balance(conn, cash_id)
        sbi_after_create = account_balance(conn, sbi_id)

        updated = update_banking(row["id"], BankingUpdate(principal_paise=200000, commission_paise=2000), conn)
        assert updated["principal_paise"] == 200000

        # old entries reversed, new ones posted: net balance reflects only
        # the corrected amounts, not create+correction stacked.
        assert account_balance(conn, cash_id) == cash_after_create - 500000 - 5000 + 200000 + 2000
        assert account_balance(conn, sbi_id) == sbi_after_create + 500000 - 200000

        # every posted entry (old + reversals + new) is still there — nothing
        # was mutated or deleted, only reversed.
        rows = conn.execute(
            "SELECT * FROM ledger WHERE source_type = 'banking' AND source_id = ?", (row["id"],)
        ).fetchall()
        assert len(rows) == 9  # 3 original + 3 reversals + 3 new
        live = _live_ledger_entries(conn, row["id"])
        assert len(live) == 3  # the 3 new rows are the only live ones

        conn.close()


def test_delete_reverses_all_live_entries():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, sbi_id = _accounts(conn)

        row = create_banking(
            BankingCreate(business_date="2026-08-05", txn_type="deposit", principal_paise=300000,
                           commission_paise=3000, settlement_account_id=sbi_id, cash_account_id=cash_id),
            conn,
        )
        cash_before = account_balance(conn, cash_id)
        sbi_before = account_balance(conn, sbi_id)

        delete_banking(row["id"], conn)

        assert account_balance(conn, cash_id) == cash_before - 300000 - 3000
        assert account_balance(conn, sbi_id) == sbi_before + 300000

        try:
            update_banking(row["id"], BankingUpdate(remarks="x"), conn)
            assert False, "a deleted banking transaction must 404"
        except Exception as e:
            assert "404" in str(e)

        conn.close()


def test_list_filters_by_business_date_and_txn_type():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, sbi_id = _accounts(conn)

        create_banking(
            BankingCreate(business_date="2026-08-05", txn_type="withdrawal", principal_paise=100000,
                           commission_paise=1000, settlement_account_id=sbi_id, cash_account_id=cash_id),
            conn,
        )
        create_banking(
            BankingCreate(business_date="2026-08-06", txn_type="deposit", principal_paise=200000,
                           commission_paise=2000, settlement_account_id=sbi_id, cash_account_id=cash_id),
            conn,
        )

        result = list_banking(business_date="2026-08-05", txn_type=None, limit=50, offset=0, conn=conn)
        assert result["total"] == 1
        assert result["items"][0]["txn_type"] == "withdrawal"

        conn.close()


def test_commission_summary_matches_direct_ledger_query():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id, sbi_id = _accounts(conn)

        create_banking(
            BankingCreate(business_date="2026-08-05", txn_type="withdrawal", principal_paise=100000,
                           commission_paise=1500, settlement_account_id=sbi_id, cash_account_id=cash_id),
            conn,
        )
        create_banking(
            BankingCreate(business_date="2026-08-05", txn_type="balance_enquiry", principal_paise=0,
                           commission_paise=500, settlement_account_id=sbi_id, cash_account_id=cash_id),
            conn,
        )

        summary = commission_summary(business_date="2026-08-05", account_id=None, conn=conn)
        direct_total = conn.execute(
            "SELECT SUM(amount_paise) FROM ledger WHERE entry_type = 'commission' AND business_date = ?",
            ("2026-08-05",),
        ).fetchone()[0]

        assert summary["total_commission_paise"] == direct_total == 2000
        assert summary["items"][0]["account_id"] == cash_id

        conn.close()


if __name__ == "__main__":
    test_create_withdrawal_books_principal_and_commission()
    test_balance_enquiry_rejects_nonzero_principal()
    test_withdrawal_requires_positive_principal()
    test_withdrawal_exceeding_settlement_balance_rejected()
    test_withdrawal_from_deactivated_settlement_account_rejected()
    test_correction_reverses_old_entries_and_posts_new_ones()
    test_delete_reverses_all_live_entries()
    test_list_filters_by_business_date_and_txn_type()
    test_commission_summary_matches_direct_ledger_query()
    print("OK")
