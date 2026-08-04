"""Self-check for the expenses API (PLAN 4.1). Calls the route function
directly against a temp DB. Run: python tests/test_expenses.py"""
import sys
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import HTTPException

from app.accounts import AccountCreate, AccountUpdate, create_account, update_account
from app.db import get_connection, run_migrations
from app.expenses import (
    CategoryCreate,
    ExpenseCreate,
    ExpenseUpdate,
    add_category,
    create_expense,
    delete_expense,
    get_expense,
    list_categories,
    list_expenses,
    update_expense,
)
from app.ledger import account_balance
from app.seed import run_seed

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def _seeded_conn(tmp: Path):
    conn = get_connection(tmp / "test.db")
    run_migrations(conn, MIGRATIONS_DIR)
    run_seed(conn)
    return conn


def _funded_cash(conn) -> int:
    """The seeded Cash Drawer opens at ₹0 (app/seed.py) — expense tests need
    a funded account to spend from."""
    return create_account(
        AccountCreate(name="Cash Drawer Funded", account_type="cash", opening_balance_paise=100000), conn
    )["id"]


def _run_barrier_synced(fns) -> list[tuple[str, object]]:
    """Run each zero-arg callable in its own thread, barrier-synced so they
    all fire together. Returns ("ok", return-value) or ("err", exception)
    per callable, in order — shared by both H.23 races below."""
    barrier = threading.Barrier(len(fns))

    def wrap(fn):
        barrier.wait()
        try:
            return ("ok", fn())
        except Exception as e:  # noqa: BLE001 — capturing to assert from the main thread
            return ("err", e)

    with ThreadPoolExecutor(max_workers=len(fns)) as pool:
        return list(pool.map(wrap, fns))


def test_expense_lowers_balance_and_posts_negative_ledger_entry():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = _funded_cash(conn)
        cash_before = account_balance(conn, cash_id)

        expense = create_expense(
            ExpenseCreate(business_date="2026-08-04", category="Paper", amount_paise=35000, account_id=cash_id),
            conn,
        )

        assert account_balance(conn, cash_id) == cash_before - 35000
        row = conn.execute(
            "SELECT * FROM ledger WHERE source_type = 'expense' AND source_id = ?", (expense["id"],)
        ).fetchone()
        assert row["entry_type"] == "expense"
        assert row["amount_paise"] == -35000

        conn.close()


def test_malformed_business_date_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = _funded_cash(conn)

        try:
            create_expense(
                ExpenseCreate(business_date="2026-13-45", category="Paper", amount_paise=100, account_id=cash_id),
                conn,
            )
            assert False, "a malformed business_date must be rejected"
        except HTTPException as e:
            assert e.status_code == 400

        assert conn.execute("SELECT COUNT(*) FROM expenses").fetchone()[0] == 0

        conn.close()


def test_expense_from_deactivated_account_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        sbi = create_account(AccountCreate(name="SBI", account_type="savings", opening_balance_paise=100000), conn)
        update_account(sbi["id"], AccountUpdate(is_active=False), conn)

        try:
            create_expense(
                ExpenseCreate(business_date="2026-08-04", category="Rent", amount_paise=100, account_id=sbi["id"]),
                conn,
            )
            assert False, "an expense from a deactivated account must be rejected"
        except HTTPException as e:
            assert e.status_code == 400

        conn.close()


def test_expense_exceeding_balance_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = _funded_cash(conn)
        cash_before = account_balance(conn, cash_id)

        try:
            create_expense(
                ExpenseCreate(business_date="2026-08-04", category="Rent",
                               amount_paise=cash_before + 100, account_id=cash_id),
                conn,
            )
            assert False, "an expense exceeding the account balance must be rejected"
        except HTTPException as e:
            assert e.status_code == 400

        assert account_balance(conn, cash_id) == cash_before

        conn.close()


