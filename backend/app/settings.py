import os
import sys
from dataclasses import dataclass
from pathlib import Path

# PLAN 10.2: a PyInstaller --onedir build sets sys.frozen and extracts
# --add-data (migrations/) under sys._MEIPASS (the exe's _internal/ folder),
# not next to this file.
if getattr(sys, "frozen", False):
    BACKEND_DIR = Path(sys._MEIPASS)
else:
    BACKEND_DIR = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    app_name: str = "CSCMS"
    host: str = os.environ.get("CSCMS_HOST", "127.0.0.1")
    port: int = int(os.environ.get("CSCMS_PORT", "8000"))
    debug: bool = os.environ.get("CSCMS_DEBUG", "false").lower() == "true"
    db_path: Path = Path(os.environ.get("CSCMS_DB_PATH", BACKEND_DIR / "data" / "cscms.db"))
    migrations_dir: Path = BACKEND_DIR / "migrations"
    # PLAN 10.1: the Electron shell points this at the built frontend it
    # spawned us from; dev (`python run.py` from source) falls back to the
    # repo-root dist/ that `vite build` produces.
    frontend_dist: Path = Path(os.environ.get("CSCMS_FRONTEND_DIST", BACKEND_DIR.parent / "dist"))
    # PLAN 11.1: Electron sets this to a per-launch random secret and sends it
    # back as X-CSCMS-App on every request. Empty (the `python run.py` / `npm
    # run dev` default) disables the gate entirely.
    app_secret: str = os.environ.get("CSCMS_APP_SECRET", "")

    @property
    def log_dir(self) -> Path:
        # PLAN 12.1: derived from db_path, not a new env var — Electron
        # already points CSCMS_DB_PATH at userData, so the packaged app lands
        # here with no change to main.cjs's env block.
        return self.db_path.parent / "logs"


settings = Settings()
