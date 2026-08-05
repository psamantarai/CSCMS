"""Accounts CRUD (ARCHITECTURE.md §4.1). opening_balance_paise seeds exactly
one opening_balance ledger entry when the account is created; after that the
column is historical record only — balance is always derived from the ledger."""
import sqlite3
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.db import get_db
from app.ledger import account_balance, insert_entry

router = APIRouter(prefix="/api/accounts", tags=["accounts"])

AccountType = Literal["cash", "savings", "current", "wallet", "settlement"]

# H.4: name/account_type/is_active/sort_order are all NOT NULL columns, but
# the Update model has to accept them as optional so PATCH can omit fields
# it isn't changing. That leaves an explicit {"field": null} indistinguishable
# from "not provided" at the type level — these validators only run when the
# client actually sends a value (pydantic skips them for the unset default),
# so they catch the explicit-null case without breaking omission.
_INT64_MIN, _INT64_MAX = -(2**63), 2**63 - 1


def _required_str(v: str | None) -> str:
    if v is None or not v.strip():
        raise ValueError("must not be null or blank")
    return v.strip()


def _not_null(v):
    if v is None:
        raise ValueError("must not be null")
    return v


class AccountCreate(BaseModel):
    name: str
    account_type: AccountType
    bank_name: str | None = None
    account_number_masked: str | None = None
    ifsc: str | None = None
    opening_balance_paise: int = Field(0, ge=_INT64_MIN, le=_INT64_MAX)
    sort_order: int = Field(0, ge=_INT64_MIN, le=_INT64_MAX)

    _v_name = field_validator("name")(_required_str)


class AccountUpdate(BaseModel):
    name: str | None = None
    account_type: AccountType | None = None
    bank_name: str | None = None
    account_number_masked: str | None = None
    ifsc: str | None = None
    sort_order: int | None = Field(default=None, ge=_INT64_MIN, le=_INT64_MAX)
    is_active: bool | None = None

    _v_name = field_validator("name")(_required_str)
    _v_account_type = field_validator("account_type")(_not_null)
    _v_sort_order = field_validator("sort_order")(_not_null)
    _v_is_active = field_validator("is_active")(_not_null)


def _row_to_dict(row: sqlite3.Row) -> dict:
    return dict(row)


def _get_or_404(conn: sqlite3.Connection, account_id: int) -> sqlite3.Row:
    try:
        row = conn.execute(
            "SELECT * FROM accounts WHERE id = ? AND deleted_at IS NULL", (account_id,)
        ).fetchone()
    except OverflowError:  # H.34: an id outside SQLite's 64-bit range
        row = None
    if row is None:
        raise HTTPException(status_code=404, detail="account not found")
    return row


# H.15: money-in write paths (transactions, payments, transfers) must reject
# a deactivated account, not just a deleted one — _get_or_404 alone is also
# used by read paths and PATCH, which still need to reach a deactivated
# account.
def _get_active_or_404(conn: sqlite3.Connection, account_id: int) -> sqlite3.Row:
    row = _get_or_404(conn, account_id)
    if not row["is_active"]:
        raise HTTPException(status_code=400, detail="account is deactivated")
    return row


def _system_user_id(conn: sqlite3.Connection) -> int:
    # ponytail: hardcoded to the seeded admin user until auth (8.1/8.2) provides
    # a real session user for created_by/operator_id fields.
    return conn.execute("SELECT id FROM users WHERE username = 'admin'").fetchone()[0]


@router.get("")
def list_accounts(conn: sqlite3.Connection = Depends(get_db)):
    rows = conn.execute(
        "SELECT * FROM accounts WHERE deleted_at IS NULL ORDER BY sort_order, id"
    ).fetchall()
    return [_row_to_dict(r) for r in rows]


@router.post("", status_code=201)
def create_account(body: AccountCreate, conn: sqlite3.Connection = Depends(get_db)):
    cur = conn.execute(
        "INSERT INTO accounts (name, account_type, bank_name, account_number_masked, ifsc, opening_balance_paise, sort_order) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (body.name, body.account_type, body.bank_name, body.account_number_masked, body.ifsc,
         body.opening_balance_paise, body.sort_order),
    )
    account_id = cur.lastrowid
    insert_entry(
        conn, business_date=date.today().isoformat(),
        account_id=account_id, amount_paise=body.opening_balance_paise,
        entry_type="opening_balance", source_type="account", source_id=account_id,
        description="Opening balance", created_by=_system_user_id(conn),
    )
    conn.commit()
    return _row_to_dict(_get_or_404(conn, account_id))


@router.get("/{account_id}")
def get_account(account_id: int, conn: sqlite3.Connection = Depends(get_db)):
    return _row_to_dict(_get_or_404(conn, account_id))


@router.get("/{account_id}/balance")
def get_account_balance(account_id: int, conn: sqlite3.Connection = Depends(get_db)):
    _get_or_404(conn, account_id)
    return {"account_id": account_id, "balance_paise": account_balance(conn, account_id)}


@router.patch("/{account_id}")
def update_account(account_id: int, body: AccountUpdate, conn: sqlite3.Connection = Depends(get_db)):
    _get_or_404(conn, account_id)
    fields = body.model_dump(exclude_unset=True)
    if fields:
        if "is_active" in fields:
            fields["is_active"] = int(fields["is_active"])
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE accounts SET {set_clause}, updated_at = datetime('now') WHERE id = ?",
            (*fields.values(), account_id),
        )
        conn.commit()
    return _row_to_dict(_get_or_404(conn, account_id))
