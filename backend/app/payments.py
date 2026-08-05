"""Payments API (PLAN 3.3): settles a customer's outstanding transactions —
oldest first — with a single amount. Each bill it touches gets its own
payments row (a row's transaction_id can only point at one bill), and the
whole amount posts as a single entry_type=customer_payment ledger row
(ARCHITECTURE.md §3) — separate from the service_income row a transaction may
already have picked up at creation (transactions.py, 3.2). Status (3.4) is
recomputed via transactions.recompute_status rather than set here by hand."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.accounts import _get_active_or_404 as _get_account_or_404
from app.accounts import _system_user_id
from app.audit import write_audit
from app.customers import _get_or_404 as _get_customer_or_404
from app.db import begin_write, get_db
from app.ledger import insert_entry
from app.transactions import recompute_status

router = APIRouter(prefix="/api/payments", tags=["payments"])

_INT64_MAX = 2**63 - 1


class PaymentCreate(BaseModel):
    business_date: str
    customer_id: int
    amount_paise: int = Field(gt=0, le=_INT64_MAX)
    account_id: int
    remarks: str | None = None


def _row_to_dict(row: sqlite3.Row) -> dict:
    return dict(row)


def _outstanding_paise(conn: sqlite3.Connection, transaction_id: int, total_paise: int) -> int:
    paid = conn.execute(
        "SELECT COALESCE(SUM(amount_paise), 0) FROM payments WHERE transaction_id = ? AND deleted_at IS NULL",
        (transaction_id,),
    ).fetchone()[0]
    return total_paise - paid


@router.post("", status_code=201)
def create_payment(body: PaymentCreate, conn: sqlite3.Connection = Depends(get_db)):
    _get_customer_or_404(conn, body.customer_id)
    _get_account_or_404(conn, body.account_id)

    # H.11: acquire the write lock before the outstanding-balance guard
    # below, so N concurrent payments against the same bill can't all pass
    # the same pre-state check before any of them writes.
    begin_write(conn)
    try:
        open_txns = conn.execute(
            "SELECT * FROM transactions WHERE customer_id = ? AND deleted_at IS NULL "
            "AND status IN ('pending', 'partial') ORDER BY business_date, id",
            (body.customer_id,),
        ).fetchall()
        dues = [(t, _outstanding_paise(conn, t["id"], t["total_paise"])) for t in open_txns]
        dues = [(t, due) for t, due in dues if due > 0]

        if body.amount_paise > sum(due for _, due in dues):
            raise HTTPException(status_code=400, detail="amount exceeds the customer's outstanding balance")

        remaining = body.amount_paise
        created_ids = []
        for txn, due in dues:
            if remaining <= 0:
                break
            applied = min(due, remaining)
            cur = conn.execute(
                "INSERT INTO payments (business_date, customer_id, amount_paise, account_id, transaction_id, remarks) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (body.business_date, body.customer_id, applied, body.account_id, txn["id"], body.remarks),
            )
            created_ids.append(cur.lastrowid)
            recompute_status(conn, txn["id"])
            remaining -= applied

        insert_entry(
            conn, business_date=body.business_date, account_id=body.account_id,
            amount_paise=body.amount_paise, entry_type="customer_payment",
            source_type="payment", source_id=created_ids[0] if created_ids else None,
            description=body.remarks, created_by=_system_user_id(conn),
        )
    except Exception:
        conn.rollback()
        raise

    rows = [_row_to_dict(r) for r in conn.execute(
        f"SELECT * FROM payments WHERE id IN ({','.join('?' * len(created_ids))})", created_ids
    ).fetchall()]
    for row in rows:
        write_audit(conn, table_name="payments", row_id=row["id"], action="create",
                    before=None, after=row, user_id=_system_user_id(conn))
    conn.commit()
    return rows
