-- 001_init.sql — full schema per docs/ARCHITECTURE.md §4.
-- Money is integer paise throughout. The ledger is the only writable
-- record of money; every other "balance" is derived from it (§2).

CREATE TABLE accounts (
  id                     INTEGER PRIMARY KEY,
  name                   TEXT NOT NULL,
  account_type           TEXT NOT NULL CHECK (account_type IN ('cash','savings','current','wallet','settlement')),
  bank_name              TEXT,
  account_number_masked  TEXT,
  ifsc                   TEXT,
  opening_balance_paise  INTEGER NOT NULL DEFAULT 0,
  is_active              INTEGER NOT NULL DEFAULT 1,
  sort_order             INTEGER NOT NULL DEFAULT 0,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at             TEXT
);

CREATE TABLE customers (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,
  phone           TEXT,
  village         TEXT,
  aadhaar_masked  TEXT,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT
);

CREATE TABLE services (
  id                     INTEGER PRIMARY KEY,
  name                   TEXT NOT NULL,
  category               TEXT NOT NULL,
  default_fee_paise      INTEGER NOT NULL DEFAULT 0,
  default_charge_paise   INTEGER NOT NULL DEFAULT 0,
  is_active              INTEGER NOT NULL DEFAULT 1,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at             TEXT
);

CREATE TABLE users (
  id             INTEGER PRIMARY KEY,
  username       TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL,
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at     TEXT
);

CREATE TABLE transactions (
  id              INTEGER PRIMARY KEY,
  business_date   TEXT NOT NULL,
  customer_id     INTEGER REFERENCES customers(id),      -- nullable = walk-in
  service_id      INTEGER NOT NULL REFERENCES services(id),
  qty             INTEGER NOT NULL DEFAULT 1,
  fee_paise       INTEGER NOT NULL,
  charge_paise    INTEGER NOT NULL DEFAULT 0,
  discount_paise  INTEGER NOT NULL DEFAULT 0,
  total_paise     INTEGER NOT NULL,
  account_id      INTEGER NOT NULL REFERENCES accounts(id),
  operator_id     INTEGER NOT NULL REFERENCES users(id),
  status          TEXT NOT NULL CHECK (status IN ('completed','partial','pending')),
  remarks         TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT
);

CREATE TABLE payments (
  id              INTEGER PRIMARY KEY,
  business_date   TEXT NOT NULL,
  customer_id     INTEGER NOT NULL REFERENCES customers(id),
  amount_paise    INTEGER NOT NULL,
  account_id      INTEGER NOT NULL REFERENCES accounts(id),
  transaction_id  INTEGER REFERENCES transactions(id),   -- nullable: one payment can settle several bills
  remarks         TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT
);

CREATE TABLE banking_transactions (
  id                      INTEGER PRIMARY KEY,
  business_date           TEXT NOT NULL,
  customer_id             INTEGER REFERENCES customers(id),
  txn_type                TEXT NOT NULL CHECK (txn_type IN ('withdrawal','deposit','aeps','money_transfer','balance_enquiry')),
  principal_paise         INTEGER NOT NULL DEFAULT 0,
  commission_paise        INTEGER NOT NULL DEFAULT 0,
  settlement_account_id   INTEGER NOT NULL REFERENCES accounts(id),
  cash_account_id         INTEGER NOT NULL REFERENCES accounts(id),
  operator_id             INTEGER NOT NULL REFERENCES users(id),
  remarks                 TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at              TEXT
);

CREATE TABLE expenses (
  id             INTEGER PRIMARY KEY,
  business_date  TEXT NOT NULL,
  category       TEXT NOT NULL,
  amount_paise   INTEGER NOT NULL,
  account_id     INTEGER NOT NULL REFERENCES accounts(id),
  note           TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at     TEXT
);

CREATE TABLE account_transfers (
  id               INTEGER PRIMARY KEY,
  business_date    TEXT NOT NULL,
  from_account_id  INTEGER NOT NULL REFERENCES accounts(id),
  to_account_id    INTEGER NOT NULL REFERENCES accounts(id),
  amount_paise     INTEGER NOT NULL,
  remarks          TEXT,
  operator_id      INTEGER NOT NULL REFERENCES users(id),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at       TEXT
);

-- The only writable record of money (§2). Append-only: no UPDATE, no DELETE.
-- A correction is a new row with reverses_id pointing at the original.
CREATE TABLE ledger (
  id             INTEGER PRIMARY KEY,
  business_date  TEXT NOT NULL,
  account_id     INTEGER NOT NULL REFERENCES accounts(id),
  amount_paise   INTEGER NOT NULL,
  entry_type     TEXT NOT NULL CHECK (entry_type IN ('service_income','commission','expense','transfer','customer_payment','adjustment','opening_balance','reversal')),
  source_type    TEXT NOT NULL,
  source_id      INTEGER,
  description    TEXT,
  reverses_id    INTEGER REFERENCES ledger(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  created_by     INTEGER NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_ledger_date_account ON ledger(business_date, account_id);

-- Write-once snapshot from the closing workflow. Not a source of truth.
CREATE TABLE daily_account_balance (
  id                  INTEGER PRIMARY KEY,
  business_date       TEXT NOT NULL,
  account_id          INTEGER NOT NULL REFERENCES accounts(id),
  opening_paise       INTEGER NOT NULL,
  received_paise      INTEGER NOT NULL,
  paid_paise          INTEGER NOT NULL,
  transfer_in_paise   INTEGER NOT NULL,
  transfer_out_paise  INTEGER NOT NULL,
  adjustment_paise    INTEGER NOT NULL,
  closing_paise       INTEGER NOT NULL,
  closed_at           TEXT NOT NULL DEFAULT (datetime('now')),
  closed_by           INTEGER NOT NULL REFERENCES users(id),
  remarks             TEXT
);

CREATE TABLE business_days (
  business_date  TEXT PRIMARY KEY,
  status         TEXT NOT NULL CHECK (status IN ('open','closed')),
  opened_at      TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at      TEXT,
  closed_by      INTEGER REFERENCES users(id)
);

CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT
);

CREATE TABLE audit_logs (
  id           INTEGER PRIMARY KEY,
  table_name   TEXT NOT NULL,
  row_id       INTEGER NOT NULL,
  action       TEXT NOT NULL,
  before_json  TEXT,
  after_json   TEXT,
  user_id      INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE attachments (
  id             INTEGER PRIMARY KEY,
  source_type    TEXT NOT NULL,
  source_id      INTEGER NOT NULL,
  file_path      TEXT NOT NULL,
  original_name  TEXT NOT NULL,
  mime_type      TEXT,
  size_bytes     INTEGER,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at     TEXT
);
