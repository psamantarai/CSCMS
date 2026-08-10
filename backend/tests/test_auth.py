"""Self-check for auth (PLAN 8.1/8.2, 9.9). Calls the route functions
directly against a temp DB. Run: python tests/test_auth.py"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import HTTPException

from app.auth import BootstrapRequest, LoginRequest, bootstrap, bootstrap_status, get_current_user, login, logout, me
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


def _cookie_token(resp) -> str:
    """9.9: login/bootstrap now return a JSONResponse with the session token
    in Set-Cookie instead of the JSON body — pull it back out for the tests
    that need it to drive get_current_user/logout directly."""
    raw = resp.headers.get("set-cookie")
    assert raw, "expected a Set-Cookie header"
    return raw.split(";")[0].split("=", 1)[1]


def test_login_succeeds_and_sets_a_cookie_with_no_token_in_the_body():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))

        resp = login(LoginRequest(username=ADMIN_USERNAME, password=ADMIN_DEFAULT_PASSWORD), conn)
        token = _cookie_token(resp)
        assert len(token) > 20
        body = json.loads(resp.body)
        assert "token" not in body and "password" not in body and "password_hash" not in body["user"]

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


def test_get_current_user_accepts_a_valid_session_and_rejects_a_bad_one():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        token = _cookie_token(login(LoginRequest(username=ADMIN_USERNAME, password=ADMIN_DEFAULT_PASSWORD), conn))

        user = get_current_user(session=token, conn=conn)
        assert user["username"] == ADMIN_USERNAME

        try:
            get_current_user(session="not-a-real-token", conn=conn)
            assert False, "expected 401"
        except HTTPException as e:
            assert e.status_code == 401

        try:
            get_current_user(session=None, conn=conn)
            assert False, "expected 401"
        except HTTPException as e:
            assert e.status_code == 401

        conn.close()


def test_logout_clears_the_cookie_and_invalidates_the_session():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        token = _cookie_token(login(LoginRequest(username=ADMIN_USERNAME, password=ADMIN_DEFAULT_PASSWORD), conn))

        resp = logout(session=token, conn=conn)
        assert resp.status_code == 204
        assert resp.headers.get("set-cookie"), "logout must clear the cookie"

        try:
            get_current_user(session=token, conn=conn)
            assert False, "expected 401 after logout"
        except HTTPException as e:
            assert e.status_code == 401

        conn.close()


def test_me_returns_the_current_user_and_requires_a_session():
    with tempfile.TemporaryDirectory() as tmp:
        conn = _seeded_conn(Path(tmp))
        token = _cookie_token(login(LoginRequest(username=ADMIN_USERNAME, password=ADMIN_DEFAULT_PASSWORD), conn))

        result = me(user=get_current_user(session=token, conn=conn))
        assert result["user"]["username"] == ADMIN_USERNAME

        try:
            get_current_user(session=None, conn=conn)
            assert False, "expected 401"
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

        resp = bootstrap(BootstrapRequest(username="priya", password="s3cret", shop_name="  Priya CSC  "), conn)
        token = _cookie_token(resp)
        assert len(token) > 20
        body = json.loads(resp.body)
        assert body["user"]["username"] == "priya" and body["user"]["role"] == "admin"

        user = get_current_user(session=token, conn=conn)
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
    test_login_succeeds_and_sets_a_cookie_with_no_token_in_the_body()
    test_login_rejects_wrong_password()
    test_login_rejects_unknown_username()
    test_get_current_user_accepts_a_valid_session_and_rejects_a_bad_one()
    test_logout_clears_the_cookie_and_invalidates_the_session()
    test_me_returns_the_current_user_and_requires_a_session()
    test_bootstrap_status_reports_needed_on_a_fresh_db()
    test_bootstrap_status_reports_not_needed_once_a_user_exists()
    test_bootstrap_creates_admin_logs_in_and_writes_shop_name()
    test_bootstrap_rejects_once_a_user_already_exists_and_creates_nothing()
    print("All auth tests passed.")