def test_list_and_get_and_filters():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = _funded_cash(conn)
        create_expense(ExpenseCreate(business_date="2026-08-04", category="Paper", amount_paise=1000, account_id=cash_id), conn)
        create_expense(ExpenseCreate(business_date="2026-08-05", category="Ink", amount_paise=2000, account_id=cash_id), conn)

        all_result = list_expenses(None, None, 50, 0, conn)
        assert all_result["total"] == 2

        by_date = list_expenses("2026-08-04", None, 50, 0, conn)
        assert by_date["total"] == 1 and by_date["items"][0]["category"] == "Paper"

        by_category = list_expenses(None, "Ink", 50, 0, conn)
        assert by_category["total"] == 1 and by_category["items"][0]["amount_paise"] == 2000

        fetched = get_expense(by_category["items"][0]["id"], conn)
        assert fetched["category"] == "Ink"

        conn.close()


def test_category_and_note_update_does_not_touch_ledger():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = _funded_cash(conn)
        expense = create_expense(
            ExpenseCreate(business_date="2026-08-04", category="Paper", amount_paise=1000, account_id=cash_id), conn
        )
        balance_before = account_balance(conn, cash_id)

        updated = update_expense(expense["id"], ExpenseUpdate(category="Ink", note="switched"), conn)
        assert updated["category"] == "Ink"
        assert account_balance(conn, cash_id) == balance_before

        count = conn.execute(
            "SELECT COUNT(*) FROM ledger WHERE source_type = 'expense' AND source_id = ?", (expense["id"],)
        ).fetchone()[0]
        assert count == 1

        conn.close()


def test_amount_correction_moves_the_ledger_via_reversal_and_replacement():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = _funded_cash(conn)
        expense = create_expense(
            ExpenseCreate(business_date="2026-08-04", category="Paper", amount_paise=1000, account_id=cash_id), conn
        )
        balance_before = account_balance(conn, cash_id)

        updated = update_expense(expense["id"], ExpenseUpdate(amount_paise=1500), conn)
        assert updated["amount_paise"] == 1500
        assert account_balance(conn, cash_id) == balance_before - 500

        rows = conn.execute(
            "SELECT * FROM ledger WHERE source_type = 'expense' AND source_id = ? ORDER BY id", (expense["id"],)
        ).fetchall()
        assert len(rows) == 3
        assert rows[0]["amount_paise"] == -1000
        assert rows[1]["entry_type"] == "reversal" and rows[1]["reverses_id"] == rows[0]["id"]
        assert rows[2]["amount_paise"] == -1500

        conn.close()


def test_note_correction_then_amount_correction_uses_current_note():
    # H.27: the money-changing branch's new ledger row must carry the
    # expense's *current* note, not the pre-edit ledger row's description.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = _funded_cash(conn)
        expense = create_expense(
            ExpenseCreate(
                business_date="2026-08-04", category="Paper", amount_paise=1000,
                account_id=cash_id, note="ORIGINAL NOTE",
            ), conn
        )

        update_expense(expense["id"], ExpenseUpdate(note="CORRECTED NOTE"), conn)
        updated = update_expense(expense["id"], ExpenseUpdate(amount_paise=1200), conn)
        assert updated["note"] == "CORRECTED NOTE"

        entry = conn.execute(
            "SELECT description FROM ledger WHERE source_type = 'expense' AND source_id = ? "
            "ORDER BY id DESC LIMIT 1", (expense["id"],)
        ).fetchone()
        assert entry["description"] == "CORRECTED NOTE", entry["description"]

        conn.close()


def test_account_correction_moves_the_ledger_between_accounts():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = _funded_cash(conn)
        sbi = create_account(AccountCreate(name="SBI", account_type="savings", opening_balance_paise=100000), conn)
        expense = create_expense(
            ExpenseCreate(business_date="2026-08-04", category="Rent", amount_paise=1000, account_id=cash_id), conn
        )
        cash_before = account_balance(conn, cash_id)
        sbi_before = account_balance(conn, sbi["id"])

        updated = update_expense(expense["id"], ExpenseUpdate(account_id=sbi["id"]), conn)
        assert updated["account_id"] == sbi["id"]
        assert account_balance(conn, cash_id) == cash_before + 1000
        assert account_balance(conn, sbi["id"]) == sbi_before - 1000

        conn.close()


