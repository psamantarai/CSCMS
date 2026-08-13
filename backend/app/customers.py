"""Customers CRUD (ARCHITECTURE.md §4) with soft delete. A deleted customer
is hidden from list/get but the row (and their transaction/banking history)
stays intact — deleted_at is set, never a real DELETE."""
import re
import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from app.db import get_db

router = APIRouter(prefix="/api/customers", tags=["customers"])


# H.4: name is the only NOT NULL column here — phone/village/aadhaar_masked/
# notes are nullable, so explicit null on those is a legitimate "clear this
# field" update. Runs only when the client sends a value, not on omission
# (see accounts.py for the same pattern).
def _required_str(v: str | None) -> str:
    if v is None or not v.strip():
        raise ValueError("must not be null or blank")
    return v.strip()


# Operator request 2026-08-13: a customer is usually entered when they're
# carrying a balance, so phone is required at create time (unlike name's
# other siblings) — it's the only way to chase them for it later. Update
# leaves phone optional/clearable (H.4) — that's an existing, separately
# recorded decision this request didn't touch.
class CustomerCreate(BaseModel):
    name: str
    phone: str
    village: str | None = None
    aadhaar_masked: str | None = None
    notes: str | None = None

    _v_name = field_validator("name")(_required_str)
    _v_phone = field_validator("phone")(_required_str)


class CustomerUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    village: str | None = None
    aadhaar_masked: str | None = None
    notes: str | None = None

    _v_name = field_validator("name")(_required_str)


def _row_to_dict(row: sqlite3.Row) -> dict:
    return dict(row)


def _get_or_404(conn: sqlite3.Connection, customer_id: int) -> sqlite3.Row:
    try:
        row = conn.execute(
            "SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL", (customer_id,)
        ).fetchone()
    except OverflowError:  # H.34: an id outside SQLite's 64-bit range
        row = None
    if row is None:
        raise HTTPException(status_code=404, detail="customer not found")
    return row


# H.7: history/outstanding must stay reachable for a soft-deleted customer
# (the row and its data are intentionally kept, per the module docstring) —
# unlike _get_or_404, this doesn't filter on deleted_at.
def _get_any_or_404(conn: sqlite3.Connection, customer_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM customers WHERE id = ?", (customer_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="customer not found")
    return row


def _escape_like(q: str) -> str:
    # H.7: q is interpolated into a LIKE pattern; without escaping, % and _
    # act as wildcards (q="%" would match every row).
    return q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


# PLAN 16.6.3: "9876543210", "+91 98765 43210", "098765-43210" and
# "98765 43210" are the same phone to the operator and four different strings
# to SQLite — compare on digits-only/last-10, not the raw text. Fewer than 10
# digits is kept as-is so it can never coincidentally equal a normalised
# 10-digit number.
def _normalize_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw)
    return digits[-10:] if len(digits) >= 10 else digits


# Operator request 2026-08-13: name+phone is the de-dupe key, not phone
# alone — two family members sharing one phone under different names still
# passes (Phase 2.5's deliberate call); the same name and phone together does
# not. Skips the check when phone is unset so a legacy no-phone row (or an
# update that doesn't touch phone) never blocks on an unrelated field.
def _find_duplicate_by_name_phone(
    conn: sqlite3.Connection, name: str, phone: str | None, exclude_id: int | None = None
) -> sqlite3.Row | None:
    if not phone:
        return None
    target_phone = _normalize_phone(phone)
    if not target_phone:
        return None
    target_name = name.strip().casefold()
    rows = conn.execute(
        "SELECT * FROM customers WHERE deleted_at IS NULL AND phone IS NOT NULL"
    ).fetchall()
    for r in rows:
        if exclude_id is not None and r["id"] == exclude_id:
            continue
        if _normalize_phone(r["phone"]) == target_phone and r["name"].strip().casefold() == target_name:
            return r
    return None


# PLAN 16.6.1: a transaction's paid_paise — payments for a customer, the
# posted ledger legs for a walk-in (including the transfer recovery leg an
# outlay splits off, PLAN 16.5.4) — shared by list_transactions and
# get_customer_history below so a correction to it isn't pasted a third time.
# Lives here rather than in transactions.py because transactions.py already
# imports from this module; the reverse would be circular.
PAID_PAISE_CASE_SQL = (
    "CASE WHEN t.customer_id IS NOT NULL THEN "
    "COALESCE((SELECT SUM(amount_paise) FROM payments p WHERE p.transaction_id = t.id AND p.deleted_at IS NULL), 0) "
    "ELSE "
    "COALESCE((SELECT SUM(amount_paise) FROM ledger l WHERE l.source_type = 'transaction' AND l.source_id = t.id AND "
    "(l.entry_type = 'service_income' OR (l.entry_type = 'transfer' AND l.amount_paise > 0))), 0) "
    "END"
)


