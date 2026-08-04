"""Transfers API (PLAN 1.3): moves money between two accounts as one paired
ledger entry, written in a single DB transaction."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.accounts import _get_or_404, _system_user_id
from app.db import get_db
from app.ledger import insert_transfer_pair

router = APIRouter(prefix="/api/transfers", tags=["transfers"])


@router.get("")
def list_transfers(limit: int = 20, conn: sqlite3.Connection = Depends(get_db)):
    rows = conn.execute(
        "SELECT t.*, f.name AS from_account_name, o.name AS to_account_name "
        "FROM account_transfers t "
        "JOIN accounts f ON f.id = t.from_account_id "
        "JOIN accounts o ON o.id = t.to_account_id "
        "ORDER BY t.id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [dict(r) for r in rows]


class TransferCreate(BaseModel):
    business_date: str
    from_account_id: int
    to_account_id: int
    amount_paise: int
    remarks: str | None = None


@router.post("", status_code=201)
def create_transfer(body: TransferCreate, conn: sqlite3.Connection = Depends(get_db)):
    if body.from_account_id == body.to_account_id:
        raise HTTPException(status_code=400, detail="cannot transfer to the same account")
    if body.amount_paise <= 0:
        raise HTTPException(status_code=400, detail="amount must be positive")
    _get_or_404(conn, body.from_account_id)
    _get_or_404(conn, body.to_account_id)

    user_id = _system_user_id(conn)
    cur = conn.execute(
        "INSERT INTO account_transfers (business_date, from_account_id, to_account_id, amount_paise, remarks, operator_id) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (body.business_date, body.from_account_id, body.to_account_id, body.amount_paise, body.remarks, user_id),
    )
    transfer_id = cur.lastrowid
    insert_transfer_pair(
        conn, business_date=body.business_date, from_account_id=body.from_account_id,
        to_account_id=body.to_account_id, amount_paise=body.amount_paise,
        source_id=transfer_id, created_by=user_id, description=body.remarks,
    )
    conn.commit()

    row = conn.execute("SELECT * FROM account_transfers WHERE id = ?", (transfer_id,)).fetchone()
    return dict(row)
