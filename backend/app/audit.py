"""audit_logs writer (PLAN 8.3, ARCHITECTURE.md §9): before/after JSON on
every financial mutation. `before`/`after` are row dicts (or None for a
create's before / a bulk create's per-row after) — the caller passes exactly
what changed. Also the PLAN 8.4 viewer: a filtered, paginated read of the
same table, same shape as list_ledger/list_expenses."""
import json
import sqlite3

from fastapi import APIRouter, Depends

from app.db import get_db

router = APIRouter(prefix="/api/audit", tags=["audit"])

MAX_LIST_LIMIT = 500  # same cap/clamp pattern as list_expenses (H.6)


def write_audit(
    conn: sqlite3.Connection, *, table_name: str, row_id: int, action: str,
    before: dict | None, after: dict | None, user_id: int,
) -> None:
    conn.execute(
        "INSERT INTO audit_logs (table_name, row_id, action, before_json, after_json, user_id) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (
            table_name, row_id, action,
            json.dumps(before) if before is not None else None,
            json.dumps(after) if after is not None else None,
            user_id,
        ),
    )


@router.get("")
def list_audit_logs(
    table_name: str | None = None,
    action: str | None = None,
    user_id: int | None = None,
    business_date: str | None = None,
    limit: int = 50,
    offset: int = 0,
    conn: sqlite3.Connection = Depends(get_db),
):
    if limit < 1 or limit > MAX_LIST_LIMIT:
        limit = MAX_LIST_LIMIT
    offset = max(0, offset)

    where = []
    params: list = []
    if table_name:
        where.append("audit_logs.table_name = ?")
        params.append(table_name)
    if action:
        where.append("audit_logs.action = ?")
        params.append(action)
    if user_id is not None:
        where.append("audit_logs.user_id = ?")
        params.append(user_id)
    if business_date:
        where.append("date(audit_logs.created_at) = ?")
        params.append(business_date)
    clause = f"WHERE {' AND '.join(where)}" if where else ""

    total = conn.execute(f"SELECT COUNT(*) FROM audit_logs {clause}", params).fetchone()[0]
    rows = conn.execute(
        f"SELECT audit_logs.*, users.username FROM audit_logs "
        f"LEFT JOIN users ON users.id = audit_logs.user_id "
        f"{clause} ORDER BY audit_logs.id DESC LIMIT ? OFFSET ?",
        (*params, limit, offset),
    ).fetchall()
    return {"items": [dict(r) for r in rows], "total": total, "limit": limit, "offset": offset}
