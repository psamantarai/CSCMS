"""The ledger core (ARCHITECTURE.md §2/§3): append-only inserts, balance by
summation. No update or delete path exists here — the DB trigger in
002_ledger_immutable.sql rejects both regardless."""
import sqlite3

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