def test_amount_only_patch_onto_deactivated_account_rejected():
    # H.24: the destination-account check must fire whenever money moves,
    # not only when account_id is present in the payload — an amount-only
    # PATCH implicitly keeps paying from the (now deactivated) account.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = _funded_cash(conn)
        expense = create_expense(
            ExpenseCreate(business_date="2026-08-04", category="Paper", amount_paise=1000, account_id=cash_id), conn
        )
        update_account(cash_id, AccountUpdate(is_active=False), conn)

        try:
            update_expense(expense["id"], ExpenseUpdate(amount_paise=1500), conn)
            assert False, "an amount edit that keeps paying from a deactivated account must be rejected"
        except HTTPException as e:
            assert e.status_code == 400

        conn.close()


def test_delete_reverses_ledger_entry_and_soft_deletes():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cash_id = _funded_cash(conn)
        expense = create_expense(
            ExpenseCreate(business_date="2026-08-04", category="Paper", amount_paise=1000, account_id=cash_id), conn
        )
        balance_before = account_balance(conn, cash_id)

        delete_expense(expense["id"], conn)

        assert account_balance(conn, cash_id) == balance_before + 1000
        try:
            get_expense(expense["id"], conn)
            assert False, "a deleted expense must not be reachable via get"
        except HTTPException as e:
            assert e.status_code == 404

        rows = conn.execute(
            "SELECT * FROM ledger WHERE source_type = 'expense' AND source_id = ? ORDER BY id", (expense["id"],)
        ).fetchall()
        assert len(rows) == 2
        assert rows[1]["entry_type"] == "reversal"

        conn.close()


def test_unknown_expense_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        try:
            get_expense(999999, conn)
            assert False, "an unknown expense_id must be rejected"
        except HTTPException as e:
            assert e.status_code == 404
        conn.close()


def test_out_of_range_expense_id_returns_404_not_500():
    # H.26: an id outside SQLite's 64-bit range used to raise OverflowError
    # from _get_or_404, shared by GET/PATCH/DELETE — checking it once here
    # covers all three.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        for expense_id in (99999999999999999999, -99999999999999999999):
            try:
                get_expense(expense_id, conn)
                assert False, f"expected 404 for out-of-range id {expense_id}"
            except HTTPException as e:
                assert e.status_code == 404, e.status_code
        conn.close()


def test_explicit_null_on_not_null_field_rejected():
    try:
        ExpenseUpdate.model_validate({"category": None})
        assert False, "explicit null on a NOT NULL field must be rejected"
    except Exception:
        pass


