"""Daily closing (PLAN 6.4/6.5, ARCHITECTURE.md §5/§6, PRD §6/§8): the
6-step workflow's backend half. Steps 1-3 (verify pending work / cash / bank
balances) are just reads the frontend already has via /transactions and
/accounts — nothing new needed there. Step 4 (adjustments) and step 5 (lock)
are POST /close below; step 6 (report) is GET /report, which derives the
exact same figures live from the ledger whether the day is open or closed,
so it can never drift from what actually happened."""
import sqlite3
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.accounts import _system_user_id
from app.db import begin_write, get_db
from app.ledger import closing_balance, ensure_business_day_open, insert_entry, opening_balance, validate_business_date

router = APIRouter(prefix="/api/day", tags=["closing"])

_INT64_MAX = 2**63 - 1

# Every entry_type bucketed into exactly one column, so opening + received -
# paid + transfer_in - transfer_out + adjustment always reconciles to
# closing by construction (PRD §6's formula) — closing_paise itself is still
# computed independently via closing_balance(), never derived from these.
_BREAKDOWN_SQL = (
    "SELECT "
    "SUM(CASE WHEN entry_type IN ('service_income','commission','customer_payment','opening_balance') THEN amount_paise ELSE 0 END) AS received_paise, "
    "SUM(CASE WHEN entry_type = 'expense' THEN -amount_paise ELSE 0 END) AS paid_paise, "
    "SUM(CASE WHEN entry_type = 'transfer' AND amount_paise > 0 THEN amount_paise ELSE 0 END) AS transfer_in_paise, "
    "SUM(CASE WHEN entry_type = 'transfer' AND amount_paise < 0 THEN -amount_paise ELSE 0 END) AS transfer_out_paise, "
    "SUM(CASE WHEN entry_type IN ('adjustment','reversal') THEN amount_paise ELSE 0 END) AS adjustment_paise "
    "FROM ledger WHERE account_id = ? AND business_date = ?"
)


def _day_breakdown(conn: sqlite3.Connection, business_date: str) -> list[dict]:
    """Per-account figures for `business_date`, derived live from the ledger
    every call — used by both the close-day snapshot and the report
    endpoint, so there is exactly one place this math is done."""
    accounts = conn.execute("SELECT * FROM accounts WHERE deleted_at IS NULL ORDER BY sort_order, id").fetchall()
    rows = []
    for acct in accounts:
        b = conn.execute(_BREAKDOWN_SQL, (acct["id"], business_date)).fetchone()
        rows.append({
            "account_id": acct["id"],
            "account_name": acct["name"],
            "opening_paise": opening_balance(conn, acct["id"], business_date),
            "received_paise": b["received_paise"] or 0,
            "paid_paise": b["paid_paise"] or 0,
            "transfer_in_paise": b["transfer_in_paise"] or 0,
            "transfer_out_paise": b["transfer_out_paise"] or 0,
            "adjustment_paise": b["adjustment_paise"] or 0,
            "closing_paise": closing_balance(conn, acct["id"], business_date),
        })
    return rows


@router.get("/{business_date}")
def get_day_status(business_date: str, conn: sqlite3.Connection = Depends(get_db)):
    validate_business_date(business_date)
    row = conn.execute("SELECT * FROM business_days WHERE business_date = ?", (business_date,)).fetchone()
    if row is None:
        # PLAN 6.1: no row yet means untouched, not "doesn't exist" — a
        # write to this date would auto-open it, so it reads as open now.
        return {"business_date": business_date, "status": "open", "opened_at": None, "closed_at": None, "closed_by": None}
    return dict(row)


