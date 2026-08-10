# CSCMS — Technical Architecture & Build Spec

**Status:** Approved design, not yet implemented
**Covers:** backend and frontend. One document, because the API contract and
data model are the shared surface — splitting them into separate frontend and
backend PRDs guarantees they drift apart.

Read `CSCMS_PRD.md` for *what* the product does. This document is *how*.

---

## 1. Stack

| Layer | Choice | Note |
|---|---|---|
| Frontend | React 19 + Vite 8 + TypeScript | Already built as a prototype. Supersedes the PRD's original Angular choice. |
| Routing | `react-router-dom` | Replaces the current `useState` page switch. |
| Server state | `@tanstack/react-query` | A saved transaction invalidates dashboard, ledger, and accounts at once. Manual refetch wiring across 9 pages is the alternative. |
| Styling | Inline styles (existing) + Tailwind v4 (new shared components) | See §7. |
| Backend | Python 3.12 + FastAPI | Per PRD. |
| DB | SQLite (single file) | Per PRD. |
| ORM | SQLModel | One class serves as both table definition and API schema. |
| Migrations | Numbered `.sql` files + `PRAGMA user_version` | ~20 lines of runner. Alembic is the upgrade path if schema churn justifies it. |
| Desktop | Electron | Per PRD. Ships last — see Phase 9. |

### Deliberate omissions

- **No Docker.** Single-file SQLite on one Windows machine.
- **No Redis / Celery / message queue.** Nothing is async or distributed.
- **No `transaction_items` table.** The PRD suggests it, but one transaction =
  one service. A customer buying three things is three transactions settled by
  one `payment` row (§4.4). Add line-items only if a real bill needs them.
- **No `print_jobs` table.** Printing is a service like any other; `qty` and
  `rate` columns on `transactions` cover photocopy/lamination pricing.
- **No sync layer.** Cloud sync is a stated *future* enhancement. Integer
  primary keys are used; if multi-branch sync ever lands, adding UUIDs is an
  additive migration, not a rewrite.

---

## 2. The one rule that makes this system correct

> **The `ledger` table is the only writable record of money. Every balance in
> the application is derived from it by summation. Nothing else stores a
> money truth.**

The PRD's acceptance criteria — *"financial reports always reconcile with
ledger entries"* and *"multiple accounts remain synchronized"* — are only
achievable if there is exactly one writable source. The naive design stores
money in three places (`accounts.current_balance`, `daily_account_balance
.closing_balance`, and `ledger`) and lets each be written independently. Those
three *will* drift, and reconciliation becomes a permanent bug-hunt.

Consequences of the rule:

- `accounts.current_balance` is **not** a stored column. Account balance is
  `SELECT SUM(amount_paise) FROM ledger WHERE account_id = ?`. If profiling
  ever shows this is slow, it becomes a cache with a rebuild command — never a
  second source of truth.
- **Ledger rows are immutable.** No `UPDATE`, no `DELETE`. A correction is a
  new reversing entry pointing at the original via `reverses_id`. This gives
  the PRD's audit trail and soft-delete requirements for free.
- PRD §6's *"if the previous day is modified, future balances are
  recalculated"* becomes a non-problem. There is nothing to recalculate —
  balances are always a live sum. See §5 for how back-dating is handled.

### Money is stored as integer paise

`amount_paise INTEGER NOT NULL`. Never `REAL`. Floating-point money silently
accumulates rounding error, and this is a ledger whose entire purpose is
reconciling to the rupee. Formatting to `₹1,234.50` is a display concern.

---

## 3. Ledger entry model

Signed amounts, one row per account affected. Positive = money into the
account, negative = money out.

```
ledger
  id              INTEGER PK
  business_date   TEXT     -- 'YYYY-MM-DD', the date the event belongs to
  account_id      INTEGER FK -> accounts
  amount_paise    INTEGER  -- signed; + into account, - out of account
  entry_type      TEXT     -- service_income | commission | expense
                           -- | transfer | customer_payment | adjustment
                           -- | opening_balance | reversal
  source_type     TEXT     -- 'transaction' | 'expense' | 'banking' | ...
  source_id       INTEGER  -- row id in that table; null for manual entries
  description     TEXT
  reverses_id     INTEGER FK -> ledger, nullable
  created_at      TEXT
  created_by      INTEGER FK -> users
```

Signed `amount_paise` replaces the prototype's separate `debit`/`credit`
columns. Two columns require an invariant that exactly one is non-zero, and
every query has to write `credit - debit`. Debit/credit is reintroduced at
display time in the Ledger view.

### Event → ledger mapping

This table is the specification. Every money event in the app produces exactly
these rows, and each group must sum correctly.

