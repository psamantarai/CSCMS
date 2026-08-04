from fastapi import FastAPI

from app.accounts import router as accounts_router
from app.customers import router as customers_router
from app.db import get_connection, run_migrations
from app.ledger import router as ledger_router
from app.payments import router as payments_router
from app.seed import run_seed
from app.services import router as services_router
from app.settings import settings
from app.transactions import router as transactions_router
from app.transfers import router as transfers_router

app = FastAPI(title=settings.app_name, debug=settings.debug)
app.include_router(accounts_router)
app.include_router(transfers_router)
app.include_router(ledger_router)
app.include_router(services_router)
app.include_router(customers_router)
app.include_router(transactions_router)
app.include_router(payments_router)


@app.on_event("startup")
def on_startup():
    conn = get_connection(settings.db_path)
    run_migrations(conn, settings.migrations_dir)
    run_seed(conn)
    conn.close()


@app.get("/api/health")
def health():
    return {"status": "ok"}
