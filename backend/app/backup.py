"""Backup & restore (PLAN 8.5/8.6, ARCHITECTURE.md §9): `VACUUM INTO` gives a
consistent timestamped copy without stopping the app; retention count comes
from the `settings` table (seeded by app/seed.py). Restore always backs up
the current DB first, and requires the caller to pass confirm=true — the
API-level equivalent of a UI's "are you sure" step."""
import logging
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
MIRROR_DIR = app_settings.mirror_backups_dir  # PLAN 16.2

# H.46: concurrent create_backup() calls raced their own retention sweeps —
# one request's glob()-then-unlink could delete a file a concurrent request
# just created but hadn't returned yet. ponytail: global lock — single-
# operator offline app; per-request queueing only if throughput ever matters.
_backup_lock = threading.Lock()
_backup_sizes: dict[Path, int] = {}  # path -> size at creation time, see create_backup
_mirror_status: dict[Path, dict] = {}  # path -> mirror result at creation time, see create_backup
# ponytail: only create_backup_endpoint ever pops an entry from either dict —
# restore's safety copy, on_shutdown's backup, and direct test calls leave
# theirs, so these grow by one small entry per non-endpoint create_backup()
# call for the life of the process. Prune on eviction (or switch to an LRU)
# if that ever adds up on a long-running install.

# PLAN 16.3: unlike _mirror_status above (per-backup, popped by the endpoint
# that made it), this is the mirror's standing health — never popped, always
# overwritten by the most recent mirror attempt from *any* caller (endpoint,
# on_shutdown, restore's safety copy), so GET /api/backup can show it without
# needing a fresh backup to have just happened.
_mirror_health: dict = {"dir": str(MIRROR_DIR), "ok": None, "error": None, "last_checked_at": None, "last_success_at": None}


def _record_mirror_health(status: dict) -> None:
    now = datetime.utcnow().isoformat(sep=" ", timespec="seconds")
    _mirror_health["dir"] = status["dir"]
    _mirror_health["ok"] = status["ok"]
    _mirror_health["error"] = status["error"]
    _mirror_health["last_checked_at"] = now
    if status["ok"]:
        _mirror_health["last_success_at"] = now


def _retention_count(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT value FROM settings WHERE key = 'backup_retention_count'").fetchone()
    return int(row["value"]) if row else 5


# PLAN 16.4: not prefixed with _ like the helpers above — main.py's
# on_shutdown imports this one too, so the operator's choice covers the
# automatic close-time backup, not just the manual/restore paths.
def get_mirror_dir(conn: sqlite3.Connection) -> Path:
    row = conn.execute("SELECT value FROM settings WHERE key = 'backup_mirror_dir'").fetchone()
    if row and row["value"]:
        return Path(row["value"])
    return MIRROR_DIR


def _mirror_backup(mirror_dir: Path, db_path: Path, backup_path: Path, retention: int, keep: str | None) -> dict:
    """Best-effort copy of a just-created backup outside the install
    directory (PLAN 16.2), plus its own retention sweep over the mirror's own
    directory listing — run inside the same _backup_lock as the primary
    write, since an unsynchronised sweep on either side is exactly H.46. A
    failure here must never fail the primary backup; the caller decides what
    to do with the returned status."""
    try:
        mirror_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(backup_path, mirror_dir / backup_path.name)
        existing = [f for f in sorted(mirror_dir.glob(f"{db_path.stem}_*.db")) if f.name != keep]
        for stale in existing[:-retention]:
            stale.unlink(missing_ok=True)
        return {"ok": True, "dir": str(mirror_dir), "error": None}
    except OSError as e:
        logging.getLogger(__name__).warning("backup mirror to %s failed: %s", mirror_dir, e)
        return {"ok": False, "dir": str(mirror_dir), "error": str(e)}


def create_backup(
    conn: sqlite3.Connection,
    db_path: Path,
    backups_dir: Path,
    keep: str | None = None,
    mirror_dir: Path | None = None,
) -> Path:
    """Returns the new backup's path. `path.stat()` right after this call is
    safe for callers that don't run concurrently with other create_backup()
    calls (tests, on_shutdown); create_backup_endpoint below reads the size
    from _backup_sizes instead, captured under the same lock as the file's
    own creation — see H.46. mirror_dir is None by default so existing
    callers and tests are unaffected; real endpoints pass get_mirror_dir(conn)
    (PLAN 16.4 — the operator's configured location, falling back to
    MIRROR_DIR) so a change takes effect without a restart."""
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

        if mirror_dir is not None:
            status = _mirror_backup(mirror_dir, db_path, backup_path, retention, keep)
            _mirror_status[backup_path] = status
            _record_mirror_health(status)
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


class MirrorLocationUpdate(BaseModel):
    # PLAN 16.4: None (or blank) clears the operator's override and reverts
    # to MIRROR_DIR — no separate "reset" endpoint needed for one field.
    dir: str | None = None


@router.post("", status_code=201)
def create_backup_endpoint(conn: sqlite3.Connection = Depends(get_db)):
    path = create_backup(conn, app_settings.db_path, BACKUPS_DIR, mirror_dir=get_mirror_dir(conn))
    conn.commit()
    return {"filename": path.name, "size_bytes": _backup_sizes.pop(path), "mirror": _mirror_status.pop(path)}


@router.get("")
def list_backups_endpoint():
    return {"items": list_backups(BACKUPS_DIR), "mirror": _mirror_health}


@router.get("/mirror-location")
def get_mirror_location(conn: sqlite3.Connection = Depends(get_db)):
    row = conn.execute("SELECT value FROM settings WHERE key = 'backup_mirror_dir'").fetchone()
    configured = row["value"] if row and row["value"] else None
    return {"dir": str(get_mirror_dir(conn)), "configured": configured, "default": str(MIRROR_DIR)}


@router.patch("/mirror-location")
def set_mirror_location(body: MirrorLocationUpdate, conn: sqlite3.Connection = Depends(get_db)):
    value = (body.dir or "").strip()
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('backup_mirror_dir', ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (value,),
    )
    conn.commit()
    return get_mirror_location(conn)


@router.post("/restore", status_code=204)
def restore_endpoint(body: RestoreRequest, conn: sqlite3.Connection = Depends(get_db)):
    if not body.confirm:
        raise HTTPException(status_code=400, detail="confirm must be true to restore")
    create_backup(conn, app_settings.db_path, BACKUPS_DIR, keep=body.filename, mirror_dir=get_mirror_dir(conn))  # safety copy of current state first
    restore_backup(conn, app_settings.db_path, BACKUPS_DIR, body.filename)