| Event | Ledger rows |
|---|---|
| Service transaction, paid in full | `+total` to the receiving account, `entry_type=service_income` |
| Service transaction, partly paid | `+amount_paid` to account. Unpaid remainder is **not** a ledger row — it is customer outstanding (§4.4). |
| Customer settles old dues | `+amount` to account, `entry_type=customer_payment` |
| Expense | `-amount` from the paying account, `entry_type=expense` |
| Internal transfer | **Two rows**: `-amount` from source, `+amount` to destination. Must sum to zero. |
| AEPS / cash withdrawal by customer | `-amount` from settlement account, `+amount` to cash drawer, **plus** `+commission` to cash drawer as `entry_type=commission`. The ₹5,000 the customer withdraws is not income; only the ₹50 fee is. |
| Deposit by customer | `+amount` to cash drawer, `-amount` from settlement account, plus commission row |
| Balance enquiry | Commission row only |
| Closing variance | `±variance`, `entry_type=adjustment`, remarks mandatory |

The banking rows are the ones most often modelled wrong. Booking a ₹5,000 AEPS
withdrawal as ₹5,000 of income overstates daily profit by a hundredfold. The
`banking_transactions` table exists precisely to keep the principal and the
commission separate.

**Invariant, enforced in a test:** for any transfer or banking event, the
generated ledger rows for the principal sum to zero across accounts.

---

## 4. Schema

Common to all tables: `created_at`, `updated_at`, and `deleted_at` (nullable —
soft delete per PRD §9). Ledger has no `deleted_at`; it uses reversal.

### 4.1 accounts
```
id, name, account_type (cash|savings|current|wallet|settlement),
bank_name, account_number_masked, ifsc, opening_balance_paise,
is_active, sort_order
```
`opening_balance_paise` seeds one `opening_balance` ledger entry when the
account is created. After that the column is historical record only.

### 4.2 customers
```
id, name, phone, village, aadhaar_masked, notes
```
`outstanding` is derived: `SUM(transactions.total) - SUM(payments.amount)`.
Never stored. Aadhaar is stored masked only — full Aadhaar numbers are not
retained.

### 4.3 services
```
id, name, category, default_fee_paise, default_charge_paise, is_active
```
Seeded from PRD §3: PAN, Aadhaar, Certificates, Utility Payments, Ticket
Booking, Printing, Banking. Operator-editable.

### 4.4 transactions & payments
```
transactions: id, business_date, customer_id (nullable = walk-in),
  service_id, qty, fee_paise, charge_paise, discount_paise,
  total_paise, account_id, operator_id, status, remarks

payments: id, business_date, customer_id, amount_paise,
  account_id, transaction_id (nullable), remarks
```
`total_paise = fee + charge - discount`, validated server-side, never trusted
from the client.

Payments are separate from transactions so a customer can clear several
outstanding bills with one cash handover. `transaction_id` is nullable for
exactly that case. `status` (`completed`/`partial`/`pending`) is derived from
payments against the transaction, not set by hand.

### 4.5 banking_transactions
```
id, business_date, customer_id, txn_type (withdrawal|deposit|aeps|
  money_transfer|balance_enquiry), principal_paise, commission_paise,
  settlement_account_id, cash_account_id, operator_id, remarks
```

### 4.6 expenses
```
id, business_date, category, amount_paise, account_id, note
```

### 4.7 account_transfers
```
id, business_date, from_account_id, to_account_id, amount_paise,
  remarks, operator_id
```

### 4.8 daily_account_balance
Write-once snapshot, created by the closing workflow. **Not** a source of
truth — it is the sealed record of what the derived numbers were at close.
```
id, business_date, account_id, opening_paise, received_paise, paid_paise,
  transfer_in_paise, transfer_out_paise, adjustment_paise, closing_paise,
  closed_at, closed_by, remarks
```

### 4.9 business_days
```
business_date PK, status (open|closed), opened_at, closed_at, closed_by
```
The lock that makes closing meaningful.

### 4.10 users, settings, audit_logs, attachments
```
users:       id, username, password_hash, role, is_active
settings:    key PK, value
audit_logs:  id, table_name, row_id, action, before_json, after_json,
             user_id, created_at
attachments: id, source_type, source_id, file_path, original_name,
             mime_type, size_bytes
```
Passwords hashed with `bcrypt` — never plaintext, never a reversible cipher,
even for a single-operator offline app.

---

## 5. Business day lifecycle

1. First write of a calendar date auto-creates a `business_days` row with
   status `open`.
2. Opening balance for an account on day D is simply the sum of all ledger
   entries **before** D. Nothing needs to be copied forward, which removes the
   entire class of carry-forward bugs the PRD §6 recalculation clause is
   worried about.
3. Closing (PRD §8) walks the 6 steps, records physical cash count, writes an
   `adjustment` ledger entry if there is a variance, snapshots
   `daily_account_balance` for every account, and sets status to `closed`.
4. **Writes to a closed date are rejected** with HTTP 409.

### Back-dating and corrections

