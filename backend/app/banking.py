"""Banking CRUD (PLAN 5.2, ARCHITECTURE.md §4.5/§6): withdrawal, deposit,
aeps, money_transfer and balance_enquiry against a settlement account, mapped
to ledger rows via ledger.insert_banking_entries (PLAN 5.1). Money-changing
edits and deletes reverse every live entry the transaction posted (2 or 3
rows) rather than touching them, the same reversal pattern expenses.py and
transfers.py use elsewhere."""
import sqlite3
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.accounts import _get_active_or_404 as _get_account_or_404
from app.accounts import _system_user_id
from app.customers import _get_or_404 as _get_customer_or_404
from app.db import begin_write, get_db
from app.ledger import account_balance, ensure_business_day_open, insert_banking_entries, reverse_entry, validate_business_date

router = APIRouter(prefix="/api/banking", tags=["banking"])

_INT64_MAX = 2**63 - 1
MAX_LIST_LIMIT = 500  # same cap/clamp pattern as list_expenses (H.6)

TxnType = Literal["withdrawal", "deposit", "aeps", "money_transfer", "balance_enquiry"]


def _not_null(v):
    if v is None:
        raise ValueError("must not be null")
    return v


def _validate_principal(txn_type: str, principal_paise: int) -> None:
    if txn_type == "balance_enquiry":
        if principal_paise:
            raise HTTPException(status_code=400, detail="balance enquiry has no principal")
    elif principal_paise <= 0:
        raise HTTPException(status_code=400, detail="principal_paise must be positive for this transaction type")


class BankingCreate(BaseModel):
    business_date: str
    customer_id: int | None = None
    txn_type: TxnType
    principal_paise: int = Field(0, ge=0, le=_INT64_MAX)
    commission_paise: int = Field(0, ge=0, le=_INT64_MAX)
    settlement_account_id: int
    cash_account_id: int
    remarks: str | None = None


# H.4: business_date/txn_type/settlement_account_id/cash_account_id are all
# NOT NULL columns; these validators only fire on an explicit value, not on
# an omitted PATCH field (see accounts.py/expenses.py for the same pattern).
class BankingUpdate(BaseModel):
    business_date: str | None = None
    customer_id: int | None = None
    txn_type: TxnType | None = None
    principal_paise: int | None = Field(default=None, ge=0, le=_INT64_MAX)
    commission_paise: int | None = Field(default=None, ge=0, le=_INT64_MAX)
    settlement_account_id: int | None = None
    cash_account_id: int | None = None
    remarks: str | None = None

    _v_business_date = field_validator("business_date")(_not_null)
    _v_txn_type = field_validator("txn_type")(_not_null)
    _v_settlement_account_id = field_validator("settlement_account_id")(_not_null)
    _v_cash_account_id = field_validator("cash_account_id")(_not_null)


def _row_to_dict(row: sqlite3.Row) -> dict:
    return dict(row)


def _get_or_404(conn: sqlite3.Connection, banking_id: int) -> sqlite3.Row:
    try:
        row = conn.execute(
            "SELECT * FROM banking_transactions WHERE id = ? AND deleted_at IS NULL", (banking_id,)
        ).fetchone()
    except OverflowError:  # H.26-style: an id outside SQLite's 64-bit range
        row = None
    if row is None:
        raise HTTPException(status_code=404, detail="banking transaction not found")
    return row


def _live_ledger_entries(conn: sqlite3.Connection, banking_id: int) -> list[sqlite3.Row]:
    # entry_type != 'reversal' excludes the reversal rows themselves — same
    # reasoning as expenses.py's _live_ledger_entry: without it, a second
    # correction would try to re-reverse an already-reversal row and trip
    # ledger.py's "reversal of a reversal" guard.
    return conn.execute(
        "SELECT * FROM ledger WHERE source_type = 'banking' AND source_id = ? "
        "AND entry_type != 'reversal' AND id NOT IN "
        "(SELECT reverses_id FROM ledger WHERE reverses_id IS NOT NULL)",
        (banking_id,),
    ).fetchall()


