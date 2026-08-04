"""Self-check for the transfers API. Calls the route function directly against
a temp DB. Run: python tests/test_transfers.py"""
import sys
import tempfile
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.accounts import AccountCreate, AccountUpdate, create_account, update_account
from app.db import get_connection, run_migrations
from app.ledger import account_balance
from app.seed import run_seed
from app.transfers import TransferCreate, create_transfer, list_transfers

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def _seeded_conn(tmp: Path):
    conn = get_connection(tmp / "test.db")
    run_migrations(conn, MIGRATIONS_DIR)
    run_seed(conn)
    return conn


def test_transfer_moves_balance_between_accounts():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        sbi = create_account(AccountCreate(name="SBI", account_type="savings", opening_balance_paise=500000), conn)

        create_transfer(
            TransferCreate(business_date="2026-08-04", from_account_id=sbi["id"],
                            to_account_id=cash_id, amount_paise=500000),
            conn,
        )

        assert account_balance(conn, sbi["id"]) == 0
        assert account_balance(conn, cash_id) == 500000

        conn.close()


def test_transfer_to_same_account_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]

        try:
            create_transfer(
                TransferCreate(business_date="2026-08-04", from_account_id=cash_id,
                                to_account_id=cash_id, amount_paise=100),
                conn,
            )
            assert False, "transferring to the same account must be rejected"
        except Exception as e:
            assert "400" in str(e) or "same account" in str(e)

        conn.close()


def test_transfer_with_malformed_business_date_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        sbi = create_account(AccountCreate(name="SBI", account_type="savings", opening_balance_paise=500000), conn)

        try:
            create_transfer(
                TransferCreate(business_date="2026-13-45", from_account_id=sbi["id"],
                                to_account_id=cash_id, amount_paise=500000),
                conn,
            )
            assert False, "a malformed business_date must be rejected"
        except Exception as e:
            assert "400" in str(e)

        assert conn.execute("SELECT COUNT(*) FROM account_transfers").fetchone()[0] == 0

        conn.close()


def test_transfer_from_deactivated_account_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        sbi = create_account(AccountCreate(name="SBI", account_type="savings", opening_balance_paise=500000), conn)
        update_account(sbi["id"], AccountUpdate(is_active=False), conn)

        try:
            create_transfer(
                TransferCreate(business_date="2026-08-04", from_account_id=sbi["id"],
                                to_account_id=cash_id, amount_paise=100),
                conn,
            )
            assert False, "a transfer from a deactivated account must be rejected"
        except Exception as e:
            assert "400" in str(e)

        conn.close()


def test_transfer_to_deactivated_account_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        hdfc = create_account(AccountCreate(name="HDFC", account_type="savings", opening_balance_paise=500000), conn)
        sbi = create_account(AccountCreate(name="SBI", account_type="savings", opening_balance_paise=0), conn)
        update_account(sbi["id"], AccountUpdate(is_active=False), conn)

        try:
            create_transfer(
                TransferCreate(business_date="2026-08-04", from_account_id=hdfc["id"],
                                to_account_id=sbi["id"], amount_paise=100),
                conn,
            )
            assert False, "a transfer to a deactivated account must be rejected"
        except Exception as e:
            assert "400" in str(e)

        conn.close()


def test_transfer_exceeding_balance_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        sbi = create_account(AccountCreate(name="SBI", account_type="savings", opening_balance_paise=0), conn)
        balance_before = account_balance(conn, cash_id)

        try:
            create_transfer(
                TransferCreate(business_date="2026-08-04", from_account_id=cash_id,
                                to_account_id=sbi["id"], amount_paise=balance_before + 100),
                conn,
            )
            assert False, "a transfer exceeding the source balance must be rejected"
        except Exception as e:
            assert "400" in str(e) or "insufficient" in str(e)

        assert account_balance(conn, cash_id) == balance_before

        conn.close()


def test_list_transfers_includes_account_names():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        sbi = create_account(AccountCreate(name="SBI", account_type="savings", opening_balance_paise=500000), conn)

        create_transfer(
            TransferCreate(business_date="2026-08-04", from_account_id=sbi["id"],
                            to_account_id=cash_id, amount_paise=500000),
            conn,
        )

        rows = list_transfers(20, conn)
        assert len(rows) == 1
        assert rows[0]["from_account_name"] == "SBI"
        assert rows[0]["to_account_name"] == "Cash Drawer"
        assert rows[0]["amount_paise"] == 500000

        conn.close()


def test_concurrent_transfers_never_drive_balance_negative():
    # H.11/H.5: without begin_write, N concurrent transfers from the same
    # account all read the same pre-state balance and all pass the guard.
    # Each thread here opens its own connection, like a real concurrent
    # request would via Depends(get_db).
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "test.db"
        setup = get_connection(db_path)
        run_migrations(setup, MIGRATIONS_DIR)
        run_seed(setup)
        cash_id = setup.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        sbi = create_account(AccountCreate(name="SBI", account_type="savings", opening_balance_paise=100000), setup)
        setup.close()

        results = []

        def transfer():
            conn = get_connection(db_path)
            try:
                r = create_transfer(
                    TransferCreate(business_date="2026-08-04", from_account_id=sbi["id"],
                                    to_account_id=cash_id, amount_paise=100000),
                    conn,
                )
                results.append(("ok", r))
            except Exception as e:  # noqa: BLE001 — capturing to assert from the main thread
                results.append(("err", e))
            finally:
                conn.close()

        threads = [threading.Thread(target=transfer) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        oks = [r for kind, r in results if kind == "ok"]
        errs = [r for kind, r in results if kind == "err"]
        assert len(oks) == 1, f"expected exactly 1 success against a fully-covering balance, got {len(oks)}"
        assert len(errs) == 9

        check = get_connection(db_path)
        assert account_balance(check, sbi["id"]) == 0, "source balance must never go negative"
        check.close()


if __name__ == "__main__":
    test_transfer_moves_balance_between_accounts()
    test_transfer_to_same_account_rejected()
    test_transfer_with_malformed_business_date_rejected()
    test_transfer_from_deactivated_account_rejected()
    test_transfer_to_deactivated_account_rejected()
    test_transfer_exceeding_balance_rejected()
    test_list_transfers_includes_account_names()
    test_concurrent_transfers_never_drive_balance_negative()
    print("OK")
