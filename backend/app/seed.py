"""Idempotent seed data: Cash Drawer account, PRD §3 services, admin user,
default settings. Run standalone: python -m app.seed"""
import sqlite3

import bcrypt

SERVICES = ["PAN", "Aadhaar", "Certificates", "Utility Payments", "Ticket Booking", "Printing", "Banking"]

DEFAULT_SETTINGS = {
    "expense_categories": "Rent,Internet,Electricity,Paper,Ink,Repairs,Miscellaneous",
    "backup_retention_count": "5",
}

ADMIN_USERNAME = "admin"
ADMIN_DEFAULT_PASSWORD = "admin123"  # temporary; change once auth ships (8.1/8.2)


def run_seed(conn: sqlite3.Connection) -> None:
    if conn.execute("SELECT 1 FROM accounts WHERE name = 'Cash Drawer'").fetchone() is None:
        conn.execute(
            "INSERT INTO accounts (name, account_type, opening_balance_paise, is_active, sort_order) "
            "VALUES ('Cash Drawer', 'cash', 0, 1, 0)"
        )

    for name in SERVICES:
        if conn.execute("SELECT 1 FROM services WHERE name = ?", (name,)).fetchone() is None:
            conn.execute(
                "INSERT INTO services (name, category, default_fee_paise, default_charge_paise, is_active) "
                "VALUES (?, ?, 0, 0, 1)",
                (name, name),
            )

    if conn.execute("SELECT 1 FROM users WHERE username = ?", (ADMIN_USERNAME,)).fetchone() is None:
        password_hash = bcrypt.hashpw(ADMIN_DEFAULT_PASSWORD.encode(), bcrypt.gensalt()).decode()
        conn.execute(
            "INSERT INTO users (username, password_hash, role, is_active) VALUES (?, ?, 'admin', 1)",
            (ADMIN_USERNAME, password_hash),
        )

    for key, value in DEFAULT_SETTINGS.items():
        if conn.execute("SELECT 1 FROM settings WHERE key = ?", (key,)).fetchone() is None:
            conn.execute("INSERT INTO settings (key, value) VALUES (?, ?)", (key, value))

    conn.commit()


if __name__ == "__main__":
    from app.db import get_connection, run_migrations
    from app.settings import settings

    conn = get_connection(settings.db_path)
    run_migrations(conn, settings.migrations_dir)
    run_seed(conn)
    print("Seed complete.")
