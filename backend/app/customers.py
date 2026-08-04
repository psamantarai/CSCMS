"""Customers CRUD (ARCHITECTURE.md §4) with soft delete. A deleted customer
is hidden from list/get but the row (and their transaction/banking history)
stays intact — deleted_at is set, never a real DELETE."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.db import get_db

router = APIRouter(prefix="/api/customers", tags=["customers"])


class CustomerCreate(BaseModel):
    name: str
    phone: str | None = None
    village: str | None = None
    aadhaar_masked: str | None = None
    notes: str | None = None


class CustomerUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    village: str | None = None
    aadhaar_masked: str | None = None
    notes: str | None = None


def _row_to_dict(row: sqlite3.Row) -> dict:
    return dict(row)


def _get_or_404(conn: sqlite3.Connection, customer_id: int) -> sqlite3.Row:
    row = conn.execute(
        "SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL", (customer_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="customer not found")
    return row


@router.get("")
def list_customers(q: str | None = None, conn: sqlite3.Connection = Depends(get_db)):
    if q:
        like = f"%{q}%"
        rows = conn.execute(
            "SELECT * FROM customers WHERE deleted_at IS NULL "
            "AND (name LIKE ? OR phone LIKE ? OR village LIKE ?) ORDER BY name",
            (like, like, like),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY name"
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


@router.post("", status_code=201)
def create_customer(body: CustomerCreate, conn: sqlite3.Connection = Depends(get_db)):
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
    _get_or_404(conn, customer_id)
    fields = body.model_dump(exclude_unset=True)
    if fields:
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
    _get_or_404(conn, customer_id)
    transactions = conn.execute(
        "SELECT t.*, s.name AS service_name FROM transactions t "
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
    return {
        "transactions": [_row_to_dict(r) for r in transactions],
        "banking_transactions": [_row_to_dict(r) for r in banking],
    }


@router.get("/{customer_id}/outstanding")
def get_customer_outstanding(customer_id: int, conn: sqlite3.Connection = Depends(get_db)):
    _get_or_404(conn, customer_id)
    billed = conn.execute(
        "SELECT COALESCE(SUM(total_paise), 0) FROM transactions WHERE customer_id = ? AND deleted_at IS NULL",
        (customer_id,),
    ).fetchone()[0]
    paid = conn.execute(
        "SELECT COALESCE(SUM(amount_paise), 0) FROM payments WHERE customer_id = ? AND deleted_at IS NULL",
        (customer_id,),
    ).fetchone()[0]
    return {"outstanding_paise": billed - paid}
