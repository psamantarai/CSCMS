"""Auth API (PLAN 8.1/8.2): bcrypt login against `users`, a bearer session
token in `sessions` (ARCHITECTURE.md §9 — token in memory on the frontend,
never localStorage), and get_current_user as the dependency every other
router is guarded with in main.py."""
import secrets
import sqlite3
from datetime import datetime, timedelta

import bcrypt
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from app.db import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])

SESSION_TTL = timedelta(hours=12)


class LoginRequest(BaseModel):
    username: str
    password: str


def _extract_token(authorization: str | None) -> str | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return authorization.removeprefix("Bearer ").strip() or None


@router.post("/login")
def login(body: LoginRequest, conn: sqlite3.Connection = Depends(get_db)):
    row = conn.execute(
        "SELECT * FROM users WHERE username = ? AND is_active = 1 AND deleted_at IS NULL",
        (body.username,),
    ).fetchone()
    if row is None or not bcrypt.checkpw(body.password.encode(), row["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="invalid username or password")

    token = secrets.token_urlsafe(32)
    expires_at = (datetime.utcnow() + SESSION_TTL).isoformat(sep=" ")
    conn.execute(
        "INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)",
        (row["id"], token, expires_at),
    )
    conn.commit()
    return {"token": token, "user": {"id": row["id"], "username": row["username"], "role": row["role"]}}


@router.post("/logout", status_code=204)
def logout(authorization: str | None = Header(default=None), conn: sqlite3.Connection = Depends(get_db)):
    token = _extract_token(authorization)
    if token:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()


def get_current_user(
    authorization: str | None = Header(default=None), conn: sqlite3.Connection = Depends(get_db)
) -> sqlite3.Row:
    """Guard dependency: every router but auth is wired to this in main.py."""
    token = _extract_token(authorization)
    if token is None:
        raise HTTPException(status_code=401, detail="not authenticated")
    row = conn.execute(
        "SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id "
        "WHERE sessions.token = ? AND sessions.expires_at > datetime('now') "
        "AND users.is_active = 1 AND users.deleted_at IS NULL",
        (token,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="session expired or invalid")
    return row
