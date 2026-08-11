import logging
import logging.handlers
import time
from pathlib import Path

# PLAN 12.1: a shop closed on Sunday writes no Sunday file, and a machine left
# off for a week rotates nothing at all (rollover only fires when a running
# process emits a record) — so TimedRotatingFileHandler's backupCount alone
# counts FILES, not DAYS. sweep_old_logs() below is what actually enforces
# this as a 5-day age limit, by mtime, at every startup.
LOG_RETENTION_DAYS = 5


def setup_logging(log_dir: Path) -> None:
    """Attach a rotating file handler to root plus the uvicorn loggers.
    uvicorn.access has propagate=False in uvicorn's own logging config, so
    root alone would miss it and needs the handler directly. uvicorn.error,
    by contrast, propagates up to "uvicorn" (which has propagate=False and
    stops there) — attaching to both "uvicorn" and "uvicorn.error" would
    double-write every line that logger emits, so only "uvicorn" gets it."""
    log_dir.mkdir(parents=True, exist_ok=True)
    handler = logging.handlers.TimedRotatingFileHandler(
        log_dir / "backend.log", when="midnight", backupCount=LOG_RETENTION_DAYS
    )
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))

    for name in ("", "uvicorn", "uvicorn.access"):
        logger = logging.getLogger(name)
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)


def sweep_old_logs(log_dir: Path) -> None:
    """Delete rotated backend.log.* files older than LOG_RETENTION_DAYS by
    mtime. Never touches backend.log itself (no dot-suffix, doesn't match)."""
    if not log_dir.is_dir():
        return
    cutoff = time.time() - LOG_RETENTION_DAYS * 86400
    for f in log_dir.glob("backend.log.*"):
        if f.stat().st_mtime < cutoff:
            f.unlink()