@router.get("")
def list_customers(q: str | None = None, phone: str | None = None, conn: sqlite3.Connection = Depends(get_db)):
    if phone:
        # PLAN 16.6.3: exact match on normalised phone, not q= (q also matches
        # village, so a numeric fragment could hit the wrong customer).
        target = _normalize_phone(phone)
        if not target:
            return []
        rows = conn.execute(
            "SELECT * FROM customers WHERE deleted_at IS NULL AND phone IS NOT NULL ORDER BY name"
        ).fetchall()
        return [_row_to_dict(r) for r in rows if _normalize_phone(r["phone"]) == target]
    if q:
        like = f"%{_escape_like(q)}%"
        rows = conn.execute(
            "SELECT * FROM customers WHERE deleted_at IS NULL "
            "AND (name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR village LIKE ? ESCAPE '\\') "
            "ORDER BY name",
            (like, like, like),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY name"
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


@router.post("", status_code=201)
def create_customer(body: CustomerCreate, conn: sqlite3.Connection = Depends(get_db)):
    dup = _find_duplicate_by_name_phone(conn, body.name, body.phone)
    if dup is not None:
        raise HTTPException(status_code=400, detail=f"{dup['name']} already exists with this phone number")
    cur = conn.execute(
        "INSERT INTO customers (name, phone, village, aadhaar_masked, notes) VALUES (?, ?, ?, ?, ?)",
        (body.name, body.phone, body.village, body.aadhaar_masked, body.notes),
    )
    conn.commit()
    return _row_to_dict(_get_or_404(conn, cur.lastrowid))


@router.get("/{customer_id}")
def get_customer(customer_id: int, conn: sqlite3.Connection = Depends(get_db)):
    return _row_to_dict(_get_or_404(conn, customer_id))


@router.patch("/{customer_id}")
def update_customer(customer_id: int, body: CustomerUpdate, conn: sqlite3.Connection = Depends(get_db)):
    existing = _get_or_404(conn, customer_id)
    fields = body.model_dump(exclude_unset=True)
    if fields:
        merged_name = fields.get("name", existing["name"])
        merged_phone = fields.get("phone", existing["phone"])
        dup = _find_duplicate_by_name_phone(conn, merged_name, merged_phone, exclude_id=customer_id)
        if dup is not None:
            raise HTTPException(status_code=400, detail=f"{dup['name']} already exists with this phone number")
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE customers SET {set_clause}, updated_at = datetime('now') WHERE id = ?",
            (*fields.values(), customer_id),
        )
        conn.commit()
    return _row_to_dict(_get_or_404(conn, customer_id))


@router.delete("/{customer_id}", status_code=204)
def delete_customer(customer_id: int, conn: sqlite3.Connection = Depends(get_db)):
    _get_or_404(conn, customer_id)
    conn.execute(
        "UPDATE customers SET deleted_at = datetime('now') WHERE id = ?", (customer_id,)
    )
    conn.commit()


@router.get("/{customer_id}/history")
def get_customer_history(customer_id: int, conn: sqlite3.Connection = Depends(get_db)):
    customer = _get_any_or_404(conn, customer_id)
    transactions = conn.execute(
        f"SELECT t.*, s.name AS service_name, {PAID_PAISE_CASE_SQL} AS paid_paise FROM transactions t "
        "JOIN services s ON s.id = t.service_id "
        "WHERE t.customer_id = ? AND t.deleted_at IS NULL "
        "ORDER BY t.business_date DESC, t.id DESC",
        (customer_id,),
    ).fetchall()
    banking = conn.execute(
        "SELECT * FROM banking_transactions "
        "WHERE customer_id = ? AND deleted_at IS NULL "
        "ORDER BY business_date DESC, id DESC",
        (customer_id,),
    ).fetchall()
    txn_dicts = [_row_to_dict(r) for r in transactions]
    for t in txn_dicts:
        t["balance_paise"] = t["total_paise"] - t["paid_paise"]
    return {
        "customer_deleted": customer["deleted_at"] is not None,
        "transactions": txn_dicts,
        "banking_transactions": [_row_to_dict(r) for r in banking],
    }


@router.get("/{customer_id}/outstanding")
def get_customer_outstanding(customer_id: int, conn: sqlite3.Connection = Depends(get_db)):
    customer = _get_any_or_404(conn, customer_id)
    billed = conn.execute(
        "SELECT COALESCE(SUM(total_paise), 0) FROM transactions WHERE customer_id = ? AND deleted_at IS NULL",
        (customer_id,),
    ).fetchone()[0]
    paid = conn.execute(
        "SELECT COALESCE(SUM(amount_paise), 0) FROM payments WHERE customer_id = ? AND deleted_at IS NULL",
        (customer_id,),
    ).fetchone()[0]
    return {"outstanding_paise": billed - paid, "customer_deleted": customer["deleted_at"] is not None}
