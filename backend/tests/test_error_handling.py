"""Self-check for the 12.2 exception handlers. Run:
python tests/test_error_handling.py"""
import asyncio
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import HTTPException

from app.main import _redact, app, client_log, http_exception_handler, unhandled_exception_handler


class _FakeURL:
    def __init__(self, path):
        self.path = path


class _FakeRequest:
    def __init__(self, body: bytes, method="POST", path="/api/transactions"):
        self.method = method
        self.url = _FakeURL(path)
        self._body = body

    async def body(self):
        return self._body


class _CapturingHandler(logging.Handler):
    def __init__(self):
        super().__init__()
        self.records = []

    def emit(self, record):
        self.records.append(record)


def _capture():
    handler = _CapturingHandler()
    logger = logging.getLogger("app.main")
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG)
    return handler, logger


def test_redact_denylist_keys():
    body = {"phone": "9876543210", "aadhaar_masked": "1234", "account_number": "111", "token": "abc", "password": "x", "service_id": 5}
    redacted = _redact(body)
    assert redacted == {"phone": "***", "aadhaar_masked": "***", "account_number": "***", "token": "***", "password": "***", "service_id": 5}


def test_http_exception_handler_logs_4xx_and_redacts_body():
    handler, logger = _capture()
    try:
        body = json.dumps({"phone": "9876543210", "fee_paise": -1}).encode()
        exc = HTTPException(status_code=400, detail="transaction total is out of range")
        resp = asyncio.run(http_exception_handler(_FakeRequest(body), exc))

        assert resp.status_code == 400
        assert json.loads(resp.body) == {"detail": "transaction total is out of range"}

        assert len(handler.records) == 1
        record = handler.records[0]
        assert record.levelno == logging.WARNING
        message = record.getMessage()
        assert "400" in message and "transaction total is out of range" in message
        assert "9876543210" not in message and "***" in message
    finally:
        logger.removeHandler(handler)


def test_http_exception_handler_skips_logging_below_400():
    """Not reachable via a real request today (nothing raises HTTPException
    below 400), but the >=400 guard is the thing that would silently break
    if someone widened the range — pin it directly."""
    handler, logger = _capture()
    try:
        exc = HTTPException(status_code=304, detail="not modified")
        asyncio.run(http_exception_handler(_FakeRequest(b""), exc))
        assert handler.records == []
    finally:
        logger.removeHandler(handler)


def test_unhandled_exception_handler_logs_traceback_and_returns_internal_error():
    handler, logger = _capture()
    try:
        body = json.dumps({"password": "hunter2"}).encode()

        async def _run():
            try:
                raise ValueError("boom")
            except ValueError as exc:
                return await unhandled_exception_handler(_FakeRequest(body), exc)

        resp = asyncio.run(_run())

        assert resp.status_code == 500
        assert json.loads(resp.body) == {"detail": "internal server error", "code": "internal_error"}

        assert len(handler.records) == 1
        record = handler.records[0]
        assert record.levelno == logging.ERROR
        message = record.getMessage()
        assert "ValueError: boom" in message and "Traceback" in message
        assert "hunter2" not in message and "***" in message
    finally:
        logger.removeHandler(handler)


def test_unhandled_exception_handler_survives_cold_body_read():
    """PLAN 12.5 acceptance finding: a GET route (or any exception raised
    before the body is ever read) hits Request.body() with a torn-down
    receive channel — Starlette raises RuntimeError instead of returning
    cached bytes. Reproduced against the real packaged exe with GET
    /api/debug/crash: the handler's own await escaped uncaught, so the
    client got a bare-text 500 and the structured log line was never
    written. Pin the fix here."""
    handler, logger = _capture()
    try:
        class _ColdRequest(_FakeRequest):
            async def body(self):
                raise RuntimeError("Receive channel has not been made available")

        async def _run():
            try:
                raise ValueError("boom")
            except ValueError as exc:
                return await unhandled_exception_handler(_ColdRequest(b"", method="GET", path="/api/debug/crash"), exc)

        resp = asyncio.run(_run())

        assert resp.status_code == 500
        assert json.loads(resp.body) == {"detail": "internal server error", "code": "internal_error"}
        assert len(handler.records) == 1
        assert handler.records[0].levelno == logging.ERROR
        assert "body=None" in handler.records[0].getMessage()
    finally:
        logger.removeHandler(handler)


def test_client_log_redacts_and_logs_at_error():
    """PLAN 12.4: the renderer's crash reporter posts here unauthenticated,
    so this must log what it's given without a session — and still redact,
    since a component stack can carry whatever the crashed page held."""
    handler, logger = _capture()
    try:
        body = json.dumps({"message": "TypeError: x is undefined", "phone": "9876543210"}).encode()
        resp = asyncio.run(client_log(_FakeRequest(body, path="/api/client-log")))

        assert resp == {"status": "logged"}
        assert len(handler.records) == 1
        record = handler.records[0]
        assert record.levelno == logging.ERROR
        message = record.getMessage()
        assert "[client]" in message and "TypeError: x is undefined" in message
        assert "9876543210" not in message and "***" in message
    finally:
        logger.removeHandler(handler)


def test_no_body_consuming_middleware_added():
    """The known trap (PLAN 12.2): a body-caching middleware added ahead of
    routing would starve every route's own body read. The handlers above
    read via Request.body()'s own cache instead, so app_secret_gate must
    still be the only middleware — this pins that structural fact."""
    assert len(app.user_middleware) == 1


if __name__ == "__main__":
    test_redact_denylist_keys()
    test_http_exception_handler_logs_4xx_and_redacts_body()
    test_http_exception_handler_skips_logging_below_400()
    test_unhandled_exception_handler_logs_traceback_and_returns_internal_error()
    test_unhandled_exception_handler_survives_cold_body_read()
    test_client_log_redacts_and_logs_at_error()
    test_no_body_consuming_middleware_added()
    print("OK")
