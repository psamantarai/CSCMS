"""Dashboard API (PLAN 7.1, PRD §3): the 8 tiles in one response, each a live
derivation off the ledger/transactions/payments tables -- no stored figure,
so a tile can never drift from a direct SUM/COUNT query."""
import sqlite3

from fastapi import APIRouter, Depends

from app.closing import get_day_status
from app.db import get_db
from app.ledger import income_expenses, validate_business_date

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
def get_dashboard(business_date: str, conn: sqlite3.Connection = Depends(get_db)):
    validate_business_date(business_date)

    income_paise, expenses_paise = income_expenses(conn, business_date, business_date)

    # Cash-in-hand vs bank balance is account_type='cash' vs everything else
    # (savings/current/wallet/settlement) -- both are live SUM(amount_paise)
    # over the ledger, the same derivation ledger.account_balance uses per
    # account, just grouped by type here in one query.
    balances = conn.execute(
        "SELECT "
        "COALESCE(SUM(CASE WHEN a.account_type = 'cash' THEN l.amount_paise ELSE 0 END), 0) AS cash_paise, "
        "COALESCE(SUM(CASE WHEN a.account_type != 'cash' THEN l.amount_paise ELSE 0 END), 0) AS bank_paise "
        "FROM accounts a LEFT JOIN ledger l ON l.account_id = a.id "
        "WHERE a.deleted_at IS NULL"
    ).fetchone()

    # PLAN 2.4's outstanding formula (billed - paid), summed across every
    # customer instead of one -- walk-ins (customer_id IS NULL) have no
    # payments row to collect against (PLAN 3.1's create_transaction comment),
    # so they're not part of anyone's outstanding credit.
    pending_credits_paise = conn.execute(
        "SELECT "
        "COALESCE((SELECT SUM(total_paise) FROM transactions WHERE customer_id IS NOT NULL AND deleted_at IS NULL), 0) - "
        "COALESCE((SELECT SUM(amount_paise) FROM payments WHERE deleted_at IS NULL), 0)"
    ).fetchone()[0]

    today_customers = conn.execute(
        "SELECT COUNT(DISTINCT customer_id) FROM transactions "
        "WHERE business_date = ? AND customer_id IS NOT NULL AND deleted_at IS NULL",
        (business_date,),
    ).fetchone()[0]

    day = get_day_status(business_date, conn)

    return {
        "business_date": business_date,
        "today_income_paise": income_paise,
        "today_expenses_paise": expenses_paise,
        "today_profit_paise": income_paise - expenses_paise,
        "cash_in_hand_paise": balances["cash_paise"],
        "total_bank_balance_paise": balances["bank_paise"],
        "pending_credits_paise": pending_credits_paise,
        "today_customers": today_customers,
        "closing_status": day["status"],
    }
