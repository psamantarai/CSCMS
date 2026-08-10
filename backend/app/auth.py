"""Auth API (PLAN 8.1/8.2, 9.9): bcrypt login against `users`, an httpOnly
session cookie (ARCHITECTURE.md §9 — unreadable via JS/document.cookie,
replacing the old in-memory bearer token so a page reload survives), and
get_current_user as the dependency every other router is guarded with in
main.py."""
import secrets
import sqlite3
from datetime import datetime, timedelta

import bcrypt
from fastapi import APIRouter, Cookie, Depends, HTTPException
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from app.db import begin_write, get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])

SESSION_TTL = timedelta(hours=12)
SESSION_COOKIE = "session"


class LoginRequest(BaseModel):
    username: str
    password: str


class BootstrapRequest(BaseModel):
    username: str
    password: str
    shop_name: str | None = None


def _issue_session(user_id: int, conn: sqlite3.Connection) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = (datetime.utcnow() + SESSION_TTL).isoformat(sep=" ")
    conn.execute(
        "INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)",
        (user_id, token, expires_at),
    )
    return token


def _session_response(body: dict, token: str) -> JSONResponse:
    """9.9.1: cookie carries the token instead of the JSON body. Secure isn't
    set — the API is loopback-only (ARCHITECTURE.md §9), often plain http."""
    resp = JSONResponse(body)
    resp.set_cookie(
        SESSION_COOKIE, token, httponly=True, samesite="strict", path="/",
        max_age=int(SESSION_TTL.total_seconds()),
    )
    return resp


@router.post("/login")
def login(body: LoginRequest, conn: sqlite3.Connection = Depends(get_db)):
    row = conn.execute(
        "SELECT * FROM users WHERE username = ? AND is_active = 1 AND deleted_at IS NULL",
        (body.username,),
    ).fetchone()
    if row is None or not bcrypt.checkpw(body.password.encode(), row["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="invalid username or password")

    token = _issue_session(row["id"], conn)
    conn.commit()
    return _session_response({"user": {"id": row["id"], "username": row["username"], "role": row["role"]}}, token)


@router.get("/bootstrap")
def bootstrap_status(conn: sqlite3.Connection = Depends(get_db)):
    """9.8.1: unauthenticated by design — nothing exists yet to authenticate
    against. Lets the frontend decide whether to show /setup before login."""
    needed = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0
    return {"needed": needed}


@router.post("/bootstrap")
def bootstrap(body: BootstrapRequest, conn: sqlite3.Connection = Depends(get_db)):
    """9.8.1: creates the first admin account, only when zero users exist
    (409 otherwise) — permanently dead once one does. H.11: begin_write
    before the count guard so two concurrent first-run submits can't both
    pass it. Shop name (9.8.2) rides along here rather than a separate
    settings endpoint, since it's collected on the same first screen."""
    begin_write(conn)
    try:
        if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] != 0:
            raise HTTPException(status_code=409, detail="setup already completed")

        password_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')",
            (body.username, password_hash),
        )
        user_id = cur.lastrowid

        if body.shop_name and body.shop_name.strip():
            conn.execute(
                "INSERT INTO settings (key, value) VALUES ('shop_name', ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (body.shop_name.strip(),),
            )

        token = _issue_session(user_id, conn)
    except Exception:
        conn.rollback()
        raise
    conn.commit()
    return _session_response({"user": {"id": user_id, "username": body.username, "role": "admin"}}, token)


@router.post("/logout", status_code=204)
def logout(session: str | None = Cookie(default=None), conn: sqlite3.Connection = Depends(get_db)):
    if session:
        conn.execute("DELETE FROM sessions WHERE token = ?", (session,))
        conn.commit()
    resp = Response(status_code=204)
    resp.delete_cookie(SESSION_COOKIE, path="/")
    return resp


def get_current_user(
    session: str | None = Cookie(default=None), conn: sqlite3.Connection = Depends(get_db)
) -> sqlite3.Row:
    """Guard dependency: every router but auth is wired to this in main.py."""
    if session is None:
        raise HTTPException(status_code=401, detail="not authenticated")
    row = conn.execute(
        "SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id "
        "WHERE sessions.token = ? AND sessions.expires_at > datetime('now') "
        "AND users.is_active = 1 AND users.deleted_at IS NULL",
        (session,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="session expired or invalid")
    return row


@router.get("/me")
def me(user: sqlite3.Row = Depends(get_current_user)):
    """9.9.2: mount-restore endpoint — the frontend calls this once on load
    instead of starting logged out on every reload; 401 (via get_current_user)
    means no valid session cookie."""
    return {"user": {"id": user["id"], "username": user["username"], "role": user["role"]}}
