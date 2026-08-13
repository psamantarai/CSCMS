"""Self-check for the customers API. Calls the route functions directly
against a temp DB — no httpx/TestClient dependency needed. Run:
python tests/test_customers.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import HTTPException
from pydantic import ValidationError

from app.accounts import AccountCreate, create_account
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
        customer = create_customer(CustomerCreate(name="Ramesh Kumar", phone="9800000001"), conn)

        updated = update_customer(customer["id"], CustomerUpdate(phone="9999999999"), conn)
        assert updated["phone"] == "9999999999"
        assert updated["name"] == "Ramesh Kumar"  # untouched fields preserved

        conn.close()


def test_soft_deleted_customer_hidden_from_list_but_history_intact():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        customer = create_customer(CustomerCreate(name="Ramesh Kumar", phone="9800000001"), conn)

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
        customer = create_customer(CustomerCreate(name="Ramesh Kumar", phone="9800000001"), conn)

        result = get_customer_outstanding(customer["id"], conn=conn)
        assert result["outstanding_paise"] == 0

        conn.close()


def test_history_and_outstanding_derived_from_transactions_and_payments():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        customer = create_customer(CustomerCreate(name="Ramesh Kumar", phone="9800000001"), conn)
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


def test_search_escapes_like_wildcards():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        create_customer(CustomerCreate(name="Ramesh Kumar", phone="9876543210"), conn)
        create_customer(CustomerCreate(name="100% Cotton", phone="9800000002"), conn)

        # a literal % in the query must not act as a wildcard matching everyone
        by_percent = list_customers(q="%", conn=conn)
        assert {c["name"] for c in by_percent} == {"100% Cotton"}

        by_underscore = list_customers(q="_", conn=conn)
        assert by_underscore == []

        conn.close()


def test_phone_lookup_matches_normalised_variants():
    # PLAN 16.6.3: exact phone match, normalised (digits only, last 10).
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        create_customer(CustomerCreate(name="Ramesh Kumar", phone="+91 98765 43210"), conn)
        create_customer(CustomerCreate(name="Suresh Babu", phone="9876543211"), conn)

        for variant in ("9876543210", "098765-43210", "98765 43210"):
            found = list_customers(phone=variant, conn=conn)
            assert {c["name"] for c in found} == {"Ramesh Kumar"}

        # nine digits must not match the stored ten-digit number
        assert list_customers(phone="987654321", conn=conn) == []

        # a bare wildcard normalises to no digits at all — nothing, not everyone
        assert list_customers(phone="%", conn=conn) == []

        conn.close()


def test_history_and_outstanding_reachable_after_soft_delete():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        customer = create_customer(CustomerCreate(name="Ramesh Kumar", phone="9800000001"), conn)
        account_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()["id"]
        service_id = conn.execute("SELECT id FROM services WHERE name = 'PAN'").fetchone()["id"]
        user_id = conn.execute("SELECT id FROM users WHERE username = 'admin'").fetchone()["id"]
        conn.execute(
            "INSERT INTO transactions (business_date, customer_id, service_id, fee_paise, total_paise, account_id, operator_id, status) "
            "VALUES (date('now'), ?, ?, 35700, 35700, ?, ?, 'pending')",
            (customer["id"], service_id, account_id, user_id),
        )
        conn.commit()

        delete_customer(customer["id"], conn)

        # H.7: must return data, not 404, once soft-deleted
        history = get_customer_history(customer["id"], conn=conn)
        assert history["customer_deleted"] is True
        assert len(history["transactions"]) == 1

        outstanding = get_customer_outstanding(customer["id"], conn=conn)
        assert outstanding["customer_deleted"] is True
        assert outstanding["outstanding_paise"] == 35700

        conn.close()


def test_history_reports_paid_and_balance_matching_outstanding_and_transactions():
    # PLAN 16.6.1: paid_paise/balance_paise on the history endpoint, derived
    # via the same shared CASE expression list_transactions uses.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        pan = create_service(ServiceCreate(name="PAN Card", category="PAN", default_fee_paise=10000), conn)
        wallet = create_account(
            AccountCreate(name="Portal Wallet", account_type="wallet", opening_balance_paise=1000000), conn
        )
        outlay_service = create_service(
            ServiceCreate(name="Insurance Premium", category="Insurance", default_fee_paise=5000), conn
        )
        conn.execute("UPDATE services SET has_outlay = 1 WHERE id = ?", (outlay_service["id"],))
        conn.commit()  # raw DML auto-begins a transaction; create_transaction's begin_write needs none open

        customer = create_customer(CustomerCreate(name="Ramesh Kumar", phone="9800000001"), conn)

        # a ₹357 bill paid ₹107 — partial
        create_transaction(TransactionCreate(business_date="2026-08-01", service_id=pan["id"],
                                              customer_id=customer["id"], fee_paise=35700, account_id=cash_id,
                                              amount_paid_paise=10700), conn)
        # a bill carrying an outlay, paid in full
        create_transaction(TransactionCreate(business_date="2026-08-01", service_id=outlay_service["id"],
                                              customer_id=customer["id"], fee_paise=505000, account_id=cash_id,
                                              outlay_paise=500000, outlay_account_id=wallet["id"],
                                              amount_paid_paise=505000), conn)

        txns = get_customer_history(customer["id"], conn=conn)["transactions"]
        assert len(txns) == 2
        for t in txns:
            assert t["balance_paise"] == t["total_paise"] - t["paid_paise"]

        partial = next(t for t in txns if t["total_paise"] == 35700)
        assert partial["paid_paise"] == 10700
        assert partial["balance_paise"] == 25000

        outlay_bill = next(t for t in txns if t["total_paise"] == 505000)
        assert outlay_bill["paid_paise"] == 505000
        assert outlay_bill["balance_paise"] == 0

        # summed balance_paise reconciles with the outstanding endpoint
        outstanding = get_customer_outstanding(customer["id"], conn=conn)
        assert sum(t["balance_paise"] for t in txns) == outstanding["outstanding_paise"] == 25000

        # the outlay bill's paid_paise agrees across both endpoints
        listed = next(r for r in list_transactions(customer_id=customer["id"], conn=conn)["items"]
                       if r["total_paise"] == 505000)
        assert listed["paid_paise"] == outlay_bill["paid_paise"]

        conn.close()


def test_null_and_blank_name_rejected():
    # H.4: explicit null / whitespace-only must not reach the DB as a NOT NULL violation.
    for bad_name in (None, "   "):
        try:
            CustomerCreate(name=bad_name)
            assert False, f"name={bad_name!r} must be rejected on create"
        except ValidationError:
            pass
        try:
            CustomerUpdate(name=bad_name)
            assert False, f"name={bad_name!r} must be rejected on update"
        except ValidationError:
            pass

    # nullable columns (phone/village/etc.) may still be explicitly cleared
    assert CustomerUpdate(phone=None).model_dump(exclude_unset=True) == {"phone": None}


def test_phone_required_on_create_but_still_optional_on_update():
    # Operator request 2026-08-13: a customer is usually entered while
    # carrying a balance, so phone must be given at create time. Update
    # keeps H.4's existing "phone is clearable" behaviour untouched.
    for bad_phone in (None, "   "):
        try:
            CustomerCreate(name="Ramesh Kumar", phone=bad_phone)
            assert False, f"phone={bad_phone!r} must be rejected on create"
        except ValidationError:
            pass
    try:
        CustomerCreate(name="Ramesh Kumar")
        assert False, "omitting phone entirely must be rejected on create"
    except ValidationError:
        pass

    # update still doesn't require it — omitting phone, or clearing it, both work
    assert CustomerUpdate(name="New Name").model_dump(exclude_unset=True) == {"name": "New Name"}


def test_duplicate_name_and_phone_rejected_but_shared_phone_or_name_alone_allowed():
    # Operator request 2026-08-13: name+phone is the de-dupe key, not phone
    # alone — Phase 2.5 deliberately left "two family members, one phone"
    # allowed, and this must not take that back.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        create_customer(CustomerCreate(name="Ramesh Kumar", phone="9876543210"), conn)

        # exact same name+phone (any equivalent phone formatting) is rejected
        for variant in ("9876543210", "+91 98765 43210", "098765-43210"):
            try:
                create_customer(CustomerCreate(name="Ramesh Kumar", phone=variant), conn)
                assert False, f"duplicate name+phone ({variant!r}) must be rejected"
            except HTTPException as e:
                assert e.status_code == 400, e.status_code

        # a family member sharing the same phone under a different name is fine
        sibling = create_customer(CustomerCreate(name="Suresh Kumar", phone="9876543210"), conn)
        assert sibling["name"] == "Suresh Kumar"

        # the same name at a different phone is also fine (common name in a village)
        namesake = create_customer(CustomerCreate(name="Ramesh Kumar", phone="9876543211"), conn)
        assert namesake["id"] != sibling["id"]

        # PATCH into a collision with someone else is rejected too...
        try:
            update_customer(namesake["id"], CustomerUpdate(phone="9876543210"), conn)
            assert False, "update into an existing name+phone combo must be rejected"
        except HTTPException as e:
            assert e.status_code == 400, e.status_code

        # ...but saving a customer's own unchanged combo (e.g. editing an
        # unrelated field) is not mistaken for a collision with themselves
        edited = update_customer(namesake["id"], CustomerUpdate(village="Rampur"), conn)
        assert edited["village"] == "Rampur"

        conn.close()


def test_out_of_range_customer_id_returns_404_not_500():
    # H.34: an id outside SQLite's 64-bit range used to raise an uncaught
    # OverflowError from _get_or_404, shared by every customer-resolving route.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        for customer_id in (99999999999999999999, -99999999999999999999):
            try:
                get_customer(customer_id, conn)
                assert False, f"expected 404 for out-of-range id {customer_id}"
            except HTTPException as e:
                assert e.status_code == 404, e.status_code
        conn.close()


if __name__ == "__main__":
    test_create_and_get_customer()
    test_update_customer()
    test_soft_deleted_customer_hidden_from_list_but_history_intact()
    test_search_matches_partial_name_phone_or_village()
    test_outstanding_zero_for_new_customer()
    test_history_and_outstanding_derived_from_transactions_and_payments()
    test_search_escapes_like_wildcards()
    test_phone_lookup_matches_normalised_variants()
    test_history_and_outstanding_reachable_after_soft_delete()
    test_history_reports_paid_and_balance_matching_outstanding_and_transactions()
    test_null_and_blank_name_rejected()
    test_phone_required_on_create_but_still_optional_on_update()
    test_duplicate_name_and_phone_rejected_but_shared_phone_or_name_alone_allowed()
    test_out_of_range_customer_id_returns_404_not_500()
    print("OK")
