"""Self-check for the customers API. Calls the route functions directly
against a temp DB — no httpx/TestClient dependency needed. Run:
python tests/test_customers.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.customers import (
    CustomerCreate,
    CustomerUpdate,
    create_customer,
    delete_customer,
    get_customer,
    get_customer_history,
    get_customer_outstanding,
    list_customers,
    update_customer,
)
from app.db import get_connection, run_migrations
from app.seed import run_seed

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def _seeded_conn(tmp: Path):
    conn = get_connection(tmp / "test.db")
    run_migrations(conn, MIGRATIONS_DIR)
    run_seed(conn)
    return conn


def test_create_and_get_customer():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))

        customer = create_customer(
            CustomerCreate(name="Ramesh Kumar", phone="9876543210", village="Rampur"), conn
        )
        fetched = get_customer(customer["id"], conn)
        assert fetched["name"] == "Ramesh Kumar"
        assert fetched["village"] == "Rampur"

        conn.close()


def test_update_customer():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        customer = create_customer(CustomerCreate(name="Ramesh Kumar"), conn)

        updated = update_customer(customer["id"], CustomerUpdate(phone="9999999999"), conn)
        assert updated["phone"] == "9999999999"
        assert updated["name"] == "Ramesh Kumar"  # untouched fields preserved

        conn.close()


def test_soft_deleted_customer_hidden_from_list_but_history_intact():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        customer = create_customer(CustomerCreate(name="Ramesh Kumar"), conn)

        delete_customer(customer["id"], conn)

        names = {c["name"] for c in list_customers(conn=conn)}
        assert "Ramesh Kumar" not in names

        # row itself still intact for history joins — direct SQL, bypassing the
        # deleted_at filter that get_customer/list_customers apply
        row = conn.execute("SELECT * FROM customers WHERE id = ?", (customer["id"],)).fetchone()
        assert row is not None
        assert row["deleted_at"] is not None
        assert row["name"] == "Ramesh Kumar"

        conn.close()


def test_search_matches_partial_name_phone_or_village():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        create_customer(CustomerCreate(name="Ramesh Kumar", phone="9876543210", village="Rampur"), conn)
        create_customer(CustomerCreate(name="Suresh Yadav", phone="8123456789", village="Sitapur"), conn)

        by_phone_fragment = list_customers(q="6543210", conn=conn)
        assert {c["name"] for c in by_phone_fragment} == {"Ramesh Kumar"}

        by_name_fragment = list_customers(q="Suresh", conn=conn)
        assert {c["name"] for c in by_name_fragment} == {"Suresh Yadav"}

        by_village_fragment = list_customers(q="pur", conn=conn)
        assert {c["name"] for c in by_village_fragment} == {"Ramesh Kumar", "Suresh Yadav"}

        conn.close()


def test_outstanding_zero_for_new_customer():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        customer = create_customer(CustomerCreate(name="Ramesh Kumar"), conn)

        result = get_customer_outstanding(customer["id"], conn=conn)
        assert result["outstanding_paise"] == 0

        conn.close()


def test_history_and_outstanding_derived_from_transactions_and_payments():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        customer = create_customer(CustomerCreate(name="Ramesh Kumar"), conn)
        account_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()["id"]
        service_id = conn.execute("SELECT id FROM services WHERE name = 'PAN'").fetchone()["id"]
        user_id = conn.execute("SELECT id FROM users WHERE username = 'admin'").fetchone()["id"]

        conn.execute(
            "INSERT INTO transactions (business_date, customer_id, service_id, fee_paise, total_paise, account_id, operator_id, status) "
            "VALUES (date('now'), ?, ?, 35700, 35700, ?, ?, 'pending')",
            (customer["id"], service_id, account_id, user_id),
        )
        conn.execute(
            "INSERT INTO banking_transactions (business_date, customer_id, txn_type, principal_paise, commission_paise, settlement_account_id, cash_account_id, operator_id) "
            "VALUES (date('now'), ?, 'aeps', 500000, 5000, ?, ?, ?)",
            (customer["id"], account_id, account_id, user_id),
        )
        conn.commit()

        # outstanding: billed but not yet paid at all
        outstanding = get_customer_outstanding(customer["id"], conn=conn)
        assert outstanding["outstanding_paise"] == 35700

        conn.execute(
            "INSERT INTO payments (business_date, customer_id, amount_paise, account_id) VALUES (date('now'), ?, 10700, ?)",
            (customer["id"], account_id),
        )
        conn.commit()

        # a partial payment reduces outstanding by exactly its amount
        outstanding = get_customer_outstanding(customer["id"], conn=conn)
        assert outstanding["outstanding_paise"] == 25000

        history = get_customer_history(customer["id"], conn=conn)
        assert len(history["transactions"]) == 1
        assert history["transactions"][0]["service_name"] == "PAN"
        assert len(history["banking_transactions"]) == 1
        assert history["banking_transactions"][0]["txn_type"] == "aeps"

        conn.close()


if __name__ == "__main__":
    test_create_and_get_customer()
    test_update_customer()
    test_soft_deleted_customer_hidden_from_list_but_history_intact()
    test_search_matches_partial_name_phone_or_village()
    test_outstanding_zero_for_new_customer()
    test_history_and_outstanding_derived_from_transactions_and_payments()
    print("OK")
