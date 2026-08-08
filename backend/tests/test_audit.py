"""Self-check for the audit log writer (PLAN 8.3). Calls the route functions
directly against a temp DB. Run: python tests/test_audit.py"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.accounts import AccountCreate, create_account
from app.db import get_connection, run_migrations
from app.expenses import ExpenseCreate, ExpenseUpdate, create_expense, delete_expense, update_expense
from app.seed import run_seed, seed_admin_user
from app.services import ServiceCreate, create_service
from app.transactions import TransactionCorrection, TransactionCreate, correct_transaction, create_transaction

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def _seeded_conn(tmp: Path):
    conn = get_connection(tmp / "test.db")
    run_migrations(conn, MIGRATIONS_DIR)
    run_seed(conn)
    seed_admin_user(conn)
    return conn


def _audit_rows(conn, table_name: str, row_id: int):
    return conn.execute(
        "SELECT * FROM audit_logs WHERE table_name = ? AND row_id = ? ORDER BY id", (table_name, row_id)
    ).fetchall()


def test_create_account_writes_a_create_audit_row_with_no_before():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        account = create_account(AccountCreate(name="SBI", account_type="savings"), conn)

        rows = _audit_rows(conn, "accounts", account["id"])
        assert len(rows) == 1
        assert rows[0]["action"] == "create"
        assert rows[0]["before_json"] is None
        assert json.loads(rows[0]["after_json"])["name"] == "SBI"
        conn.close()


def test_editing_a_transaction_leaves_a_complete_before_after_audit_row():
    """PLAN 8.3's own verify line."""
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        service = create_service(ServiceCreate(name="PAN Card", category="PAN", default_fee_paise=10000), conn)

        txn = create_transaction(
            TransactionCreate(business_date="2026-08-05", service_id=service["id"],
                               fee_paise=10000, account_id=cash_id, amount_paid_paise=0),
            conn,
        )
        correct_transaction(txn["id"], TransactionCorrection(remarks="corrected"), conn)

        rows = _audit_rows(conn, "transactions", txn["id"])
        assert [r["action"] for r in rows] == ["create", "update"]
        update_row = rows[1]
        before = json.loads(update_row["before_json"])
        after = json.loads(update_row["after_json"])
        assert before["remarks"] != after["remarks"]
        assert after["remarks"] == "corrected"
        conn.close()


def test_expense_update_and_delete_each_write_before_after_audit_rows():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        account = create_account(AccountCreate(name="SBI", account_type="savings", opening_balance_paise=100000), conn)
        expense = create_expense(
            ExpenseCreate(business_date="2026-08-05", category="Rent", amount_paise=5000, account_id=account["id"]), conn
        )

        update_expense(expense["id"], ExpenseUpdate(category="Internet"), conn)
        delete_expense(expense["id"], conn)

        rows = _audit_rows(conn, "expenses", expense["id"])
        assert [r["action"] for r in rows] == ["create", "update", "delete"]
        update_row, delete_row = rows[1], rows[2]
        assert json.loads(update_row["before_json"])["category"] == "Rent"
        assert json.loads(update_row["after_json"])["category"] == "Internet"
        assert json.loads(delete_row["after_json"])["deleted_at"] is not None
        conn.close()


if __name__ == "__main__":
    test_create_account_writes_a_create_audit_row_with_no_before()
    test_editing_a_transaction_leaves_a_complete_before_after_audit_row()
    test_expense_update_and_delete_each_write_before_after_audit_rows()
    print("All audit tests passed.")
