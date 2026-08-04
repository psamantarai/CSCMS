"""Self-check for the services API. Calls the route functions directly against
a temp DB — no httpx/TestClient dependency needed. Run:
python tests/test_services.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import get_connection, run_migrations
from app.seed import run_seed
from app.services import ServiceCreate, ServiceUpdate, create_service, get_service, list_services, update_service

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def _seeded_conn(tmp: Path):
    conn = get_connection(tmp / "test.db")
    run_migrations(conn, MIGRATIONS_DIR)
    run_seed(conn)
    return conn


def test_seeded_services_are_listable():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))

        names = {s["name"] for s in list_services(conn=conn)}
        assert {"PAN", "Aadhaar", "Banking"} <= names

        conn.close()


def test_create_and_get_service():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))

        service = create_service(
            ServiceCreate(name="Photocopy", category="Printing", default_fee_paise=200, default_charge_paise=0),
            conn,
        )
        assert service["is_active"] == 1

        fetched = get_service(service["id"], conn)
        assert fetched["name"] == "Photocopy"

        conn.close()


def test_deactivated_service_excluded_from_active_only_but_still_gettable():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        service = create_service(
            ServiceCreate(name="Photocopy", category="Printing"), conn
        )

        update_service(service["id"], ServiceUpdate(is_active=False), conn)

        active_names = {s["name"] for s in list_services(active_only=True, conn=conn)}
        assert "Photocopy" not in active_names

        all_names = {s["name"] for s in list_services(conn=conn)}
        assert "Photocopy" in all_names  # retained, just inactive

        # still directly gettable (e.g. by an old transaction referencing it)
        fetched = get_service(service["id"], conn)
        assert fetched["is_active"] == 0

        conn.close()


def test_editing_default_fee_does_not_alter_past_transactions():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        service = create_service(
            ServiceCreate(name="Photocopy", category="Printing", default_fee_paise=200), conn
        )
        account_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()["id"]
        user_id = conn.execute("SELECT id FROM users WHERE username = 'admin'").fetchone()["id"]

        # a transaction stores its own fee_paise copy at the time it was made —
        # it does not read the service's default_fee_paise live
        conn.execute(
            "INSERT INTO transactions (business_date, service_id, fee_paise, total_paise, account_id, operator_id, status) "
            "VALUES (date('now'), ?, 200, 200, ?, ?, 'completed')",
            (service["id"], account_id, user_id),
        )
        conn.commit()

        update_service(service["id"], ServiceUpdate(default_fee_paise=500), conn)

        fetched = get_service(service["id"], conn)
        assert fetched["default_fee_paise"] == 500  # new form pre-fills would use this

        stored_txn_fee = conn.execute("SELECT fee_paise FROM transactions WHERE service_id = ?", (service["id"],)).fetchone()[0]
        assert stored_txn_fee == 200  # past transaction untouched

        conn.close()


if __name__ == "__main__":
    test_seeded_services_are_listable()
    test_create_and_get_service()
    test_deactivated_service_excluded_from_active_only_but_still_gettable()
    test_editing_default_fee_does_not_alter_past_transactions()
    print("OK")
