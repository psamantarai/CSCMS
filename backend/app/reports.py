"""Reports (PLAN 7.3/7.4, PRD §3/§8): monthly and service/customer-wise
breakdowns, each a live derivation off the ledger so a total here always
equals a direct SUM over ledger for the same period -- nothing cached.

Daily reporting is already covered by GET /api/day/{date}/report (PLAN 6.5) --
the same opening/received/paid/transfer/closing-per-account breakdown a
"daily report" needs -- so it isn't rebuilt here."""
import calendar
import sqlite3

from fastapi import APIRouter, Depends, HTTPException

from app.db import get_db
from app.ledger import income_expenses

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/monthly")
def monthly_report(year: int, month: int, conn: sqlite3.Connection = Depends(get_db)):
    if not (1 <= month <= 12):
        raise HTTPException(status_code=400, detail="month must be between 1 and 12")
    start_date = f"{year:04d}-{month:02d}-01"
    end_date = f"{year:04d}-{month:02d}-{calendar.monthrange(year, month)[1]:02d}"
    income_paise, expenses_paise = income_expenses(conn, start_date, end_date)
    return {
        "year": year, "month": month, "start_date": start_date, "end_date": end_date,
        "income_paise": income_paise, "expenses_paise": expenses_paise,
        "profit_paise": income_paise - expenses_paise,
    }


def _date_filters(column: str, start_date: str | None, end_date: str | None, params: list) -> list[str]:
    clauses = []
    if start_date:
        clauses.append(f"{column} >= ?")
        params.append(start_date)
    if end_date:
        clauses.append(f"{column} <= ?")
        params.append(end_date)
    return clauses


@router.get("/service-wise")
def service_wise_report(start_date: str | None = None, end_date: str | None = None, conn: sqlite3.Connection = Depends(get_db)):
    """Per service: transactions billed in the period (from `transactions`)
    alongside income actually recognised in the period (a direct ledger SUM,
    joined back to the transaction it was posted against -- includes any
    reversal/replacement from a correction, so a corrected transaction nets
    to its corrected figure rather than double-counting)."""
    services = conn.execute("SELECT id, name, is_active FROM services ORDER BY name").fetchall()

    billed_params: list = []
    billed_clauses = ["deleted_at IS NULL"] + _date_filters("business_date", start_date, end_date, billed_params)
    billed = {r["service_id"]: r for r in conn.execute(
        f"SELECT service_id, COUNT(*) AS transaction_count, COALESCE(SUM(total_paise), 0) AS billed_paise "
        f"FROM transactions WHERE {' AND '.join(billed_clauses)} GROUP BY service_id", billed_params
    ).fetchall()}

    income_params: list = []
    income_clauses = ["l.source_type = 'transaction'", "t.deleted_at IS NULL"] + _date_filters("l.business_date", start_date, end_date, income_params)
    income = {r["service_id"]: r["income_paise"] for r in conn.execute(
        f"SELECT t.service_id AS service_id, COALESCE(SUM(l.amount_paise), 0) AS income_paise "
        f"FROM ledger l JOIN transactions t ON t.id = l.source_id "
        f"WHERE {' AND '.join(income_clauses)} GROUP BY t.service_id", income_params
    ).fetchall()}

    return [
        {
            "service_id": s["id"], "service_name": s["name"], "is_active": bool(s["is_active"]),
            "transaction_count": billed[s["id"]]["transaction_count"] if s["id"] in billed else 0,
            "billed_paise": billed[s["id"]]["billed_paise"] if s["id"] in billed else 0,
            "income_paise": income.get(s["id"], 0),
        }
        for s in services
    ]


@router.get("/customer-wise")
def customer_wise_report(start_date: str | None = None, end_date: str | None = None, conn: sqlite3.Connection = Depends(get_db)):
    """Per customer: transactions billed in the period plus everything
    actually collected in the period -- both the creation-time payment
    (ledger service_income tied to their transactions) and any later
    settlement (ledger customer_payment tied to their payments rows). Both
    halves are direct ledger SUMs, so `collected_paise` always reconciles."""
    customers = conn.execute("SELECT id, name FROM customers WHERE deleted_at IS NULL ORDER BY name").fetchall()

    billed_params: list = []
    billed_clauses = ["customer_id IS NOT NULL", "deleted_at IS NULL"] + _date_filters("business_date", start_date, end_date, billed_params)
    billed = {r["customer_id"]: r for r in conn.execute(
        f"SELECT customer_id, COUNT(*) AS transaction_count, COALESCE(SUM(total_paise), 0) AS billed_paise "
        f"FROM transactions WHERE {' AND '.join(billed_clauses)} GROUP BY customer_id", billed_params
    ).fetchall()}

    txn_income_params: list = []
    txn_income_clauses = ["l.source_type = 'transaction'", "t.customer_id IS NOT NULL", "t.deleted_at IS NULL"] + \
        _date_filters("l.business_date", start_date, end_date, txn_income_params)
    txn_income = {r["customer_id"]: r["income_paise"] for r in conn.execute(
        f"SELECT t.customer_id AS customer_id, COALESCE(SUM(l.amount_paise), 0) AS income_paise "
        f"FROM ledger l JOIN transactions t ON t.id = l.source_id "
        f"WHERE {' AND '.join(txn_income_clauses)} GROUP BY t.customer_id", txn_income_params
    ).fetchall()}

    payment_params: list = []
    payment_clauses = ["l.source_type = 'payment'"] + _date_filters("l.business_date", start_date, end_date, payment_params)
    settled = {r["customer_id"]: r["collected_paise"] for r in conn.execute(
        f"SELECT p.customer_id AS customer_id, COALESCE(SUM(l.amount_paise), 0) AS collected_paise "
        f"FROM ledger l JOIN payments p ON p.id = l.source_id "
        f"WHERE {' AND '.join(payment_clauses)} GROUP BY p.customer_id", payment_params
    ).fetchall()}

    return [
        {
            "customer_id": c["id"], "customer_name": c["name"],
            "transaction_count": billed[c["id"]]["transaction_count"] if c["id"] in billed else 0,
            "billed_paise": billed[c["id"]]["billed_paise"] if c["id"] in billed else 0,
            "collected_paise": txn_income.get(c["id"], 0) + settled.get(c["id"], 0),
        }
        for c in customers
    ]
