"""The ledger core (ARCHITECTURE.md §2/§3): append-only inserts, balance by
summation. No update or delete path exists here — the DB trigger in
002_ledger_immutable.sql rejects both regardless."""
import sqlite3
from datetime import date

from fastapi import APIRouter, Depends, HTTPException

from app.db import get_db

router = APIRouter(prefix="/api/ledger", tags=["ledger"])

ENTRY_TYPES = {
    "service_income", "commission", "expense", "transfer",
    "customer_payment", "adjustment", "opening_balance", "reversal",
}


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
    try:
        date.fromisoformat(business_date)
    except (TypeError, ValueError):
        # H.2: business_date is TEXT and every query orders/filters on it
        # lexically, so one malformed value silently corrupts ordering,
        # date filters and opening-balance/day-close derivation downstream.
        # Checked once here — the only path anything reaches the ledger by.
        raise HTTPException(status_code=400, detail=f"invalid business_date: {business_date!r}")
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
    account computed over the filtered set (before the LIMIT is applied)."""
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
        f"SELECT *, SUM(amount_paise) OVER (PARTITION BY account_id ORDER BY business_date, id) AS running_balance "
        f"FROM ledger {clause} ORDER BY business_date, id LIMIT ? OFFSET ?",
        (*params, limit, offset),
    ).fetchall()
    return {"items": [dict(r) for r in rows], "total": total, "limit": limit, "offset": offset}
