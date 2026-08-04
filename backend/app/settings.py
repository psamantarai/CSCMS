import os
from dataclasses import dataclass
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    app_name: str = "CSCMS"
    host: str = os.environ.get("CSCMS_HOST", "127.0.0.1")
    port: int = int(os.environ.get("CSCMS_PORT", "8000"))
    debug: bool = os.environ.get("CSCMS_DEBUG", "false").lower() == "true"
    db_path: Path = Path(os.environ.get("CSCMS_DB_PATH", BACKEND_DIR / "data" / "cscms.db"))
    migrations_dir: Path = BACKEND_DIR / "migrations"


settings = Settings()
