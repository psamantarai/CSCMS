"""Self-check for auth (PLAN 8.1/8.2). Calls the route functions directly
against a temp DB. Run: python tests/test_auth.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import HTTPException

from app.auth import BootstrapRequest, LoginRequest, bootstrap, bootstrap_status, get_current_user, login, logout
from app.db import get_connection, run_migrations
from app.seed import ADMIN_DEFAULT_PASSWORD, ADMIN_USERNAME, run_seed, seed_admin_user

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def _seeded_conn(tmp: Path):
    conn = get_connection(tmp / "test.db")
    run_migrations(conn, MIGRATIONS_DIR)
    run_seed(conn)
    seed_admin_user(conn)
    return conn


def _bare_conn(tmp: Path):
    # 9.8: no seed_admin_user() — bootstrap only makes sense against a
    # genuinely zero-user DB, same as a real fresh install.
    conn = get_connection(tmp / "test.db")
    run_migrations(conn, MIGRATIONS_DIR)
    run_seed(conn)
    return conn


def test_login_succeeds_and_password_is_never_returned_or_stored_plaintext():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))

        result = login(LoginRequest(username=ADMIN_USERNAME, password=ADMIN_DEFAULT_PASSWORD), conn)
        assert "token" in result and len(result["token"]) > 20
        assert "password" not in result and "password_hash" not in result["user"]

        stored_hash = conn.execute("SELECT password_hash FROM users WHERE username = ?", (ADMIN_USERNAME,)).fetchone()[0]
        assert ADMIN_DEFAULT_PASSWORD not in stored_hash

        conn.close()


def test_login_rejects_wrong_password():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        try:
            login(LoginRequest(username=ADMIN_USERNAME, password="wrong"), conn)
            assert False, "expected 401"
        except HTTPException as e:
            assert e.status_code == 401
        conn.close()


def test_login_rejects_unknown_username():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        try:
            login(LoginRequest(username="nobody", password="whatever"), conn)
            assert False, "expected 401"
        except HTTPException as e:
            assert e.status_code == 401
        conn.close()


def test_get_current_user_accepts_a_valid_token_and_rejects_a_bad_one():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        token = login(LoginRequest(username=ADMIN_USERNAME, password=ADMIN_DEFAULT_PASSWORD), conn)["token"]

        user = get_current_user(authorization=f"Bearer {token}", conn=conn)
        assert user["username"] == ADMIN_USERNAME

        try:
            get_current_user(authorization="Bearer not-a-real-token", conn=conn)
            assert False, "expected 401"
        except HTTPException as e:
            assert e.status_code == 401

        try:
            get_current_user(authorization=None, conn=conn)
            assert False, "expected 401"
        except HTTPException as e:
            assert e.status_code == 401

        conn.close()


def test_logout_invalidates_the_token():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        token = login(LoginRequest(username=ADMIN_USERNAME, password=ADMIN_DEFAULT_PASSWORD), conn)["token"]

        logout(authorization=f"Bearer {token}", conn=conn)

        try:
            get_current_user(authorization=f"Bearer {token}", conn=conn)
            assert False, "expected 401 after logout"
        except HTTPException as e:
            assert e.status_code == 401

        conn.close()


def test_bootstrap_status_reports_needed_on_a_fresh_db():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _bare_conn(Path(tmp))
        assert bootstrap_status(conn) == {"needed": True}
        conn.close()


def test_bootstrap_status_reports_not_needed_once_a_user_exists():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        assert bootstrap_status(conn) == {"needed": False}
        conn.close()


def test_bootstrap_creates_admin_logs_in_and_writes_shop_name():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _bare_conn(Path(tmp))

        result = bootstrap(BootstrapRequest(username="priya", password="s3cret", shop_name="  Priya CSC  "), conn)
        assert "token" in result and len(result["token"]) > 20
        assert result["user"]["username"] == "priya" and result["user"]["role"] == "admin"

        user = get_current_user(authorization=f"Bearer {result['token']}", conn=conn)
        assert user["username"] == "priya"

        shop_name = conn.execute("SELECT value FROM settings WHERE key = 'shop_name'").fetchone()[0]
        assert shop_name == "Priya CSC", "must be trimmed"

        conn.close()


def test_bootstrap_rejects_once_a_user_already_exists_and_creates_nothing():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        count_before = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]

        try:
            bootstrap(BootstrapRequest(username="second", password="whatever"), conn)
            assert False, "expected 409"
        except HTTPException as e:
            assert e.status_code == 409

        assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == count_before
        conn.close()


if __name__ == "__main__":
    test_login_succeeds_and_password_is_never_returned_or_stored_plaintext()
    test_login_rejects_wrong_password()
    test_login_rejects_unknown_username()
    test_get_current_user_accepts_a_valid_token_and_rejects_a_bad_one()
    test_logout_invalidates_the_token()
    test_bootstrap_status_reports_needed_on_a_fresh_db()
    test_bootstrap_status_reports_not_needed_once_a_user_exists()
    test_bootstrap_creates_admin_logs_in_and_writes_shop_name()
    test_bootstrap_rejects_once_a_user_already_exists_and_creates_nothing()
    print("All auth tests passed.")
