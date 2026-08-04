"""Expenses CRUD (PLAN 4.1, ARCHITECTURE.md §4.6/§6): category, amount, paying
account, note. Create posts a negative ledger entry immediately (unconditional,
unlike a transaction's amount_paid_paise — an expense is always fully "paid"
the moment it's recorded). Money-moving edits (account/amount/date) and
deletes route through reversal rather than ever touching the posted ledger
row, the same H.14/H.5 pattern account moves and overdrafts use elsewhere;
category/note-only edits are a plain update."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.accounts import _get_active_or_404 as _get_account_or_404
from app.accounts import _system_user_id
from app.db import begin_write, get_db
from app.ledger import account_balance, insert_entry, reverse_entry, validate_business_date

router = APIRouter(prefix="/api/expenses", tags=["expenses"])

_INT64_MAX = 2**63 - 1
MAX_LIST_LIMIT = 500  # same cap/clamp pattern as list_transactions (H.6)


def _required_str(v: str | None) -> str:
    if v is None or not v.strip():
        raise ValueError("must not be null or blank")
    return v.strip()


def _not_null(v):
    if v is None:
        raise ValueError("must not be null")
    return v


class ExpenseCreate(BaseModel):
    business_date: str
    category: str
    amount_paise: int = Field(gt=0, le=_INT64_MAX)
    account_id: int
    note: str | None = None

    _v_category = field_validator("category")(_required_str)


class CategoryCreate(BaseModel):
    name: str

    _v_name = field_validator("name")(_required_str)


# H.4: business_date/category/amount_paise/account_id are all NOT NULL
# columns; see accounts.py for why these validators only fire on an explicit
# value, not on an omitted PATCH field.
class ExpenseUpdate(BaseModel):
    business_date: str | None = None
    category: str | None = None
    amount_paise: int | None = Field(default=None, gt=0, le=_INT64_MAX)
    account_id: int | None = None
    note: str | None = None

    _v_business_date = field_validator("business_date")(_not_null)
    _v_category = field_validator("category")(_required_str)
    _v_account_id = field_validator("account_id")(_not_null)


def _row_to_dict(row: sqlite3.Row) -> dict:
    return dict(row)


def _get_or_404(conn: sqlite3.Connection, expense_id: int) -> sqlite3.Row:
    row = conn.execute(
        "SELECT * FROM expenses WHERE id = ? AND deleted_at IS NULL", (expense_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="expense not found")
    return row


def _live_ledger_entry(conn: sqlite3.Connection, expense_id: int) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM ledger WHERE source_type = 'expense' AND source_id = ? "
        "AND entry_type = 'expense' AND id NOT IN "
        "(SELECT reverses_id FROM ledger WHERE reverses_id IS NOT NULL)",
        (expense_id,),
    ).fetchone()


@router.get("")
def list_expenses(
    business_date: str | None = None,
    category: str | None = None,
    limit: int = 50,
    offset: int = 0,
    conn: sqlite3.Connection = Depends(get_db),
):
    if limit < 1 or limit > MAX_LIST_LIMIT:
        limit = MAX_LIST_LIMIT
    offset = max(0, offset)

    where = ["deleted_at IS NULL"]
    params: list = []
    if business_date:
        where.append("business_date = ?")
        params.append(business_date)
    if category:
        where.append("category = ?")
        params.append(category)
    clause = f"WHERE {' AND '.join(where)}"

    total = conn.execute(f"SELECT COUNT(*) FROM expenses {clause}", params).fetchone()[0]
    rows = conn.execute(
        f"SELECT * FROM expenses {clause} ORDER BY business_date DESC, id DESC LIMIT ? OFFSET ?",
        (*params, limit, offset),
    ).fetchall()
    return {"items": [_row_to_dict(r) for r in rows], "total": total, "limit": limit, "offset": offset}


@router.post("", status_code=201)
def create_expense(body: ExpenseCreate, conn: sqlite3.Connection = Depends(get_db)):
    _get_account_or_404(conn, body.account_id)

    # H.11/H.5: same overdraft guard as transfers.py — an expense is a
    # negative-money write, and no account here has a real overdraft
    # facility. Acquire the write lock before the balance check so N
    # concurrent expenses against the same account can't all pass the same
    # pre-state check before any of them writes.
    begin_write(conn)
    try:
        if account_balance(conn, body.account_id) < body.amount_paise:
            raise HTTPException(status_code=400, detail="insufficient balance in paying account")

        user_id = _system_user_id(conn)
        cur = conn.execute(
            "INSERT INTO expenses (business_date, category, amount_paise, account_id, note) "
            "VALUES (?, ?, ?, ?, ?)",
            (body.business_date, body.category, body.amount_paise, body.account_id, body.note),
        )
        expense_id = cur.lastrowid
        insert_entry(
            conn, business_date=body.business_date, account_id=body.account_id,
            amount_paise=-body.amount_paise, entry_type="expense", source_type="expense",
            source_id=expense_id, description=body.note, created_by=user_id,
        )
    except Exception:
        conn.rollback()
        raise

    conn.commit()
    return _row_to_dict(_get_or_404(conn, expense_id))


# PLAN 4.2: categories live in `settings` (seeded by app/seed.py) as a
# comma-separated string, not hardcoded in the frontend, so the operator can
# add their own. Routes registered ahead of /{expense_id} so "categories"
# can't be mistaken for an expense id.
def _get_categories(conn: sqlite3.Connection) -> list[str]:
    row = conn.execute("SELECT value FROM settings WHERE key = 'expense_categories'").fetchone()
    value = row["value"] if row else ""
    return [c.strip() for c in value.split(",") if c.strip()]


@router.get("/categories")
def list_categories(conn: sqlite3.Connection = Depends(get_db)):
    return {"categories": _get_categories(conn)}


@router.post("/categories")
def add_category(body: CategoryCreate, conn: sqlite3.Connection = Depends(get_db)):
    categories = _get_categories(conn)
    if body.name not in categories:
        categories.append(body.name)
        conn.execute(
            "UPDATE settings SET value = ? WHERE key = 'expense_categories'", (",".join(categories),)
        )
        conn.commit()
    return {"categories": categories}


@router.get("/{expense_id}")
def get_expense(expense_id: int, conn: sqlite3.Connection = Depends(get_db)):
    return _row_to_dict(_get_or_404(conn, expense_id))


@router.patch("/{expense_id}")
def update_expense(expense_id: int, body: ExpenseUpdate, conn: sqlite3.Connection = Depends(get_db)):
    expense = _get_or_404(conn, expense_id)
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        return _row_to_dict(expense)

    if "business_date" in fields:
        validate_business_date(fields["business_date"])
    new_account_id = fields.get("account_id", expense["account_id"])
    if "account_id" in fields:
        _get_account_or_404(conn, new_account_id)

    new_amount = fields.get("amount_paise", expense["amount_paise"])
    new_business_date = fields.get("business_date", expense["business_date"])
    account_changed = new_account_id != expense["account_id"]
    date_changed = new_business_date != expense["business_date"]
    amount_changed = new_amount != expense["amount_paise"]

    try:
        if account_changed or date_changed or amount_changed:
            # H.11/H.9: acquire the write lock before the live-entry lookup
            # and the balance guard below, same reasoning as
            # correct_transaction.
            begin_write(conn)
            live_entry = _live_ledger_entry(conn, expense_id)
            if live_entry is not None:
                # the old amount returns to its account first, so the
                # overdraft guard checks the destination account's true
                # post-reversal balance, not a stale pre-edit figure.
                user_id = _system_user_id(conn)
                reverse_entry(conn, entry_id=live_entry["id"], created_by=user_id,
                               description=f"Correction of expense {expense_id}")
                if account_balance(conn, new_account_id) < new_amount:
                    raise HTTPException(status_code=400, detail="insufficient balance in paying account")
                insert_entry(
                    conn, business_date=new_business_date, account_id=new_account_id,
                    amount_paise=-new_amount, entry_type="expense", source_type="expense",
                    source_id=expense_id, description=fields.get("note", live_entry["description"]),
                    created_by=user_id,
                )

        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE expenses SET {set_clause}, updated_at = datetime('now') WHERE id = ?",
            (*fields.values(), expense_id),
        )
    except Exception:
        conn.rollback()
        raise

    conn.commit()
    return _row_to_dict(_get_or_404(conn, expense_id))


@router.delete("/{expense_id}", status_code=204)
def delete_expense(expense_id: int, conn: sqlite3.Connection = Depends(get_db)):
    _get_or_404(conn, expense_id)
    try:
        live_entry = _live_ledger_entry(conn, expense_id)
        if live_entry is not None:
            reverse_entry(conn, entry_id=live_entry["id"], created_by=_system_user_id(conn),
                           description=f"Deletion of expense {expense_id}")
        conn.execute("UPDATE expenses SET deleted_at = datetime('now') WHERE id = ?", (expense_id,))
    except Exception:
        conn.rollback()
        raise
    conn.commit()