A correction to a closed day does **not** edit that day. It posts a reversing
entry plus the corrected entry on the current open date, both referencing the
original. This is how physical books work, it keeps every closed day's printed
report permanently true, and it avoids a recalculation cascade through every
subsequent day.

An admin override to genuinely reopen a day is a Phase 8 feature and writes an
audit row.

---

## 6. API

`http://127.0.0.1:8756/api`. Bound to loopback only.

Standard REST per resource: `GET /` (list, paginated + filtered),
`GET /{id}`, `POST /`, `PATCH /{id}`, `DELETE /{id}` (soft).

```
/api/accounts            + GET /{id}/balance, GET /{id}/ledger
/api/customers           + GET /{id}/history, GET /{id}/outstanding
/api/services
/api/transactions
/api/payments
/api/banking
/api/expenses
/api/transfers           POST only; immutable once created
/api/ledger              GET only — read-only by design
/api/dashboard           GET; the 8 PRD §3 tiles in one response
/api/day/{date}          GET status, POST /close, GET /report
/api/reports/{kind}      daily | monthly | customer | service | commission | pnl
/api/auth/login,/logout
/api/backup              POST create, POST restore, GET list
```

**Money crosses the API as integer paise**, named `*_paise` throughout, so a
client can never accidentally treat rupees as paise. Formatting happens in one
place on the frontend.

Errors return `{ "detail": "...", "code": "..." }`. Validation is Pydantic at
the boundary; totals and balances are always recomputed server-side.

---

## 7. Frontend plan

### What exists
9 page components (~1,340 lines) reading from `src/data/mockData.ts`. Complete
visual design, no functionality: no router, no API, no persistence, and the
forms are decorative — the "New Transaction" inputs are uncontrolled and
`Lock Business Day` flips a `useState`. Treat it as an approved design mock.

### What changes

```
src/
  lib/
    api.ts         typed fetch client, one place that knows the base URL
    format.ts      fmt(), formatDate() — currently duplicated in all 9 pages
    queries.ts     react-query hooks + query keys
  components/      Table, Money, Dialog, Field, Button, StatCard, PageHeader
  pages/           existing 9, rewired
  App.tsx          router instead of the useState page map
```

`fmt()` is defined identically nine times today. That is the first thing to
collapse — it is the function most likely to need a fix (rounding, paise
conversion) and it currently needs that fix in nine files.

**Styling:** existing inline styles stay. They work, they carry the visual
identity, and rewriting 1,340 working lines into Tailwind buys nothing.
New shared components in `src/components/` use Tailwind, since Tailwind is
already a dependency at 0% usage. The `shadcn` skill is available for dialogs
and comboboxes rather than hand-rolling them.

**Forms:** native HTML validation (`required`, `type=number`, `min`, `step`)
plus a submit handler, backed by server-side validation which is the one that
actually counts. `react-hook-form` only if a form outgrows that.

**Money in the UI:** inputs accept rupees, convert to paise at the API
boundary in `api.ts`. No component does its own arithmetic on rupee floats.

---

## 8. Testing

Not a suite for its own sake — the checks that fail loudly if the money logic
breaks:

- Ledger sums to zero for every transfer and banking principal.
- Account balance derived from ledger matches the expected value after a
  scripted day of mixed activity.
- Closing snapshot equals the derived balance at close.
- Writes to a closed day are rejected.
- AEPS withdrawal books commission as income and principal as a transfer.
- Partial payment leaves the correct customer outstanding.

Three tiers, applied per step per its `PLAN.md` *Verify* line:

- **Unit** — pure logic with no I/O (ledger summation, paise conversion,
  status derivation). Runs instantly, no DB involved.
- **Integration** — backend logic against a real (temp/in-memory) SQLite DB,
  through the `app.db` / API layers. Most of the suite lives here; see
  `backend/tests/` for the existing pattern.
- **E2E** — a real browser driving the built frontend against the running
  backend. Not meaningful until a step wires a page to the API (Phase 0.5+);
  tooling (e.g. Playwright) gets added at that point, not speculatively now.

Each backend test file is a plain `assert`-based script (`def test_x(): ...`
plus an `if __name__ == "__main__":` block), runnable directly with
`python tests/test_x.py` — no test-framework dependency for what a handful of
scripts covers, though the naming keeps them pytest-discoverable if pytest is
ever added. Frontend tests only for `format.ts` and paise conversion — the
rest is covered by the API tests.

---

## 9. Security & operations

- Loopback-bound API; no external network surface.
- bcrypt password hashing; session token in an httpOnly, `SameSite=Strict`
  cookie (9.9) — unreadable via JS/`document.cookie`, never `localStorage`.
- Soft delete everywhere except ledger, which reverses instead.
- `audit_logs` written for every mutation of a financial row.
- Automated backup: timestamped copy of the SQLite file on app close, keep the
  last N (setting). SQLite's `VACUUM INTO` gives a consistent copy without
  stopping the app.
- Restore is an explicit, confirmed action that backs up the current DB first.
