from fastapi import FastAPI

from app.settings import settings

app = FastAPI(title=settings.app_name, debug=settings.debug)


@app.get("/api/health")
def health():
    return {"status": "ok"}
