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
