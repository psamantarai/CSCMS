"""The ledger core (ARCHITECTURE.md §2/§3): append-only inserts, balance by
summation. No update or delete path exists here — the DB trigger in
002_ledger_immutable.sql rejects both regardless."""
import sqlite3
from datetime import date

from fastapi import APIRouter, Depends, HTTPException

from app.db import get_db

router = APIRouter(prefix="/api/ledger", tags=["ledger"])

MAX_LEDGER_LIMIT = 500  # H.6: documented cap; out-of-range limit snaps here instead of hitting SQLite's "negative = no limit"

ENTRY_TYPES = {
    "service_income", "commission", "expense", "transfer",
    "customer_payment", "adjustment", "opening_balance", "reversal",
}


def validate_business_date(business_date: str) -> None:
    """H.2/H.13: business_date is TEXT and every query orders/filters on it
    lexically, so one malformed value silently corrupts ordering, date
    filters and opening-balance/day-close derivation downstream. insert_entry
    is the only path *into the ledger*, not the only path that writes a
    business_date column (transactions.py writes its own row before ever
    reaching the ledger, and skips it entirely for an unpaid bill) — so this
    is shared and called at each write path's boundary, not only here."""
    try:
        date.fromisoformat(business_date)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"invalid business_date: {business_date!r}")


def ensure_business_day_open(conn: sqlite3.Connection, business_date: str) -> None:
    """PLAN 6.1/6.3: the business_days lifecycle's single choke point. Lazily
    opens business_date on its first write (no row is seeded up front —
    ARCHITECTURE.md §5.1) and rejects the write with 409 once that date is
    closed. Called from insert_entry (skipped for entry_type='reversal' —
    see there) plus each write path's own boundary for requests that might
    never reach insert_entry, the same two-tier pattern validate_business_date
    already uses for H.2/H.13."""
    row = conn.execute(
        "SELECT status FROM business_days WHERE business_date = ?", (business_date,)
    ).fetchone()
    if row is None:
        # OR IGNORE: two concurrent first-writers to the same fresh date can
        # both see no row and both try to insert it; the loser's insert is a
        # no-op against the business_date PK instead of an IntegrityError —
        # harmless, since both agree the date should end up open.
        conn.execute("INSERT OR IGNORE INTO business_days (business_date, status) VALUES (?, 'open')", (business_date,))
        return
    if row["status"] == "closed":
        raise HTTPException(status_code=409, detail=f"business day {business_date} is closed")


def insert_entry(
    conn: sqlite3.Connection,
    *,
    business_date: str,
    account_id: int,
    amount_paise: int,
    entry_type: str,
    source_type: str,
    created_by: int,
    source_id: int | None = None,
    description: str | None = None,
    reverses_id: int | None = None,
) -> int:
    if entry_type not in ENTRY_TYPES:
        raise ValueError(f"invalid entry_type: {entry_type}")
    validate_business_date(business_date)
    # A reversal is exempt: ARCHITECTURE.md §5's back-dating note has it
    # referencing the original (possibly now-closed) entry's own date, and
    # reverse_entry() defaults business_date to exactly that — the guard
    # would otherwise make even a pure deletion of anything dated on a
    # closed day permanently impossible. Fresh entries and correction
    # *replacements* (same entry_type as the resource, e.g.
    # 'expense'/'transfer'/'commission') still go through the guard below —
    # so today, a money-changing correction of a closed-day resource is
    # rejected outright rather than posted onto the closed date.
    # ponytail: §5 actually wants that replacement redirected onto the
    # current *open* date instead of rejected; that redirect isn't built
    # (no phase step names it yet) — add it if/when back-dated corrections
    # need to succeed rather than fail.
    if entry_type != "reversal":
        ensure_business_day_open(conn, business_date)
    cur = conn.execute(
        "INSERT INTO ledger "
        "(business_date, account_id, amount_paise, entry_type, source_type, source_id, description, reverses_id, created_by) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (business_date, account_id, amount_paise, entry_type, source_type, source_id, description, reverses_id, created_by),
    )
    return cur.lastrowid


def account_balance(conn: sqlite3.Connection, account_id: int) -> int:
    row = conn.execute(
        "SELECT SUM(amount_paise) FROM ledger WHERE account_id = ?", (account_id,)
    ).fetchone()
    return row[0] or 0


