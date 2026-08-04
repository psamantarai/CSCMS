"""Services CRUD (ARCHITECTURE.md §4). Deactivating a service (is_active=0)
hides it from pickers via the active_only filter but never deletes the row —
past transactions keep referencing it."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.db import get_db

router = APIRouter(prefix="/api/services", tags=["services"])

# H.4: name/category/default_fee_paise/default_charge_paise/is_active are all
# NOT NULL columns; see accounts.py for why these validators only fire on an
# explicit value, not on an omitted PATCH field.
_INT64_MIN, _INT64_MAX = -(2**63), 2**63 - 1


def _required_str(v: str | None) -> str:
    if v is None or not v.strip():
        raise ValueError("must not be null or blank")
    return v.strip()


def _not_null(v):
    if v is None:
        raise ValueError("must not be null")
    return v


class ServiceCreate(BaseModel):
    name: str
    category: str
    default_fee_paise: int = Field(0, ge=_INT64_MIN, le=_INT64_MAX)
    default_charge_paise: int = Field(0, ge=_INT64_MIN, le=_INT64_MAX)

    _v_name = field_validator("name")(_required_str)
    _v_category = field_validator("category")(_required_str)


class ServiceUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    default_fee_paise: int | None = Field(default=None, ge=_INT64_MIN, le=_INT64_MAX)
    default_charge_paise: int | None = Field(default=None, ge=_INT64_MIN, le=_INT64_MAX)
    is_active: bool | None = None

    _v_name = field_validator("name")(_required_str)
    _v_category = field_validator("category")(_required_str)
    _v_default_fee_paise = field_validator("default_fee_paise")(_not_null)
    _v_default_charge_paise = field_validator("default_charge_paise")(_not_null)
    _v_is_active = field_validator("is_active")(_not_null)


def _row_to_dict(row: sqlite3.Row) -> dict:
    return dict(row)


def _get_or_404(conn: sqlite3.Connection, service_id: int) -> sqlite3.Row:
    row = conn.execute(
        "SELECT * FROM services WHERE id = ? AND deleted_at IS NULL", (service_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="service not found")
    return row


@router.get("")
def list_services(active_only: bool = False, conn: sqlite3.Connection = Depends(get_db)):
    query = "SELECT * FROM services WHERE deleted_at IS NULL"
    if active_only:
        query += " AND is_active = 1"
    query += " ORDER BY id"
    rows = conn.execute(query).fetchall()
    return [_row_to_dict(r) for r in rows]


@router.post("", status_code=201)
def create_service(body: ServiceCreate, conn: sqlite3.Connection = Depends(get_db)):
    cur = conn.execute(
        "INSERT INTO services (name, category, default_fee_paise, default_charge_paise) "
        "VALUES (?, ?, ?, ?)",
        (body.name, body.category, body.default_fee_paise, body.default_charge_paise),
    )
    conn.commit()
    return _row_to_dict(_get_or_404(conn, cur.lastrowid))


@router.get("/{service_id}")
def get_service(service_id: int, conn: sqlite3.Connection = Depends(get_db)):
    return _row_to_dict(_get_or_404(conn, service_id))


@router.patch("/{service_id}")
def update_service(service_id: int, body: ServiceUpdate, conn: sqlite3.Connection = Depends(get_db)):
    _get_or_404(conn, service_id)
    fields = body.model_dump(exclude_unset=True)
    if fields:
        if "is_active" in fields:
            fields["is_active"] = int(fields["is_active"])
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE services SET {set_clause}, updated_at = datetime('now') WHERE id = ?",
            (*fields.values(), service_id),
        )
        conn.commit()
    return _row_to_dict(_get_or_404(conn, service_id))
