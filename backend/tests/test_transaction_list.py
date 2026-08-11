"""Self-check for the transaction list API (PLAN 3.5). Calls the route
function directly against a temp DB. Run: python tests/test_transaction_list.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.customers import CustomerCreate, create_customer
from app.db import get_connection, run_migrations
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


def _cash_id(conn):
    return conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]


def test_filter_combinations_return_consistent_counts_and_totals():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = _cash_id(conn)
        pan = create_service(ServiceCreate(name="PAN Card", category="PAN", default_fee_paise=10000), conn)
        aadhaar = create_service(ServiceCreate(name="Aadhaar Update", category="Aadhaar", default_fee_paise=5000), conn)
        alice = create_customer(CustomerCreate(name="Alice"), conn)
        # PLAN 15.1: a pending row needs a customer, and it must not be Alice
        # — the customer_id filter below counts exactly her two rows.
        bob = create_customer(CustomerCreate(name="Bob"), conn)

        # pending, Bob, PAN
        create_transaction(TransactionCreate(business_date="2026-08-01", service_id=pan["id"],
                                              customer_id=bob["id"], fee_paise=100, account_id=cash_id), conn)
        # completed, Alice, PAN
        create_transaction(TransactionCreate(business_date="2026-08-02", service_id=pan["id"],
                                              customer_id=alice["id"], fee_paise=100, account_id=cash_id,
                                              amount_paid_paise=100), conn)
        # partial, Alice, Aadhaar
        create_transaction(TransactionCreate(business_date="2026-08-02", service_id=aadhaar["id"],
                                              customer_id=alice["id"], fee_paise=200, account_id=cash_id,
                                              amount_paid_paise=50), conn)

        all_txns = list_transactions(conn=conn)
        assert all_txns["total"] == 3
        assert len(all_txns["items"]) == 3

        by_date = list_transactions(business_date="2026-08-02", conn=conn)
        assert by_date["total"] == 2

        by_service = list_transactions(service_id=pan["id"], conn=conn)
        assert by_service["total"] == 2

        by_status = list_transactions(status="partial", conn=conn)
        assert by_status["total"] == 1

        by_customer = list_transactions(customer_id=alice["id"], conn=conn)
        assert by_customer["total"] == 2

        combined = list_transactions(business_date="2026-08-02", customer_id=alice["id"],
                                      service_id=aadhaar["id"], conn=conn)
        assert combined["total"] == 1
        assert combined["items"][0]["status"] == "partial"

        conn.close()


def test_rows_carry_names_and_paid_paise():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = _cash_id(conn)
        pan = create_service(ServiceCreate(name="PAN Card", category="PAN", default_fee_paise=10000), conn)
        alice = create_customer(CustomerCreate(name="Alice"), conn)

        create_transaction(TransactionCreate(business_date="2026-08-01", service_id=pan["id"],
                                              fee_paise=100, account_id=cash_id, amount_paid_paise=100), conn)
        create_transaction(TransactionCreate(business_date="2026-08-01", service_id=pan["id"],
                                              customer_id=alice["id"], fee_paise=357, account_id=cash_id,
                                              amount_paid_paise=107), conn)

        items = list_transactions(conn=conn)["items"]
        walkin = next(r for r in items if r["customer_id"] is None)
        alices = next(r for r in items if r["customer_id"] == alice["id"])

        assert walkin["service_name"] == "PAN Card"
        assert walkin["customer_name"] is None
        assert walkin["paid_paise"] == 100

        assert alices["customer_name"] == "Alice"
        assert alices["paid_paise"] == 107

        conn.close()


def test_pagination_limit_and_offset():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = _cash_id(conn)
        service = create_service(ServiceCreate(name="PAN Card", category="PAN", default_fee_paise=10000), conn)

        for i in range(5):
            create_transaction(TransactionCreate(business_date="2026-08-01", service_id=service["id"],
                                                   fee_paise=100 + i, account_id=cash_id,
                                                   amount_paid_paise=100 + i), conn)

        page1 = list_transactions(limit=2, offset=0, conn=conn)
        assert page1["total"] == 5
        assert len(page1["items"]) == 2

        page2 = list_transactions(limit=2, offset=2, conn=conn)
        assert len(page2["items"]) == 2
        assert {r["id"] for r in page1["items"]}.isdisjoint({r["id"] for r in page2["items"]})

        # out-of-range limit clamps rather than passing through to SQLite
        clamped = list_transactions(limit=-1, conn=conn)
        assert clamped["limit"] == 500 and len(clamped["items"]) == 5

        floored = list_transactions(offset=-5, conn=conn)
        assert floored["offset"] == 0

        conn.close()


if __name__ == "__main__":
    test_filter_combinations_return_consistent_counts_and_totals()
    test_pagination_limit_and_offset()
    test_rows_carry_names_and_paid_paise()
    print("OK")
