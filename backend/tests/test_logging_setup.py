"""Self-check for app/logging_setup.py. Run: python tests/test_logging_setup.py"""
import logging
import logging.config
import os
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.logging_setup import LOG_RETENTION_DAYS, setup_logging, sweep_old_logs


def _reset_handlers():
    for name in ("", "uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(name)
        for h in list(logger.handlers):
            logger.removeHandler(h)
            h.close()


def test_startup_creates_log_file_and_appends_on_restart():
    with tempfile.TemporaryDirectory() as tmp:
        log_dir = Path(tmp) / "logs"
        try:
            setup_logging(log_dir)
            logging.getLogger("uvicorn").info("started")
            log_path = log_dir / "backend.log"
            assert log_path.exists()
            assert "started" in log_path.read_text()

            # Simulate a restart: fresh handler, same file — must append, not truncate.
            _reset_handlers()
            setup_logging(log_dir)
            logging.getLogger(__name__).info("second run")
            content = log_path.read_text()
            assert "started" in content and "second run" in content
        finally:
            _reset_handlers()


def test_uvicorn_access_logger_reaches_the_file():
    """uvicorn.access has propagate=False in uvicorn's own config — the
    handler must be attached to it directly, not just to root."""
    with tempfile.TemporaryDirectory() as tmp:
        log_dir = Path(tmp) / "logs"
        try:
            setup_logging(log_dir)
            access_logger = logging.getLogger("uvicorn.access")
            access_logger.propagate = False
            access_logger.info("GET /api/health 200")
            assert "GET /api/health 200" in (log_dir / "backend.log").read_text()
        finally:
            _reset_handlers()


def test_uvicorn_error_is_captured_exactly_once():
    """uvicorn.error propagates to its parent "uvicorn" logger before
    stopping — attaching the handler to both would double-write every line
    uvicorn's own startup/shutdown logging emits. uvicorn.run() applies its
    own dictConfig (setting "uvicorn".propagate=False) before our startup
    event runs, so this test applies that same config first to match real
    conditions — without it, "uvicorn.error"'s message would keep
    propagating past "uvicorn" all the way to root, which a bare unit test
    would never see uvicorn set up on its own."""
    import uvicorn.config

    logging.config.dictConfig(uvicorn.config.LOGGING_CONFIG)
    with tempfile.TemporaryDirectory() as tmp:
        log_dir = Path(tmp) / "logs"
        try:
            setup_logging(log_dir)
            logging.getLogger("uvicorn.error").info("Application startup complete.")
            lines = (log_dir / "backend.log").read_text().splitlines()
            matches = [line for line in lines if "Application startup complete." in line]
            assert len(matches) == 1, f"expected exactly one occurrence, got {len(matches)}: {lines}"
        finally:
            _reset_handlers()


def test_sweep_boundary_at_exactly_retention_days_is_stable():
    """A file exactly LOG_RETENTION_DAYS old must not flap between kept and
    deleted across repeated runs — the mtime-based cutoff is a single fixed
    threshold, not a calendar-date comparison that could shift with time of
    day."""
    with tempfile.TemporaryDirectory() as tmp:
        log_dir = Path(tmp)
        f = log_dir / "backend.log.boundary"
        f.write_text("old")
        mtime = time.time() - LOG_RETENTION_DAYS * 86400
        os.utime(f, (mtime, mtime))

        sweep_old_logs(log_dir)
        first = f.exists()
        sweep_old_logs(log_dir)
        second = f.exists()
        assert first == second, "boundary file's survival flapped between runs"


def test_sweep_deletes_only_rotated_files_older_than_retention():
    with tempfile.TemporaryDirectory() as tmp:
        log_dir = Path(tmp)
        live = log_dir / "backend.log"
        live.write_text("live")
        ages = {"backend.log.2026-08-01": 2, "backend.log.2026-07-30": 4, "backend.log.2026-07-28": 6, "backend.log.2026-07-01": 30}
        now = time.time()
        for name, days in ages.items():
            f = log_dir / name
            f.write_text("old")
            mtime = now - days * 86400
            os.utime(f, (mtime, mtime))

        sweep_old_logs(log_dir)

        remaining = {f.name for f in log_dir.glob("backend.log.*")}
        assert remaining == {"backend.log.2026-08-01", "backend.log.2026-07-30"}, remaining
        assert live.exists(), "the live backend.log must never be swept"


if __name__ == "__main__":
    test_startup_creates_log_file_and_appends_on_restart()
    test_uvicorn_access_logger_reaches_the_file()
    test_uvicorn_error_is_captured_exactly_once()
    test_sweep_boundary_at_exactly_retention_days_is_stable()
    test_sweep_deletes_only_rotated_files_older_than_retention()
    assert LOG_RETENTION_DAYS == 5
    print("OK")