def opening_balance(conn: sqlite3.Connection, account_id: int, business_date: str) -> int:
    """PLAN 6.2: day D's opening balance is the sum of every ledger entry
    strictly before D — no daily_account_balance row is copied forward. This
    also means it equals D-1's closing balance for free (D-1's closing is
    the sum of everything up to and including D-1, i.e. everything < D)."""
    row = conn.execute(
        "SELECT SUM(amount_paise) FROM ledger WHERE account_id = ? AND business_date < ?",
        (account_id, business_date),
    ).fetchone()
    return row[0] or 0


def closing_balance(conn: sqlite3.Connection, account_id: int, business_date: str) -> int:
    """PLAN 6.4/6.5: day D's closing balance — every entry dated on or
    before D. The authoritative figure daily_account_balance snapshots and
    the closing report both use; opening_balance(D+1) == closing_balance(D)."""
    row = conn.execute(
        "SELECT SUM(amount_paise) FROM ledger WHERE account_id = ? AND business_date <= ?",
        (account_id, business_date),
    ).fetchone()
    return row[0] or 0


def with_reversals_sql(*entry_types: str, alias: str = "") -> str:
    """Boolean SQL fragment: true for a row whose entry_type is one of
    entry_types, OR is the reversal of one (PLAN 7.8). A correction/delete
    posts a same-typed original plus an entry_type='reversal' offsetting row
    (transactions.py/expenses.py/banking.py) — filtering on entry_type alone
    counts the original without netting its reversal, double-counting
    against the replacement that follows. Entry types are hardcoded literals
    at every call site, never user input, so this string-builds safely."""
    prefix = f"{alias}." if alias else ""
    types_sql = ", ".join(f"'{t}'" for t in entry_types)
    return (
        f"({prefix}entry_type IN ({types_sql}) OR {prefix}reverses_id IN "
        f"(SELECT id FROM ledger WHERE entry_type IN ({types_sql})))"
    )


def income_expenses(conn: sqlite3.Connection, start_date: str, end_date: str) -> tuple[int, int]:
    """PLAN 7.1/7.3: income (service_income + commission) and expenses for
    [start_date, end_date] inclusive. ARCHITECTURE.md §4 lists "Customer
    payments" as a ledger source distinct from "Service income"/"Banking
    commission" — settling an old bill is debt collection, not new revenue —
    so entry_type='customer_payment' is deliberately excluded here. Shared by
    the dashboard tiles and the daily/monthly reports so both agree on what
    "income" means."""
    income_pred = with_reversals_sql("service_income", "commission")
    expense_pred = with_reversals_sql("expense")
    row = conn.execute(
        f"SELECT "
        f"COALESCE(SUM(CASE WHEN {income_pred} THEN amount_paise ELSE 0 END), 0) AS income_paise, "
        f"COALESCE(SUM(CASE WHEN {expense_pred} THEN -amount_paise ELSE 0 END), 0) AS expenses_paise "
        f"FROM ledger WHERE business_date BETWEEN ? AND ?",
        (start_date, end_date),
    ).fetchone()
    return row["income_paise"], row["expenses_paise"]


def insert_transfer_pair(
    conn: sqlite3.Connection,
    *,
    business_date: str,
    from_account_id: int,
    to_account_id: int,
    amount_paise: int,
    source_id: int,
    created_by: int,
    description: str | None = None,
) -> tuple[int, int]:
    """Two ledger rows (-amount, +amount) in one DB transaction. Any failure —
    including a forced one on the second insert — rolls back both."""
    try:
        out_id = insert_entry(
            conn, business_date=business_date, account_id=from_account_id,
            amount_paise=-amount_paise, entry_type="transfer", source_type="account_transfer",
            source_id=source_id, description=description, created_by=created_by,
        )
        in_id = insert_entry(
            conn, business_date=business_date, account_id=to_account_id,
            amount_paise=amount_paise, entry_type="transfer", source_type="account_transfer",
            source_id=source_id, description=description, created_by=created_by,
        )
    except Exception:
        conn.rollback()
        raise
    return out_id, in_id


