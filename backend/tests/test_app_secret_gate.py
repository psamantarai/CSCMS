"""Self-check for the 11.1 shared-secret gate. Run:
python tests/test_app_secret_gate.py"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ["CSCMS_APP_SECRET"] = "unit-test-secret"

from app.main import app_secret_gate  # noqa: E402


class _FakeRequest:
    def __init__(self, header_value=None):
        self.headers = {} if header_value is None else {"x-cscms-app": header_value}


async def _call_next(request):
    return "downstream-response"


def test_gate_rejects_missing_or_wrong_header():
    resp = asyncio.run(app_secret_gate(_FakeRequest(), _call_next))
    assert resp.status_code == 403

    resp = asyncio.run(app_secret_gate(_FakeRequest("wrong-secret"), _call_next))
    assert resp.status_code == 403


def test_gate_passes_the_correct_header():
    resp = asyncio.run(app_secret_gate(_FakeRequest("unit-test-secret"), _call_next))
    assert resp == "downstream-response"


if __name__ == "__main__":
    test_gate_rejects_missing_or_wrong_header()
    test_gate_passes_the_correct_header()
    print("All app-secret-gate tests passed.")