@router.get("/{business_date}/report")
def get_day_report(business_date: str, conn: sqlite3.Connection = Depends(get_db)):
    """PLAN 6.5: opening/income/expenses/transfers/closing/variance per
    account, plus totals. Always a live ledger derivation — for a closed
    day this reconciles with the sealed daily_account_balance snapshot
    (nothing can write new entries onto a closed date, PLAN 6.3), but nothing
    here is READ from that snapshot table."""
    validate_business_date(business_date)
    day = conn.execute("SELECT status FROM business_days WHERE business_date = ?", (business_date,)).fetchone()
    status = day["status"] if day else "open"

    accounts = _day_breakdown(conn, business_date)
    totals = {
        key: sum(a[key] for a in accounts)
        for key in ("opening_paise", "received_paise", "paid_paise", "transfer_in_paise", "transfer_out_paise", "adjustment_paise", "closing_paise")
    }
    cash_account = next((a for a in accounts if a["account_id"] == _primary_cash_account_id(conn)), None)

    return {
        "business_date": business_date,
        "status": status,
        "accounts": accounts,
        "totals": totals,
        "cash_variance_paise": cash_account["adjustment_paise"] if cash_account else 0,
    }


def _primary_cash_account_id(conn: sqlite3.Connection) -> int | None:
    # ponytail: PRD's own examples show one cash drawer; if a shop somehow
    # runs several account_type='cash' rows only the first (by sort_order)
    # gets the physical-count variance treatment. Revisit if that's ever real.
    row = conn.execute(
        "SELECT id FROM accounts WHERE account_type = 'cash' AND deleted_at IS NULL ORDER BY sort_order, id LIMIT 1"
    ).fetchone()
    return row["id"] if row else None


class CloseDayRequest(BaseModel):
    # H.32: a drawer can't physically hold negative cash, and an unbounded
    # value let variance = physical_cash_paise - system_cash overflow int64
    # on insert (500). Same ge=0/le=_INT64_MAX bound every other money field
    # in the codebase already uses.
    physical_cash_paise: int | None = Field(None, ge=0, le=_INT64_MAX)
    remarks: str | None = None


@router.post("/{business_date}/close", status_code=201)
def close_day(business_date: str, body: CloseDayRequest, conn: sqlite3.Connection = Depends(get_db)):
    validate_business_date(business_date)
    # H.35: close_day auto-opens any untouched date with no bound — closing a
    # fat-fingered future date would seal it with no reopen path (Phase 8.7
    # doesn't exist yet). Only close_day is restricted; other writes to a
    # future business_date are unaffected.
    if date.fromisoformat(business_date) > date.today():
        raise HTTPException(status_code=400, detail="cannot close a future business day")
    # H.11-style: acquire the write lock before ensure_business_day_open's
    # closed-check, so two concurrent close attempts on the same date can't
    # both read "still open" and both proceed.
    begin_write(conn)
    try:
        ensure_business_day_open(conn, business_date)  # 409 if already closed; auto-opens an untouched date
        user_id = _system_user_id(conn)

        cash_account_id = _primary_cash_account_id(conn)
        if cash_account_id is not None and body.physical_cash_paise is not None:
            system_cash = closing_balance(conn, cash_account_id, business_date)
            variance = body.physical_cash_paise - system_cash
            if variance != 0:
                if not body.remarks or not body.remarks.strip():
                    raise HTTPException(status_code=400, detail="remarks are required when there is a cash variance")
                insert_entry(
                    conn, business_date=business_date, account_id=cash_account_id,
                    amount_paise=variance, entry_type="adjustment", source_type="closing",
                    description=body.remarks, created_by=user_id,
                )

        # computed after the variance entry above, so a cash variance is
        # already folded into this account's closing_paise/adjustment_paise.
        accounts = _day_breakdown(conn, business_date)
        for a in accounts:
            conn.execute(
                "INSERT INTO daily_account_balance "
                "(business_date, account_id, opening_paise, received_paise, paid_paise, "
                "transfer_in_paise, transfer_out_paise, adjustment_paise, closing_paise, closed_by, remarks) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (business_date, a["account_id"], a["opening_paise"], a["received_paise"], a["paid_paise"],
                 a["transfer_in_paise"], a["transfer_out_paise"], a["adjustment_paise"], a["closing_paise"],
                 user_id, body.remarks),
            )

        conn.execute(
            "UPDATE business_days SET status = 'closed', closed_at = datetime('now'), closed_by = ? WHERE business_date = ?",
            (user_id, business_date),
        )
    except Exception:
        conn.rollback()
        raise

    conn.commit()
    return get_day_report(business_date, conn)