@router.get("")
def list_banking(
    business_date: str | None = None,
    txn_type: str | None = None,
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
    if txn_type:
        where.append("txn_type = ?")
        params.append(txn_type)
    clause = f"WHERE {' AND '.join(where)}"

    total = conn.execute(f"SELECT COUNT(*) FROM banking_transactions {clause}", params).fetchone()[0]
    rows = conn.execute(
        f"SELECT * FROM banking_transactions {clause} ORDER BY business_date DESC, id DESC LIMIT ? OFFSET ?",
        (*params, limit, offset),
    ).fetchall()
    return {"items": [_row_to_dict(r) for r in rows], "total": total, "limit": limit, "offset": offset}


# PLAN 5.3: registered ahead of /{banking_id} so "commission-summary" can't
# be mistaken for a banking id.
@router.get("/commission-summary")
def commission_summary(
    business_date: str | None = None,
    account_id: int | None = None,
    conn: sqlite3.Connection = Depends(get_db),
):
    """Commission totals per account (and period, via business_date) —
    always a direct query over entry_type='commission', never a stored
    figure, so it can never drift from the ledger."""
    where = ["l.entry_type = 'commission'"]
    params: list = []
    if business_date:
        where.append("l.business_date = ?")
        params.append(business_date)
    if account_id is not None:
        where.append("l.account_id = ?")
        params.append(account_id)
    clause = " AND ".join(where)

    rows = conn.execute(
        f"SELECT l.account_id, a.name AS account_name, SUM(l.amount_paise) AS total_commission_paise "
        f"FROM ledger l JOIN accounts a ON a.id = l.account_id "
        f"WHERE {clause} GROUP BY l.account_id ORDER BY a.name",
        params,
    ).fetchall()
    items = [dict(r) for r in rows]
    total = sum(r["total_commission_paise"] for r in items)
    return {"items": items, "total_commission_paise": total}


@router.post("", status_code=201)
def create_banking(body: BankingCreate, conn: sqlite3.Connection = Depends(get_db)):
    validate_business_date(body.business_date)
    _validate_principal(body.txn_type, body.principal_paise)
    _get_account_or_404(conn, body.settlement_account_id)
    _get_account_or_404(conn, body.cash_account_id)
    if body.principal_paise and body.settlement_account_id == body.cash_account_id:
        raise HTTPException(status_code=400, detail="settlement and cash accounts must differ")
    if body.customer_id is not None:
        _get_customer_or_404(conn, body.customer_id)

    # H.11-style: acquire the write lock before the balance-guard SELECT
    # below, so concurrent postings against the same settlement account
    # can't all pass the same pre-state check before any of them writes.
    # ensure_business_day_open does its own write (auto-open) and so must
    # run after begin_write too — sqlite3 auto-BEGINs on that write, and a
    # later begin_write() in an already-open transaction raises.
    begin_write(conn)
    try:
        # PLAN 6.1/6.3: a balance_enquiry with commission_paise=0 posts
        # nothing to the ledger, so insert_entry's own guard would never
        # fire — checked here too, same reasoning as create_transaction's
        # H.13 pattern.
        ensure_business_day_open(conn, body.business_date)
        if body.principal_paise and account_balance(conn, body.settlement_account_id) < body.principal_paise:
            raise HTTPException(status_code=400, detail="insufficient balance in settlement account")

        user_id = _system_user_id(conn)
        cur = conn.execute(
            "INSERT INTO banking_transactions "
            "(business_date, customer_id, txn_type, principal_paise, commission_paise, "
            "settlement_account_id, cash_account_id, operator_id, remarks) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (body.business_date, body.customer_id, body.txn_type, body.principal_paise, body.commission_paise,
             body.settlement_account_id, body.cash_account_id, user_id, body.remarks),
        )
        banking_id = cur.lastrowid
        insert_banking_entries(
            conn, business_date=body.business_date, txn_type=body.txn_type,
            principal_paise=body.principal_paise, commission_paise=body.commission_paise,
            settlement_account_id=body.settlement_account_id, cash_account_id=body.cash_account_id,
            source_id=banking_id, created_by=user_id, description=body.remarks,
        )
    except Exception:
        conn.rollback()
        raise

    conn.commit()
    return _row_to_dict(_get_or_404(conn, banking_id))


@router.get("/{banking_id}")
def get_banking(banking_id: int, conn: sqlite3.Connection = Depends(get_db)):
    return _row_to_dict(_get_or_404(conn, banking_id))