def insert_banking_entries(
    conn: sqlite3.Connection,
    *,
    business_date: str,
    txn_type: str,
    principal_paise: int,
    commission_paise: int,
    settlement_account_id: int,
    cash_account_id: int,
    source_id: int,
    created_by: int,
    description: str | None = None,
) -> list[int]:
    """ARCHITECTURE.md §3 banking event -> ledger mapping (PLAN 5.1). Every
    txn_type except balance_enquiry moves `principal_paise` from the
    settlement account to the cash drawer as a same-shape pair to
    insert_transfer_pair's (entry_type=transfer, sums to zero); commission is
    always separate cash-drawer income (entry_type=commission), never folded
    into the principal — booking a withdrawal's principal as income is the
    class of bug this table exists to prevent."""
    ids = []
    try:
        if txn_type != "balance_enquiry" and principal_paise:
            ids.append(insert_entry(
                conn, business_date=business_date, account_id=settlement_account_id,
                amount_paise=-principal_paise, entry_type="transfer", source_type="banking",
                source_id=source_id, description=description, created_by=created_by,
            ))
            ids.append(insert_entry(
                conn, business_date=business_date, account_id=cash_account_id,
                amount_paise=principal_paise, entry_type="transfer", source_type="banking",
                source_id=source_id, description=description, created_by=created_by,
            ))
        if commission_paise:
            ids.append(insert_entry(
                conn, business_date=business_date, account_id=cash_account_id,
                amount_paise=commission_paise, entry_type="commission", source_type="banking",
                source_id=source_id, description=description, created_by=created_by,
            ))
    except Exception:
        conn.rollback()
        raise
    return ids


def reverse_entry(
    conn: sqlite3.Connection,
    *,
    entry_id: int,
    created_by: int,
    business_date: str | None = None,
    description: str | None = None,
) -> int:
    """Insert the offsetting entry for entry_id. A row can only be reversed once."""
    original = conn.execute("SELECT * FROM ledger WHERE id = ?", (entry_id,)).fetchone()
    if original is None:
        raise ValueError(f"ledger entry {entry_id} not found")
    if original["entry_type"] == "reversal":
        # H.9: reversing a reversal silently re-applies the original entry,
        # bypassing the single-reversal rule via a two-hop chain.
        raise ValueError(f"ledger entry {entry_id} is itself a reversal and cannot be reversed")
    if conn.execute("SELECT 1 FROM ledger WHERE reverses_id = ?", (entry_id,)).fetchone():
        raise ValueError(f"ledger entry {entry_id} has already been reversed")
    return insert_entry(
        conn,
        business_date=business_date or original["business_date"],
        account_id=original["account_id"],
        amount_paise=-original["amount_paise"],
        entry_type="reversal",
        source_type=original["source_type"],
        source_id=original["source_id"],
        description=description or f"Reversal of entry {entry_id}",
        reverses_id=entry_id,
        created_by=created_by,
    )


@router.get("")
def list_ledger(
    business_date: str | None = None,
    account_id: int | None = None,
    entry_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
    conn: sqlite3.Connection = Depends(get_db),
):
    """Date/account/type filters, pagination, and a running balance per
    account that continues from the account's true prior balance (the window
    function runs over the whole ledger, filters are applied after)."""
    if limit < 1 or limit > MAX_LEDGER_LIMIT:
        limit = MAX_LEDGER_LIMIT
    offset = max(0, offset)

    where = []
    params: list = []
    if business_date:
        where.append("business_date = ?")
        params.append(business_date)
    if account_id is not None:
        where.append("account_id = ?")
        params.append(account_id)
    if entry_type:
        where.append("entry_type = ?")
        params.append(entry_type)
    clause = f"WHERE {' AND '.join(where)}" if where else ""

    total = conn.execute(f"SELECT COUNT(*) FROM ledger {clause}", params).fetchone()[0]
    rows = conn.execute(
        f"WITH full_ledger AS ("
        f"  SELECT *, SUM(amount_paise) OVER (PARTITION BY account_id ORDER BY business_date, id) AS running_balance "
        f"  FROM ledger"
        f") SELECT * FROM full_ledger {clause} ORDER BY business_date, id LIMIT ? OFFSET ?",
        (*params, limit, offset),
    ).fetchall()
    return {"items": [dict(r) for r in rows], "total": total, "limit": limit, "offset": offset}