def test_concurrent_expenses_never_drive_balance_negative():
    # H.11/H.5: same reasoning as transfers — without begin_write, N
    # concurrent expenses against the same account all read the same
    # pre-state balance and all pass the guard.
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "test.db"
        setup = get_connection(db_path)
        run_migrations(setup, MIGRATIONS_DIR)
        run_seed(setup)
        sbi = create_account(AccountCreate(name="SBI", account_type="savings", opening_balance_paise=100000), setup)
        setup.close()

        results = []

        def spend():
            conn = get_connection(db_path)
            try:
                r = create_expense(
                    ExpenseCreate(business_date="2026-08-04", category="Rent",
                                   amount_paise=100000, account_id=sbi["id"]),
                    conn,
                )
                results.append(("ok", r))
            except Exception as e:  # noqa: BLE001 — capturing to assert from the main thread
                results.append(("err", e))
            finally:
                conn.close()

        threads = [threading.Thread(target=spend) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        oks = [r for kind, r in results if kind == "ok"]
        errs = [r for kind, r in results if kind == "err"]
        assert len(oks) == 1, f"expected exactly 1 success against a fully-covering balance, got {len(oks)}"
        assert len(errs) == 9

        check = get_connection(db_path)
        assert account_balance(check, sbi["id"]) == 0, "balance must never go negative"
        check.close()


def test_concurrent_delete_of_one_expense_yields_exactly_one_success():
    # H.23: without begin_write, N concurrent deletes all read the same live
    # entry as unreversed and race to reverse it, tripping ledger.py's
    # already-reversed guard or the migration-003 unique index as a 500.
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "test.db"
        setup = _seeded_conn(Path(tmp))
        cash_id = _funded_cash(setup)
        expense = create_expense(
            ExpenseCreate(business_date="2026-08-04", category="Paper", amount_paise=1000, account_id=cash_id), setup
        )
        setup.close()

        def delete_once():
            conn = get_connection(db_path)
            try:
                delete_expense(expense["id"], conn)
            finally:
                conn.close()

        results = _run_barrier_synced([delete_once] * 12)
        crashes = [e for kind, e in results if kind == "err" and not isinstance(e, HTTPException)]
        assert not crashes, f"expected only HTTPExceptions (404s), got a crash: {crashes}"
        not_founds = [e for kind, e in results if kind == "err" and e.status_code == 404]
        oks = [r for kind, r in results if kind == "ok"]
        assert len(oks) == 1, f"expected exactly one successful delete, got {len(oks)}"
        assert len(not_founds) == 11, f"expected eleven 404s, got {len(not_founds)}"

        check = get_connection(db_path)
        rows = check.execute(
            "SELECT * FROM ledger WHERE source_type = 'expense' AND source_id = ? ORDER BY id", (expense["id"],)
        ).fetchall()
        assert len(rows) == 2 and rows[1]["entry_type"] == "reversal"
        check.close()


def test_concurrent_delete_racing_amount_correction_leaves_a_consistent_end_state():
    # H.23: the same lock also has to hold across a delete racing a
    # money-changing PATCH on the same expense — either the delete wins
    # (reversed, soft-deleted) or the correction wins (exactly one live
    # entry), never a 500 on either side and never both.
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "test.db"
        setup = _seeded_conn(Path(tmp))
        cash_id = _funded_cash(setup)
        expense = create_expense(
            ExpenseCreate(business_date="2026-08-04", category="Paper", amount_paise=1000, account_id=cash_id), setup
        )
        setup.close()

        def delete_once():
            conn = get_connection(db_path)
            try:
                delete_expense(expense["id"], conn)
            finally:
                conn.close()

        def correct_once():
            conn = get_connection(db_path)
            try:
                update_expense(expense["id"], ExpenseUpdate(amount_paise=1200), conn)
            finally:
                conn.close()

        results = _run_barrier_synced([delete_once] * 6 + [correct_once] * 6)
        crashes = [e for kind, e in results if kind == "err" and not isinstance(e, HTTPException)]
        assert not crashes, f"expected only HTTPExceptions on the losing side, got a crash: {crashes}"

        check = get_connection(db_path)
        expense_row = check.execute("SELECT deleted_at FROM expenses WHERE id = ?", (expense["id"],)).fetchone()
        live_rows = check.execute(
            "SELECT * FROM ledger WHERE source_type = 'expense' AND source_id = ? "
            "AND entry_type = 'expense' AND id NOT IN "
            "(SELECT reverses_id FROM ledger WHERE reverses_id IS NOT NULL)", (expense["id"],)
        ).fetchall()
        if expense_row["deleted_at"] is not None:
            assert len(live_rows) == 0, "a deleted expense must have no live ledger entry"
        else:
            assert len(live_rows) == 1, f"expected exactly one live ledger entry, found {len(live_rows)}"
        check.close()


def test_seeded_categories_listed():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        cats = list_categories(conn)["categories"]
        assert cats == ["Rent", "Internet", "Electricity", "Paper", "Ink", "Repairs", "Miscellaneous"]
        conn.close()


def test_add_category_persists_and_appears_in_expense_form_options():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        result = add_category(CategoryCreate(name="Fuel"), conn)
        assert result["categories"][-1] == "Fuel"
        assert list_categories(conn)["categories"] == result["categories"]

        cash_id = _funded_cash(conn)
        expense = create_expense(
            ExpenseCreate(business_date="2026-08-04", category="Fuel", amount_paise=15000, account_id=cash_id),
            conn,
        )
        assert expense["category"] == "Fuel"
        conn.close()


def test_add_duplicate_category_is_a_no_op():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        before = list_categories(conn)["categories"]
        after = add_category(CategoryCreate(name="Rent"), conn)["categories"]
        assert after == before
        conn.close()


def test_blank_category_name_rejected():
    try:
        CategoryCreate(name="   ")
        raise AssertionError("expected validation error")
    except Exception as e:
        assert "ValidationError" in type(e).__name__


def test_comma_in_category_name_does_not_corrupt_the_list():
    # H.22: categories used to be comma-joined with no escaping, so a name
    # containing a comma split into extra entries on read.
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        add_category(CategoryCreate(name="A, B"), conn)
        cats = list_categories(conn)["categories"]
        assert cats.count("A, B") == 1, cats

        add_category(CategoryCreate(name="A, B"), conn)
        after = list_categories(conn)["categories"]
        assert after == cats, "reposting the identical name must be a no-op"

        conn.close()


def test_concurrent_add_category_never_loses_a_write():
    # H.21: same read-append-write race as H.11, on the settings row instead
    # of the ledger. 12 distinct names in parallel must all persist.
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "test.db"
        setup = _seeded_conn(Path(tmp))
        setup.close()

        barrier = threading.Barrier(12)
        errors = []

        def add(name):
            conn = get_connection(db_path)
            try:
                barrier.wait()
                add_category(CategoryCreate(name=name), conn)
            except Exception as e:  # noqa: BLE001 — capturing to assert from the main thread
                errors.append(e)
            finally:
                conn.close()

        names = [f"Cat{i}" for i in range(12)]
        threads = [threading.Thread(target=add, args=(n,)) for n in names]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert not errors, f"unexpected errors: {errors}"
        check = get_connection(db_path)
        persisted = list_categories(check)["categories"]
        check.close()
        for n in names:
            assert n in persisted, f"{n} lost — persisted only {persisted}"


if __name__ == "__main__":
    test_expense_lowers_balance_and_posts_negative_ledger_entry()
    test_malformed_business_date_rejected()
    test_expense_from_deactivated_account_rejected()
    test_expense_exceeding_balance_rejected()
    test_list_and_get_and_filters()
    test_category_and_note_update_does_not_touch_ledger()
    test_amount_correction_moves_the_ledger_via_reversal_and_replacement()
    test_note_correction_then_amount_correction_uses_current_note()
    test_account_correction_moves_the_ledger_between_accounts()
    test_amount_only_patch_onto_deactivated_account_rejected()
    test_delete_reverses_ledger_entry_and_soft_deletes()
    test_unknown_expense_rejected()
    test_out_of_range_expense_id_returns_404_not_500()
    test_explicit_null_on_not_null_field_rejected()
    test_concurrent_expenses_never_drive_balance_negative()
    test_concurrent_delete_of_one_expense_yields_exactly_one_success()
    test_concurrent_delete_racing_amount_correction_leaves_a_consistent_end_state()
    test_seeded_categories_listed()
    test_add_category_persists_and_appears_in_expense_form_options()
    test_add_duplicate_category_is_a_no_op()
    test_blank_category_name_rejected()
    test_comma_in_category_name_does_not_corrupt_the_list()
    test_concurrent_add_category_never_loses_a_write()
    print("OK")
