"""Self-check for backup/restore (PLAN 8.5/8.6). Run: python tests/test_backup.py"""
import sqlite3
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import tempfile

from fastapi import HTTPException

from app.accounts import AccountCreate, create_account
from app.backup import create_backup, restore_backup
from app.db import get_connection, run_migrations
from app.ledger import closing_balance
from app.seed import run_seed
from app.transfers import TransferCreate, create_transfer

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def _seeded_conn(db_path: Path):
    conn = get_connection(db_path)
    run_migrations(conn, MIGRATIONS_DIR)
    run_seed(conn)
    return conn


def test_backup_is_a_valid_sqlite_file_openable_while_the_app_runs():
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        db_path = tmp / "cscms.db"
        conn = _seeded_conn(db_path)
        backups_dir = tmp / "backups"

        backup_path = create_backup(conn, db_path, backups_dir)
        assert backup_path.is_file()

        # the live connection is unaffected — VACUUM INTO doesn't lock it out
        conn.execute("SELECT 1").fetchone()

        check = sqlite3.connect(backup_path)
        tables = {r[0] for r in check.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert "ledger" in tables and "users" in tables
        check.close()
        conn.close()


def test_retention_keeps_only_the_last_n():
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        db_path = tmp / "cscms.db"
        conn = _seeded_conn(db_path)
        conn.execute("UPDATE settings SET value = '2' WHERE key = 'backup_retention_count'")
        conn.commit()
        backups_dir = tmp / "backups"

        for _ in range(4):
            create_backup(conn, db_path, backups_dir)
            time.sleep(0.001)  # keeps timestamps (and filenames) distinct

        files = list(backups_dir.glob("*.db"))
        assert len(files) == 2, len(files)
        conn.close()


def test_restore_reproduces_balances_exactly():
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        db_path = tmp / "cscms.db"
        conn = _seeded_conn(db_path)
        backups_dir = tmp / "backups"

        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        sbi = create_account(AccountCreate(name="SBI", account_type="settlement", opening_balance_paise=600000), conn)
        create_transfer(TransferCreate(business_date="2024-11-10", from_account_id=sbi["id"], to_account_id=cash_id, amount_paise=500000), conn)
        conn.commit()
        balance_before = closing_balance(conn, cash_id, "2024-11-10")

        backup_path = create_backup(conn, db_path, backups_dir)

        # mutate further after the backup was taken
        create_transfer(TransferCreate(business_date="2024-11-10", from_account_id=sbi["id"], to_account_id=cash_id, amount_paise=100000), conn)
        conn.commit()
        assert closing_balance(conn, cash_id, "2024-11-10") == balance_before + 100000

        restore_backup(conn, db_path, backups_dir, backup_path.name)  # closes conn as part of the swap

        restored = get_connection(db_path)
        assert closing_balance(restored, cash_id, "2024-11-10") == balance_before
        restored.close()


def test_restore_of_the_oldest_backup_at_retention_cap_succeeds():
    # H.45: restore_endpoint calls create_backup() as a safety copy of the
    # current state before restoring — without `keep`, that safety copy's
    # own retention sweep could evict the very file about to be restored
    # once the count is already at the cap (the normal steady state, since
    # on_shutdown backs up on every close).
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        db_path = tmp / "cscms.db"
        conn = _seeded_conn(db_path)
        backups_dir = tmp / "backups"

        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        sbi = create_account(AccountCreate(name="SBI", account_type="settlement", opening_balance_paise=600000), conn)
        create_transfer(TransferCreate(business_date="2024-11-11", from_account_id=sbi["id"], to_account_id=cash_id, amount_paise=500000), conn)
        conn.commit()
        balance_before = closing_balance(conn, cash_id, "2024-11-11")

        for _ in range(5):  # default backup_retention_count
            create_backup(conn, db_path, backups_dir)
            time.sleep(0.001)
        oldest = sorted(backups_dir.glob("*.db"))[0].name

        # mutate further, then restore the oldest exactly as restore_endpoint does
        create_transfer(TransferCreate(business_date="2024-11-11", from_account_id=sbi["id"], to_account_id=cash_id, amount_paise=100000), conn)
        conn.commit()
        create_backup(conn, db_path, backups_dir, keep=oldest)  # safety copy, must not evict `oldest`
        restore_backup(conn, db_path, backups_dir, oldest)  # would 404 pre-fix

        restored = get_connection(db_path)
        assert closing_balance(restored, cash_id, "2024-11-11") == balance_before
        restored.close()


def test_concurrent_backup_creation_all_succeed():
    # H.46: create_backup's retention sweep (bare glob() + unlink(), no
    # locking) let one request delete a file a concurrent request had just
    # created but not yet returned — FileNotFoundError on the creator's own
    # stat(), or PermissionError racing two unlink()s on the same file.
    # Each thread opens its own connection, like a real concurrent request
    # would (same technique as test_db.py::test_concurrent_writers_do_not_error).
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        db_path = tmp / "cscms.db"
        setup = _seeded_conn(db_path)
        setup.close()
        backups_dir = tmp / "backups"

        errors = []
        paths = []

        def make_backup():
            try:
                c = get_connection(db_path)
                p = create_backup(c, db_path, backups_dir)
                c.close()
                paths.append(p)
            except Exception as e:  # noqa: BLE001
                errors.append(e)

        threads = [threading.Thread(target=make_backup) for _ in range(12)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert not errors, f"concurrent create_backup() calls failed: {errors}"
        assert len(paths) == 12
        assert len(set(paths)) == 12, "every concurrent backup must get a distinct filename"

        remaining = list(backups_dir.glob("*.db"))
        assert len(remaining) == 5, f"expected retention cap of 5, got {len(remaining)}"  # default backup_retention_count


def test_restore_rejects_a_path_outside_the_backups_dir():
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        db_path = tmp / "cscms.db"
        conn = _seeded_conn(db_path)
        backups_dir = tmp / "backups"
        backups_dir.mkdir()

        try:
            restore_backup(conn, db_path, backups_dir, "../cscms.db")
            assert False, "a path escaping the backups dir must be rejected"
        except HTTPException as e:
            assert e.status_code == 404
        conn.close()


def test_restore_rejects_a_non_sqlite_file():
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        db_path = tmp / "cscms.db"
        conn = _seeded_conn(db_path)
        backups_dir = tmp / "backups"
        backups_dir.mkdir()
        (backups_dir / "junk.db").write_text("not a database")

        try:
            restore_backup(conn, db_path, backups_dir, "junk.db")
            assert False, "a non-SQLite file must be rejected"
        except HTTPException as e:
            assert e.status_code == 400
        conn.close()


if __name__ == "__main__":
    test_backup_is_a_valid_sqlite_file_openable_while_the_app_runs()
    test_retention_keeps_only_the_last_n()
    test_restore_reproduces_balances_exactly()
    test_restore_of_the_oldest_backup_at_retention_cap_succeeds()
    test_concurrent_backup_creation_all_succeed()
    test_restore_rejects_a_path_outside_the_backups_dir()
    test_restore_rejects_a_non_sqlite_file()
    print("OK")
