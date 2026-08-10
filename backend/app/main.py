from fastapi import Depends, FastAPI
from fastapi.responses import FileResponse
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
from app.payments import router as payments_router
from app.reports import router as reports_router
from app.seed import run_seed
from app.services import router as services_router
from app.settings import settings
from app.transactions import router as transactions_router
from app.transfers import router as transfers_router

app = FastAPI(title=settings.app_name, debug=settings.debug)
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


# PLAN 10.1: the Electron shell loads the built frontend from this same
# origin instead of file://, so relative /api fetches (src/lib/api.ts) keep
# working unchanged. Only mounted when a build actually exists — plain
# `python run.py` dev use (no `vite build` run) is unaffected.
if settings.frontend_dist.is_dir():
    app.mount("/assets", StaticFiles(directory=settings.frontend_dist / "assets"), name="frontend-assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        return FileResponse(settings.frontend_dist / "index.html")
