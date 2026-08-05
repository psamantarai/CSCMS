"""Backup & restore (PLAN 8.5/8.6, ARCHITECTURE.md §9): `VACUUM INTO` gives a
consistent timestamped copy without stopping the app; retention count comes
from the `settings` table (seeded by app/seed.py). Restore always backs up
the current DB first, and requires the caller to pass confirm=true — the
API-level equivalent of a UI's "are you sure" step."""
import shutil
import sqlite3
import threading
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.db import get_db
from app.settings import settings as app_settings

router = APIRouter(prefix="/api/backup", tags=["backup"])

BACKUPS_DIR = app_settings.db_path.parent / "backups"

# H.46: concurrent create_backup() calls raced their own retention sweeps —
# one request's glob()-then-unlink could delete a file a concurrent request
# just created but hadn't returned yet. ponytail: global lock — single-
# operator offline app; per-request queueing only if throughput ever matters.
_backup_lock = threading.Lock()
_backup_sizes: dict[Path, int] = {}  # path -> size at creation time, see create_backup
# ponytail: only create_backup_endpoint ever pops an entry — restore's safety
# copy, on_shutdown's backup, and direct test calls leave theirs, so this
# grows by one small (Path, int) pair per non-endpoint create_backup() call
# for the life of the process. Prune on eviction (or switch to an LRU) if
# that ever adds up on a long-running install.


def _retention_count(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT value FROM settings WHERE key = 'backup_retention_count'").fetchone()
    return int(row["value"]) if row else 5


def create_backup(conn: sqlite3.Connection, db_path: Path, backups_dir: Path, keep: str | None = None) -> Path:
    """Returns the new backup's path. `path.stat()` right after this call is
    safe for callers that don't run concurrently with other create_backup()
    calls (tests, on_shutdown); create_backup_endpoint below reads the size
    from _backup_sizes instead, captured under the same lock as the file's
    own creation — see H.46."""
    backups_dir.mkdir(parents=True, exist_ok=True)
    with _backup_lock:
        # microsecond precision so two backups triggered in the same second (a
        # double-click on "Backup Now") don't collide on VACUUM INTO's target file.
        timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%S_%f")
        backup_path = backups_dir / f"{db_path.stem}_{timestamp}.db"
        conn.execute("VACUUM INTO ?", (str(backup_path),))
        # H.46: read the size now, while still holding the lock — a
        # concurrent request's retention sweep (below) only ever runs inside
        # this same lock, so this can't race a later eviction the way a
        # post-return backup_path.stat() call from the caller could.
        _backup_sizes[backup_path] = backup_path.stat().st_size

        retention = max(1, _retention_count(conn))
        # H.45: `keep` excludes a file (the one restore is about to read) from
        # this sweep — otherwise restore's own safety-backup step could evict the
        # very file it was asked to restore.
        existing = [f for f in sorted(backups_dir.glob(f"{db_path.stem}_*.db")) if f.name != keep]
        for stale in existing[:-retention]:
            stale.unlink(missing_ok=True)
    return backup_path


def list_backups(backups_dir: Path) -> list[dict]:
    if not backups_dir.exists():
        return []
    files = sorted(backups_dir.glob("*.db"), reverse=True)
    return [
        {
            "filename": f.name,
            "size_bytes": f.stat().st_size,
            "created_at": datetime.fromtimestamp(f.stat().st_mtime).isoformat(sep=" ", timespec="seconds"),
        }
        for f in files
    ]


def restore_backup(conn: sqlite3.Connection, db_path: Path, backups_dir: Path, filename: str) -> None:
    backup_path = backups_dir / filename
    if backup_path.parent.resolve() != backups_dir.resolve() or not backup_path.is_file():
        raise HTTPException(status_code=404, detail="backup not found")

    check = sqlite3.connect(backup_path)
    try:
        check.execute("PRAGMA integrity_check").fetchone()
        if check.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ledger'").fetchone() is None:
            raise HTTPException(status_code=400, detail="backup file is not a CSCMS database")
    except sqlite3.DatabaseError:
        raise HTTPException(status_code=400, detail="backup file is not a valid SQLite database")
    finally:
        check.close()

    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    conn.close()
    for suffix in ("-wal", "-shm"):
        Path(str(db_path) + suffix).unlink(missing_ok=True)
    shutil.copyfile(backup_path, db_path)


class RestoreRequest(BaseModel):
    filename: str
    confirm: bool = False


@router.post("", status_code=201)
def create_backup_endpoint(conn: sqlite3.Connection = Depends(get_db)):
    path = create_backup(conn, app_settings.db_path, BACKUPS_DIR)
    conn.commit()
    return {"filename": path.name, "size_bytes": _backup_sizes.pop(path)}


@router.get("")
def list_backups_endpoint():
    return {"items": list_backups(BACKUPS_DIR)}


@router.post("/restore", status_code=204)
def restore_endpoint(body: RestoreRequest, conn: sqlite3.Connection = Depends(get_db)):
    if not body.confirm:
        raise HTTPException(status_code=400, detail="confirm must be true to restore")
    create_backup(conn, app_settings.db_path, BACKUPS_DIR, keep=body.filename)  # safety copy of current state first
    restore_backup(conn, app_settings.db_path, BACKUPS_DIR, body.filename)
