import hmac
import json
import logging
import traceback

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.accounts import router as accounts_router
from app.audit import router as audit_router
from app.auth import get_current_user
from app.auth import router as auth_router
from app.backup import BACKUPS_DIR, create_backup
from app.backup import router as backup_router
from app.banking import router as banking_router
from app.closing import router as closing_router
from app.customers import router as customers_router
from app.dashboard import router as dashboard_router
from app.db import get_connection, run_migrations
from app.expenses import router as expenses_router
from app.ledger import router as ledger_router
from app.logging_setup import setup_logging, sweep_old_logs
from app.payments import router as payments_router
from app.reports import router as reports_router
from app.seed import run_seed
from app.services import router as services_router
from app.settings import settings
from app.transactions import router as transactions_router
from app.transfers import router as transfers_router

app = FastAPI(title=settings.app_name, debug=settings.debug)


# PLAN 11.1: Electron-only access. An empty app_secret (plain `python run.py`
# / `npm run dev`) disables the gate entirely. Covers every path, including
# /api/health and the SPA catch-all, so a stray browser gets no HTML either.
@app.middleware("http")
async def app_secret_gate(request, call_next):
    if settings.app_secret and not hmac.compare_digest(request.headers.get("x-cscms-app", ""), settings.app_secret):
        return JSONResponse(status_code=403, content={"detail": "forbidden"})
    return await call_next(request)


# PLAN 12.2: bodies pass through this denylist before they ever reach the log
# file — an operator can read backend.log without it becoming a plaintext
# dump of customer PII.
_REDACT_KEYS = ("password", "phone", "aadhaar", "account_number", "token")


def _redact(value):
    if isinstance(value, dict):
        return {k: ("***" if any(bad in k.lower() for bad in _REDACT_KEYS) else _redact(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [_redact(v) for v in value]
    return value


async def _log_request(request: Request, level: int, message: str) -> None:
    # Request.body() caches the raw bytes on first read (Starlette), so this
    # never starves a route — by the time an exception handler runs, the
    # route (or its pydantic body model) has already done that first read.
    # PLAN 12.5 finding: that cache is only warm if something read the body
    # *before* the crash. A GET route (or any exception raised ahead of body
    # parsing) hits this as a cold read — the request's receive channel is
    # already torn down by then, and Request.body() raises instead of
    # returning cached bytes. Uncaught, that exception escapes this handler
    # entirely, so the client falls back to a bare-text 500 instead of the
    # {detail, code} JSON contract, and this log line never gets written.
    try:
        raw = await request.body()
    except RuntimeError:
        raw = b""
    try:
        body = _redact(json.loads(raw)) if raw else None
    except ValueError:
        body = None
    logging.getLogger("app.main").log(level, "%s %s | %s | body=%s", request.method, request.url.path, message, body)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    # A 409 "business day is closed" rejection is precisely what an operator
    # phones about — every 4xx gets logged, not just 5xx.
    if 400 <= exc.status_code < 500:
        await _log_request(request, logging.WARNING, f"{exc.status_code} {exc.detail}")
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=exc.headers)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    await _log_request(request, logging.ERROR, f"unhandled exception\n{traceback.format_exc()}")
    return JSONResponse(status_code=500, content={"detail": "internal server error", "code": "internal_error"})


app.include_router(auth_router)

# PLAN 8.2: every other router requires a valid session — /api/auth/login and
# /api/health (below) are the only unauthenticated routes.
_guard = [Depends(get_current_user)]
app.include_router(accounts_router, dependencies=_guard)
app.include_router(transfers_router, dependencies=_guard)
app.include_router(ledger_router, dependencies=_guard)
app.include_router(services_router, dependencies=_guard)
app.include_router(customers_router, dependencies=_guard)
app.include_router(transactions_router, dependencies=_guard)
app.include_router(payments_router, dependencies=_guard)
app.include_router(expenses_router, dependencies=_guard)
app.include_router(banking_router, dependencies=_guard)
app.include_router(closing_router, dependencies=_guard)
app.include_router(dashboard_router, dependencies=_guard)
app.include_router(reports_router, dependencies=_guard)
app.include_router(audit_router, dependencies=_guard)
app.include_router(backup_router, dependencies=_guard)


@app.on_event("startup")
def on_startup():
    # PLAN 12.1: first, before anything else — a migration failing on a
    # customer's machine is exactly the failure this phase exists to catch.
    setup_logging(settings.log_dir)
    sweep_old_logs(settings.log_dir)
    conn = get_connection(settings.db_path)
    run_migrations(conn, settings.migrations_dir)
    run_seed(conn)
    conn.close()


@app.on_event("shutdown")
def on_shutdown():
    # PLAN 8.5: automatic backup on app close. Phase 9.2 will rewire this for
    # the packaged Electron process's own lifecycle; this is the dev-server
    # equivalent (uvicorn's graceful shutdown) for now.
    conn = get_connection(settings.db_path)
    try:
        create_backup(conn, settings.db_path, BACKUPS_DIR)
        conn.commit()
    finally:
        conn.close()


@app.get("/api/health")
def health():
    return {"status": "ok"}


# PLAN 12.4: unauthenticated by necessity — a renderer crash may be exactly
# what broke auth, so this can't sit behind get_current_user. Still behind
# app_secret_gate above, so no more reachable than any other route.
@app.post("/api/client-log")
async def client_log(request: Request):
    body = await request.body()
    try:
        payload = _redact(json.loads(body)) if body else {}
    except ValueError:
        payload = {}
    logging.getLogger("app.main").error("[client] %s", payload)
    return {"status": "logged"}


# PLAN 10.1: the Electron shell loads the built frontend from this same
# origin instead of file://, so relative /api fetches (src/lib/api.ts) keep
# working unchanged. Only mounted when a build actually exists — plain
# `python run.py` dev use (no `vite build` run) is unaffected.
if settings.frontend_dist.is_dir():
    app.mount("/assets", StaticFiles(directory=settings.frontend_dist / "assets"), name="frontend-assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        return FileResponse(settings.frontend_dist / "index.html")