@router.patch("/{banking_id}")
def update_banking(banking_id: int, body: BankingUpdate, conn: sqlite3.Connection = Depends(get_db)):
    txn = _get_or_404(conn, banking_id)
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        return _row_to_dict(txn)

    new_business_date = fields.get("business_date", txn["business_date"])
    new_txn_type = fields.get("txn_type", txn["txn_type"])
    new_principal = fields.get("principal_paise", txn["principal_paise"])
    new_commission = fields.get("commission_paise", txn["commission_paise"])
    new_settlement_id = fields.get("settlement_account_id", txn["settlement_account_id"])
    new_cash_id = fields.get("cash_account_id", txn["cash_account_id"])

    money_changed = (
        new_business_date != txn["business_date"] or new_txn_type != txn["txn_type"]
        or new_principal != txn["principal_paise"] or new_commission != txn["commission_paise"]
        or new_settlement_id != txn["settlement_account_id"] or new_cash_id != txn["cash_account_id"]
    )

    try:
        if money_changed:
            validate_business_date(new_business_date)
            _validate_principal(new_txn_type, new_principal)
            _get_account_or_404(conn, new_settlement_id)
            _get_account_or_404(conn, new_cash_id)
            if new_principal and new_settlement_id == new_cash_id:
                raise HTTPException(status_code=400, detail="settlement and cash accounts must differ")

            # H.11-style: acquire the write lock before the live-entries
            # lookup and balance guard below. ensure_business_day_open does
            # its own write (auto-open) and so must run after begin_write
            # too — see create_banking's comment.
            begin_write(conn)
            # H.30: checking only the new date let a correction move money
            # *off* an already-closed date — the reversal below is exempt
            # from ensure_business_day_open (ledger.py), so nothing else
            # would catch it. Check the resource's *current* business_date
            # too, same fix as correct_transaction (H.29).
            ensure_business_day_open(conn, txn["business_date"])
            ensure_business_day_open(conn, new_business_date)  # PLAN 6.3: same balance_enquiry-with-no-commission gap as create
            user_id = _system_user_id(conn)
            for entry in _live_ledger_entries(conn, banking_id):
                reverse_entry(conn, entry_id=entry["id"], created_by=user_id,
                               description=f"Correction of banking transaction {banking_id}")
            # the old principal returns to its settlement account first, so
            # the overdraft guard checks the true post-reversal balance.
            if new_principal and account_balance(conn, new_settlement_id) < new_principal:
                raise HTTPException(status_code=400, detail="insufficient balance in settlement account")
            insert_banking_entries(
                conn, business_date=new_business_date, txn_type=new_txn_type,
                principal_paise=new_principal, commission_paise=new_commission,
                settlement_account_id=new_settlement_id, cash_account_id=new_cash_id,
                source_id=banking_id, created_by=user_id,
                description=fields.get("remarks", txn["remarks"]),
            )

        if "customer_id" in fields and fields["customer_id"] is not None:
            _get_customer_or_404(conn, fields["customer_id"])

        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE banking_transactions SET {set_clause}, updated_at = datetime('now') WHERE id = ?",
            (*fields.values(), banking_id),
        )
    except Exception:
        conn.rollback()
        raise

    conn.commit()
    return _row_to_dict(_get_or_404(conn, banking_id))


@router.delete("/{banking_id}", status_code=204)
def delete_banking(banking_id: int, conn: sqlite3.Connection = Depends(get_db)):
    # H.23-style: acquire the write lock before the live-entries lookup, so
    # concurrent deletes of the same transaction can't race to reverse the
    # same entry twice.
    begin_write(conn)
    try:
        txn = _get_or_404(conn, banking_id)
        # H.30: delete_banking called ensure_business_day_open nowhere at
        # all — a delete on a closed date posted its reversal straight onto
        # the sealed day. Must run after begin_write, same as update_banking.
        ensure_business_day_open(conn, txn["business_date"])
        user_id = _system_user_id(conn)
        for entry in _live_ledger_entries(conn, banking_id):
            reverse_entry(conn, entry_id=entry["id"], created_by=user_id,
                           description=f"Deletion of banking transaction {banking_id}")
        conn.execute("UPDATE banking_transactions SET deleted_at = datetime('now') WHERE id = ?", (banking_id,))
    except Exception:
        conn.rollback()
        raise
    conn.commit()
