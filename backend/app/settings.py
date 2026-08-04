import os
from dataclasses import dataclass
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    app_name: str = "RSCMS"
    host: str = os.environ.get("RSCMS_HOST", "127.0.0.1")
    port: int = int(os.environ.get("RSCMS_PORT", "8000"))
    debug: bool = os.environ.get("RSCMS_DEBUG", "false").lower() == "true"
    db_path: Path = Path(os.environ.get("RSCMS_DB_PATH", BACKEND_DIR / "data" / "rscms.db"))
    migrations_dir: Path = BACKEND_DIR / "migrations"


settings = Settings()
