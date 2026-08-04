# CSCMS — Implementation Plan

13 phases, 86 steps. Phases run in order; each depends on the one before.
(Phase 2.5 was inserted after an edge-case audit of the shipped Phase 0–2
code — see that phase for what it found and why it blocks Phase 3. Phase 3.5
came from the same pass repeated over the shipped Phase 3 code.)

**A step is the unit of work.** Each is one sitting, independently verifiable,
and leaves the app in a working state. Per `CLAUDE.md`, work stops after each
step for review — update `docs/progress-tracker.html`, then wait.

Every step carries a *Verify* — an observable check, not "it looks done".

Strategy: **money core first.** Accounts, ledger, transactions and daily
closing are the interlocking parts the acceptance criteria depend on, and the
only genuinely hard parts. Printing, attachments and report polish are shallow
work that is easy to add once the ledger is sound.

**Two screens do not exist yet.** PRD §3 lists Services and Printing as core
modules, but there is no `Services.tsx` or `Printing.tsx`. Those steps
(2.6, 10.x) are net-new UI, not rewiring — they carry design cost the other
pages don't.

---

## Phase 0 — Foundations

Backend skeleton and frontend plumbing. No features.

**0.1 Backend skeleton** — FastAPI app, settings module, `/api/health`, dev run
script, `backend/` layout.
*Verify:* `/api/health` returns 200.

**0.2 DB layer & migration runner** — SQLite connection, `PRAGMA user_version`
runner that applies numbered `.sql` files in order.
*Verify:* running twice applies migrations once; `user_version` advances.

**0.3 Migration 001 — full schema** — every table from `ARCHITECTURE.md` §4,
with indexes on `ledger(business_date, account_id)` and foreign keys on.
*Verify:* all tables exist; `PRAGMA integrity_check` and `foreign_key_check`
both clean.

**0.4 Seed data** — Cash Drawer account, PRD §3 services, admin user, default
settings. Must be idempotent.
*Verify:* re-running the seed does not duplicate rows.

**0.5 Frontend router** — `react-router-dom` replaces the `useState` page map
in `App.tsx`; sidebar becomes `NavLink`.
*Verify:* each page has its own URL; refresh on `/transactions` stays there;
browser back works.

**0.6 Frontend data layer** — react-query provider, `lib/api.ts` typed client,
`lib/queries.ts` key factory, Vite dev proxy for `/api`.
*Verify:* a page fetches `/api/health` and renders the result — no CORS error.

**0.7 Shared formatting** — `lib/format.ts` with `fmt()`, `formatDate()`, and
paise↔rupee conversion. Delete the nine duplicate `fmt()` definitions.
*Verify:* `grep "function fmt" src/pages/` returns nothing; every page renders
currency identically to before.

---

## Phase 1 — Accounts & the ledger spine

The core of the system. Nothing else is correct until this is.

**1.1 Ledger core** — model, append-only insert helper, balance-by-summation
query. No update or delete path exists, by construction.
*Verify:* unit tests for summation across mixed signs; attempting an update
raises.

**1.2 Accounts CRUD API** — create/list/edit/deactivate; `opening_balance`
seeds exactly one ledger entry.
*Verify:* an account created with ₹9,200 opening balance has one ledger entry
and a derived balance of ₹9,200.

**1.3 Transfers API** — paired ledger rows written in one DB transaction.
*Verify:* rows sum to zero; a forced failure on the second insert rolls back
the first.

**1.4 Reversal entries** — `reverses_id`, and the rule that a row can only be
reversed once.
*Verify:* reversing an entry nets the account back to its prior balance;
double-reversal is rejected.

**1.5 Ledger read API** — `GET /api/ledger` with date, account and type
filters, plus pagination and a running balance.
*Verify:* filtered sums match unfiltered sums when no filter is applied.

**1.6 Accounts page wiring** — list, create, edit, deactivate against the API.
*Verify:* an account created in the UI survives a restart.

**1.7 Ledger page wiring** — real entries, filters, and debit/credit display
derived from the signed amount.
*Verify:* the page's running balance matches `GET /api/accounts/{id}/balance`.

**1.8 Transfer UI** — transfer form with source/destination and validation
against transferring to the same account.
*Verify:* a ₹5,000 Cash → SBI transfer moves both balances by exactly ₹5,000
in opposite directions and shows two ledger rows.

---

## Phase 2 — Customers & services

Straightforward CRUD, needed before transactions can reference anything.

**2.1 Services CRUD API** — name, category, default fee and charge, active flag.
*Verify:* seeded PRD §3 services are listable; a deactivated service is
excluded from pickers but retained on old transactions.

**2.2 Customers CRUD API** — with soft delete.
*Verify:* a soft-deleted customer disappears from lists but their history
remains intact.

**2.3 Customer search** — by name, phone or village, partial match.
*Verify:* a partial phone fragment finds the right customer.

**2.4 Customer detail endpoint** — service history, banking history, and
outstanding derived from transactions minus payments.
*Verify:* outstanding is ₹0 for a new customer and never a stored column.

**2.5 Customers page wiring** — list, search, create, edit.
*Verify:* a customer created in the UI persists across an app restart.

**2.6 Customer detail view + Services page** — customer drill-down, plus a
**new** Services management screen (no `Services.tsx` exists today) added to
the router and sidebar.
*Verify:* editing a service's default fee changes what the transaction form
pre-fills, without altering past transactions.

---

## Phase 2.5 — Hardening the money core

Inserted after an edge-case audit of the shipped Phase 0–2 code (backend run
against a scratch DB, ~70 probes across every live endpoint plus the ledger
core directly). Every item below is a **reproduced** failure, not a review
opinion. Phases 3+ build transactions, payments and banking on exactly these
paths, so the defects compound if they are carried forward — H.1 in particular
makes the app unusable the moment two requests overlap, which react-query
already does on the Accounts page today.

Ordered by severity. H.1–H.3 are the ones that damage money or block use.

**H.1 Per-request connection thread safety** — sync FastAPI endpoints and their
sync dependencies run on *different* threadpool workers, so the `sqlite3`
connection `get_db` yields is used off its creating thread and raises
`ProgrammingError: SQLite objects created in a thread can only be used in that
same thread`. Measured: **20 of 24 parallel reads returned 500**. It passes
today only because sequential requests happen to reuse one worker. Fix in
`db.get_connection`: `check_same_thread=False`, `PRAGMA journal_mode = WAL`,
and a connect `timeout` for writer contention. Confirmed during the audit to
take a patched server to 24/24 reads and 12/12 concurrent writes with exactly
two ledger rows per transfer.
*Verify:* 24 parallel GETs across `/accounts`, `/ledger`, `/customers` and
`/accounts/{id}/balance` all return 200; 12 concurrent transfers yield 12×201
and exactly 24 transfer ledger rows — no partial pair.

**H.2 business_date validation on the write path** — `business_date` is an
unvalidated `str`. `"not-a-date"`, `"2026-13-45"` and `""` are all accepted and
written to `ledger` (all returned 201). Because the column is TEXT and every
query orders and filters on it lexically, one bad row silently corrupts ledger
ordering, date filters, opening-balance derivation (6.2) and day close (6.4) —
the audit reproduced `ORDER BY business_date` yielding
`['', '04-08-2026', '2026-08-04', …]`. One shared validator on the write path,
not per endpoint, matching the 6.3 guard's placement.
*Verify:* each of the three malformed dates returns 400; a valid `YYYY-MM-DD`
still passes; no ledger row exists whose `business_date` fails `date.fromisoformat`.

**H.3 Local business date, and paise in the UI** — two client-side money/date
defects:
- `Accounts.tsx:126` sends `new Date().toISOString().slice(0, 10)` — that is
  the **UTC** date. In IST the local day starts 5½ hours before UTC's, so any
  entry made before 05:30 IST is stamped to the previous business day. This
  lands directly on Phase 6's day-close correctness.
- `fmt()` uses bare `toLocaleString("en-IN")`, so paise are dropped from the
  display: ₹1,234.50 renders as **"₹1,234.5"** and ₹1.00 as **"₹1"**. Every
  amount on every page goes through this.
*Verify:* with the clock at 00:30 IST a transfer is stamped with the local
date, not yesterday's; `fmt(fromPaise(123450)) === "₹1,234.50"` and
`fmt(fromPaise(100)) === "₹1.00"`.

**H.4 Reject invalid writes instead of 500ing** — a PATCH that explicitly sends
`null` for a NOT NULL column (`{"name": null}`) hits the DB constraint and
returns **500** on accounts, customers and services alike; an out-of-range
integer (`10**19`) 500s the same way. Empty and whitespace-only names are
accepted everywhere (`""` and `"   "` both created accounts). Fix at the
pydantic boundary so the rejection is uniform, not endpoint-by-endpoint.
*Verify:* `{"name": null}` and `{"name": "   "}` each return 422/400 on all
three resources; `opening_balance_paise: 10**19` returns 400, not 500.

**H.5 Inactive accounts and overdrafts in transfers** — `_get_or_404` checks
only `deleted_at`, so a **deactivated account still accepts transfers** (a
transfer out of a deactivated account returned 201), and the frontend pickers
list it because `GET /api/accounts` has no active filter. Separately, a
transfer of ₹999,999.99 from a ₹0 cash drawer succeeded and drove the balance
to **−₹999,503.99** with no warning. Decide the overdraft policy explicitly:
cash cannot go negative in the physical world, and a silent negative drawer
misstates every downstream report.
*Verify:* a transfer touching a deactivated account returns 400; the transfer
form lists active accounts only; a cash transfer exceeding the derived balance
is rejected (or, if allowed by decision, is recorded and surfaced as a warning
in the UI — pick one and state it).

**H.6 Ledger read hardening** — two defects in `GET /api/ledger`:
- The running balance is a window function over the **filtered** set, so under
  a date or type filter it restarts mid-history rather than continuing from the
  account's prior balance. Measured on the same account: date-filtered last
  running balance −₹999,499.99 vs. a true balance of −₹999,503.99. This breaks
  PLAN 1.7's *Verify* for every case except the unfiltered one.
- `limit` and `offset` are unbounded and unchecked: `limit=-1` is passed
  straight to SQLite, which reads it as *no limit* and returns the whole table.
*Verify:* a date-filtered running balance ends at the value
`GET /api/accounts/{id}/balance` reports; `limit=-1` and `limit=10000000` are
both clamped to the documented maximum, and `offset=-5` is rejected or floored
to 0.

**H.7 Customer search and soft-delete reachability** — two defects in
`customers.py`:
- Search interpolates `q` into a `LIKE` pattern without escaping, so `%` and
  `_` act as wildcards — `q=%` returns every customer.
- `/history` and `/outstanding` both call `_get_or_404`, which filters on
  `deleted_at`, so a soft-deleted customer's history returns **404**. PLAN 2.2
  claims "their history remains intact"; the data is intact in the DB but no
  API path reaches it, so the criterion is not actually met.
*Verify:* `q=%` returns only customers whose text literally contains `%`;
`GET /customers/{id}/history` on a soft-deleted customer returns their rows
(flagged as deleted) rather than 404, making 2.2's *Verify* genuinely pass.

**H.8 Frontend loading and error states** — no page handles a failed query.
Every call site is `const { data = [] } = useQuery(...)`, so a backend 500
renders as an empty table and `AccountBalance` renders **"₹0"** — a *wrong
balance* presented as fact. There is exactly one loading indicator in the whole
frontend (the transfer button). For a cash-handling app, "I could not load
this" and "this is ₹0" must never look the same.
*Verify:* with the backend stopped, every wired page shows an explicit error
state and no page displays a monetary figure; while in flight, pages show a
loading state rather than a zeroed one.

**H.9 Reversal chain guard** — `reverse_entry` blocks reversing the same entry
twice, but happily reverses a *reversal*: the audit reversed entry B (itself
the reversal of A) and the balance went back to ₹1,000, silently re-applying
the original. Reversal is the only correction mechanism in the system (3.6,
5.2), so an un-auditable way to re-apply a reversed entry is a real hole.
*Verify:* reversing a row whose `entry_type` is `reversal` is rejected; the
existing single-reversal rule still holds.

**H.10 Regression tests for the above** — one `backend/tests/test_edge_cases.py`
in the existing plain-`assert` style (ARCHITECTURE.md §8), covering H.1–H.2 and
H.4–H.9, plus the two `fmt`/date assertions in `src/lib/format.test.ts`.
*Verify:* the file fails against today's code and passes after H.1–H.9 land.

**Not scheduled, recorded deliberately.** Duplicate account names, duplicate
service names, and two customers sharing a phone number are all accepted. These
are plausibly *correct* for a village shop (two family members, one phone), so
they are listed as findings rather than steps — decide before Phase 3 whether
the customer picker needs a duplicate warning.

---

## Phase 3 — Transactions & payments

**3.1 Transaction create API** — server computes `total = fee + charge −
discount` and rejects any client-supplied total.
*Verify:* a request with a tampered total is rejected, not silently trusted.

**3.2 Ledger posting** — a transaction posts `service_income` for the amount
actually paid, not the amount billed.
*Verify:* a ₹150 transaction paid in full raises cash by exactly ₹150 and
appears in the ledger.

**3.3 Payments API** — settle one or several outstanding bills with a single
amount; `transaction_id` nullable.
*Verify:* one ₹350 payment clears two separate outstanding bills correctly.

**3.4 Derived status** — `completed`/`partial`/`pending` computed from payments,
never hand-set.
*Verify:* status flips to `completed` the moment the final payment lands, with
no explicit status write.

**3.5 Transaction list API** — filters for date, service, status and customer,
with pagination.
*Verify:* filter combinations return consistent counts and totals.

**3.6 Transaction correction** — edits post reversal plus replacement rather
than mutating ledger rows.
*Verify:* the ledger retains both rows; the balance reflects only the
corrected figure.

**3.7 Transactions page wiring** — real list, filters and summary bar.
*Verify:* the collected and pending totals match the API.

**3.8 Real transaction form** — replaces today's uncontrolled inputs and no-op
Save button. Customer picker, service picker pre-filling defaults, live total,
payment amount.
*Verify:* a ₹107-of-₹357 partial payment leaves ₹250 outstanding on the
customer and only ₹107 in the ledger; a later ₹250 payment clears it.

---

## Phase 3.5 — Hardening transactions & payments

Inserted after an edge-case audit of the shipped Phase 3 code (backend run
against a scratch DB on port 8100, 169 probes across `/transactions`,
`/payments`, `/transfers`, `/ledger`, `/accounts` and `/customers`, plus
direct SQLite inspection of `ledger`, `transactions` and `payments` after
every write). Every item below is a **reproduced** failure, not a review
opinion. Phases 4–7 post expenses, banking and reports through exactly these
paths, and Phase 6's day close reads the `business_date` columns these
endpoints write, so the defects compound if carried forward.

H.11 is the one that matters most: it does not just break Phase 3, it
retroactively invalidates the H.5 and H.9 guards Phase 2.5 shipped, because
both were only ever tested sequentially.

Ordered by severity. H.11–H.14 damage money or corrupt the ledger.

**H.11 Serialise the read-check-write money guards** — every guard on a write
path reads its precondition outside any transaction. Python's `sqlite3` starts
a transaction only on the first INSERT/UPDATE, so a bare `SELECT` takes no
lock at all, and under WAL (added by H.1) readers never block writers — so N
concurrent requests all pass the same guard against pre-state before any of
them writes. Three reproductions:
- **Payments** (`payments.py:58`): 12 parallel ₹1,000 payments against a
  single ₹1,000 bill returned **12× 201**, wrote 12 `payments` rows summing
  **₹12,000**, drove the customer's outstanding to **−₹11,000** and raised the
  account balance by **₹12,000** for a ₹1,000 bill. ₹11,000 of
  `customer_payment` entered the ledger against money that was never billed.
- **Corrections** (`ledger.py:106`, via `transactions.py:262`): 8 parallel
  account corrections of one ₹600 transaction reversed ledger entry 54
  **8 times** (`SELECT reverses_id, COUNT(*) … → {54: 8}`) and left **6 live
  non-reversed `service_income` rows**. The source account moved **−₹3,600**
  and the destination **+₹3,600** for a single ₹600 transaction. H.9's "a row
  can only be reversed once" holds sequentially and fails here.
- **Transfers** (`transfers.py:47`): 10 parallel ₹1,000 transfers from an
  account holding exactly ₹1,000 returned **5× 201 / 5× 400** and left the
  source at **−₹4,000**. H.5 chose "reject rather than record-and-warn"
  precisely so a balance could never go negative; it goes negative anyway.

One fix, not three: a `begin_write(conn)` helper in `db.py` issuing
`BEGIN IMMEDIATE` before the guard's SELECT in each guarded write path, so the
check and the write share one write lock. Add a `UNIQUE` index on
`ledger(reverses_id)` in a new migration as a DB-level backstop for the
single-reversal rule — the same belt-and-braces reasoning as the immutability
trigger in `002_ledger_immutable.sql`.
*Verify:* 12 parallel ₹1,000 payments against one ₹1,000 bill yield exactly
**1× 201 and 11× 400**, one `payments` row, outstanding ₹0, and an account
delta of exactly +₹100,000 paise; 8 parallel corrections of one transaction
leave exactly one reversal per reversed entry and exactly one live
`service_income` row; 10 parallel ₹1,000 transfers from a ₹1,000 account
leave the source at ₹0, never negative.

**H.12 Reject a payment larger than the bill at create time** —
`TransactionCreate.amount_paid_paise` is bounded only by `ge=0`
(`transactions.py:61`), never against the computed total. A ₹100 bill created
with `amount_paid_paise: 500000` returned **201**, posted a **+₹5,000**
`service_income` ledger row, wrote a ₹5,000 `payments` row, set status
`completed`, and left the customer's outstanding at **−₹4,900**. The frontend
already blocks this (`Transactions.tsx:126`), which is exactly why the server
must too — the guard exists only on the side that can be bypassed. Money the
shop never billed is now in the ledger and in every downstream report.
*Verify:* a ₹100 bill with `amount_paid_paise: 500000` returns 400; the same
bill with `amount_paid_paise: 10000` still returns 201; no customer's
`outstanding_paise` is ever negative after a create.

**H.13 business_date validation on the transactions write path** — H.2 put the
validator inside `insert_entry`, which is the only path *into the ledger* but
not the only path that writes a `business_date`. `create_transaction` inserts
the `transactions` row **before** calling `insert_entry`, and skips
`insert_entry` entirely when `amount_paid_paise` is 0 — the normal
bill-on-credit case. All seven malformed dates returned **201**:
`'not-a-date'`, `'2026-13-45'`, `''`, `'  '`, `'04-08-2026'`, `'0000-00-00'`,
`'2026-08-04T00:00:00'`. The audit DB ended with **8 unparseable rows in
`transactions` and 0 in `ledger`**, and `ORDER BY business_date` over
`transactions` yielded `['', '  ', '0000-00-00', '04-08-2026',
'2026-08-04T00:00:00', '2026-13-45', 'not-a-date']`. `PATCH
/transactions/{id}` is worse — `{"business_date": "not-a-date"}` returned
**200** and corrupted a previously valid row. Lift the check out of
`insert_entry` into one shared validator applied wherever a `business_date`
is accepted, matching the placement H.2 intended.
*Verify:* all seven malformed dates return 400 on both POST and PATCH
`/transactions`; a valid `YYYY-MM-DD` still returns 201/200; no row in
`transactions`, `payments`, `account_transfers` or `ledger` has a
`business_date` that fails `date.fromisoformat`.

**H.14 Corrections must move the ledger, not just the bill** —
`correct_transaction` reverses and re-posts only when `account_id` changes
(`transactions.py:262`); a changed amount or date rewrites the `transactions`
row and leaves the ledger untouched. Reproduced on a walk-in ₹150 transaction
paid in full:
- Corrected fee ₹150 → ₹250: the account balance moved by **0**, the ledger
  still held a single **₹150** row, and status became `partial` — a bill the
  customer already paid and walked away from, which no payments row can ever
  settle because `payments.customer_id` is NOT NULL.
- Corrected again ₹250 → ₹50: status flipped to **`completed`** while the
  ledger still held **₹150**. The system now reports a ₹50 bill fully settled
  with ₹150 of cash sitting against it.
- Corrected `business_date` `2026-08-04` → `2026-07-01`: the transaction moved
  to July, its ledger row stayed on **2026-08-04**, and
  `SELECT COUNT(*) FROM ledger WHERE business_date='2026-07-01'` returned
  **0**. Phase 6.2 derives opening balances by summing ledger rows before a
  date, so the bill and the cash it produced now belong to different days.
PLAN 3.6 promises "the ledger retains both rows; the balance reflects only the
corrected figure" — the first half holds for account moves only, the second
half does not hold at all. Route every correction that changes the posted
amount or date through the same reversal + replacement the account-change
branch already uses.
*Verify:* correcting a fully-paid ₹150 walk-in to ₹250 leaves the original
₹150 row **and** posts a reversal plus a ₹250 replacement, so the derived
balance moves by exactly +₹100 and the ledger row count for that transaction
goes from 1 to 3; correcting its date to `2026-07-01` puts the live ledger row
on `2026-07-01`; no correction ever leaves `status='completed'` with a ledger
total different from `total_paise`.

**H.15 Deactivated accounts and services still take new money** —
`transfers.py:47` checks `is_active`; `transactions.py` and `payments.py` call
the same `_get_or_404`, which checks only `deleted_at`. Reproduced: a
transaction paid into a deactivated account returned **201** and raised that
account's balance to **₹1,300**; a payment into a deactivated account returned
**201**; `PATCH /transactions/{id} {"account_id": <deactivated>}` returned
**200**. Separately, a transaction against a **deactivated service** returned
**201** — PLAN 2.1 promises a deactivated service is "excluded from pickers but
retained on old transactions", and the picker does exclude it
(`Transactions.tsx:66`), but the API accepts it. Put the active check in the
shared `_get_or_404` helpers (or a `_get_active_or_404` beside them) rather
than repeating `transfers.py`'s inline check at each new call site.
*Verify:* POST `/transactions` and POST `/payments` naming a deactivated
account each return 400; PATCH moving a transaction onto a deactivated account
returns 400; POST `/transactions` against a deactivated service returns 400;
transfers between two active accounts still return 201.

**H.16 Reject non-positive transaction totals** — `fee_paise` is bounded by
`ge=_INT64_MIN` (`transactions.py:57`), so the server accepts money flowing
backwards through a service bill. Reproduced, all **201**: `fee_paise:
-50000` → `total_paise: -50000`; `fee_paise: 10000` with `discount_paise:
50000` → `total_paise: -40000`; `fee_paise: 0` → `total_paise: 0`. A negative
service bill is not a real event — an expense is (Phase 4) and a refund is a
reversal (H.14). The frontend blocks a negative *fee* only
(`Transactions.tsx:125`), so a discount larger than the fee passes both sides
today.
*Verify:* `fee_paise: -50000` returns 422; `fee_paise: 10000` with
`discount_paise: 50000` returns 400; a zero total returns 400; `fee_paise:
10000` with `discount_paise: 10000` and a non-zero charge still returns 201.

**H.17 Integer overflow returns 500** — `total_paise = fee + charge -
discount` (`transactions.py:192`) is computed in Python's unbounded ints and
handed to SQLite, which rejects anything past int64. `fee_paise` and
`charge_paise` both at `2**63 - 1` returned **500 Internal Server Error**, as
did both at `2**62`. The individual fields are already bounded at the pydantic
boundary (`10**19` correctly returns 422) — it is only their sum that escapes.
Bound the computed total the same way, so the rejection is a 400 with a
`detail` rather than a traceback.
*Verify:* `fee_paise` and `charge_paise` both `2**62` return 400 with a
`detail`, not 500; each field alone at `10**19` still returns 422.

**H.18 Frontend: rejections are unreadable, and the form's date goes stale** —
two client-side defects in the transaction form's layer:
- `api.ts:11` throws `` `${method} ${path} failed: ${res.status}
  ${res.statusText}` `` and never reads the response body, so the `detail`
  ARCHITECTURE.md §6 specifies is discarded on every error. Running the real
  `api.ts` against the scratch backend, `setFormError` (`Transactions.tsx:106`)
  received `"POST /payments failed: 400 Bad Request"` for both *"amount exceeds
  the customer's outstanding balance"* and *"invalid business_date:
  'not-a-date'"* — two unrelated causes, one indistinguishable message. Every
  400 this phase adds inherits it.
- `emptyForm` is a module-scope constant (`Transactions.tsx:38`) whose
  `businessDate` calls `localDateISO()` **once at import**, and both
  `openForm()` (line 132) and the create `onSuccess` (line 102) reset to that
  frozen object. A session left open across midnight — the normal case for the
  Electron desktop app of Phase 9 — keeps stamping new transactions with the
  previous business day, which is the same class of defect H.3 fixed in the
  Accounts page. *(Mechanism read from source; the midnight rollover itself
  was not driven live — see the note below on browser coverage.)*
*Verify:* a payment rejected for exceeding outstanding and one rejected for a
bad date show two different messages, each containing the API's `detail`
string; `openForm()` called after the clock passes midnight pre-fills the new
date, not the date the module loaded on.

**H.19 Payments have no path through the UI** — `grep -rn "/payments" src/`
returns **nothing**. The Phase 3.3 API ships, is covered by
`backend/tests/test_payments.py`, and is reachable only by curl. PLAN 3.8's
*Verify* — "a ₹107-of-₹357 partial payment leaves ₹250 outstanding on the
customer and only ₹107 in the ledger; **a later ₹250 payment clears it**" —
cannot be performed in the app, because the transaction form only sends
`amount_paid_paise` at creation and nothing calls `POST /api/payments`
afterwards. Settling an outstanding bill is the single most common counter
action in a shop that extends credit, so this is a functional hole, not
polish. Smallest fix that closes 3.8: a settle control on the customer
drill-down (`Customers.tsx` already queries `customerOutstanding`), not a new
page.
*Verify:* a ₹357 bill paid ₹107 at creation can be settled with a later ₹250
entirely through the UI, after which the customer's outstanding reads ₹0 and
the transaction's status reads `completed`; the ledger holds a ₹107
`service_income` row and a ₹250 `customer_payment` row.

**H.20 Regression tests for the above** — extend
`backend/tests/test_edge_cases.py` in the existing plain-`assert` style
(ARCHITECTURE.md §8) to cover H.11–H.17, reusing that file's threadpool helper
for the three H.11 races. H.18 and H.19 are frontend-only and cannot be
covered there: assert the two `api.ts` error strings and the `emptyForm`
staleness in `src/lib/format.test.ts`'s sibling, and cover H.19 by walking
3.8's *Verify* in the browser once the settle control exists.
*Verify:* the file fails against today's code on every one of H.11–H.17 and
passes after they land.

**Not scheduled, recorded deliberately.** Two behaviours are defensible as-is
but should be decided before Phase 5 builds on them:
- `create_payment` rejects any amount above the customer's current outstanding
  (`payments.py:58`), so a customer cannot pay an advance against future work.
  Plausible for a village shop that bills on completion; confirm before
  banking (5.2) needs prepayments.
- When one payment settles several bills, the single `customer_payment` ledger
  row carries `source_id = created_ids[0]` (`payments.py:80`) — it points at
  the first `payments` row only, so the ledger row cannot be walked back to
  the full set it settled. Harmless until a payment needs reversing.

---

## Phase 4 — Expenses

Small phase, but it exercises the ledger in the negative direction.

**4.1 Expenses CRUD API** — category, amount, paying account, note; posts a
negative ledger entry.
*Verify:* a ₹350 paper expense paid from cash lowers the cash balance by
exactly ₹350 and appears negative in the ledger.

**4.2 Expense categories** — PRD §3 categories held in `settings` so the
operator can add their own, rather than hardcoded in the frontend.
*Verify:* a category added in settings appears in the expense form.

**4.3 Expenses page wiring** — list, date and category filters, create, edit,
delete.
*Verify:* deleting an expense reverses its ledger entry rather than erasing it.

---

## Phase 5 — Banking

The phase most likely to be modelled wrong. Principal and commission must not
be conflated.

**5.1 Banking ledger mapping** — implement the `ARCHITECTURE.md` §3 event table
for all five types, with a test per type.
*Verify:* principal rows sum to zero for every type; only commission is booked
as income.

**5.2 Banking CRUD API** — create, list with filters, and correction via
reversal.
*Verify:* a corrected banking entry leaves both rows and a net-correct balance.

**5.3 Commission tracking** — commission totals per account and period.
*Verify:* commission sums match a direct ledger query for
`entry_type='commission'`.

**5.4 Banking page wiring** — real list and summary (the page currently has
zero interactivity).
*Verify:* today's commission total on the page matches the API.

**5.5 Banking entry form** — fields vary by transaction type; balance enquiry
has no principal, transfers need a destination.
*Verify:* a ₹5,000 AEPS withdrawal with ₹50 commission raises today's income
by ₹50 — **not** ₹5,050 — while settlement drops ₹5,000 and cash rises ₹5,000.

---

## Phase 6 — Daily opening, closing & business day lock

**6.1 business_days table & auto-open** — first write of a date opens it.
*Verify:* a transaction on a fresh date creates an `open` day row.

**6.2 Opening balance derivation** — sum of all ledger entries before the date.
No carry-forward copying.
*Verify:* opening balance for day D equals closing balance for D−1 with no
copy step involved.

**6.3 Closed-day write guard** — one guard in the shared write path, not per
endpoint.
*Verify:* every write endpoint returns 409 for a closed date; the guard is
implemented once.

**6.4 Close-day API** — validation, physical cash variance, mandatory remarks
on adjustment, `daily_account_balance` snapshot for every account.
*Verify:* the snapshot matches derived balances exactly at close time.

**6.5 Closing report generation** — opening, income, expenses, transfers,
closing and variance per PRD §8.
*Verify:* report figures reconcile against the ledger for that date.

**6.6 DailyClosing page wiring** — the 6-step workflow driven by the API,
replacing today's `useState`-only mock where `Lock Business Day` just flips a
boolean.
*Verify:* closing genuinely locks the day; reopening the app shows it closed.

**6.7 Closing report print view** — print-friendly layout.
*Verify:* prints legibly on A4 without the sidebar.

---

## Phase 7 — Dashboard & reports

**7.1 Dashboard API** — the 8 PRD §3 tiles in one response.
*Verify:* each tile reconciles against a direct ledger query.

**7.2 Dashboard page wiring** — real tiles with a loading state.
*Verify:* recording a transaction updates the dashboard without a manual
refresh (react-query invalidation).

**7.3 Daily & monthly reports** — query layer.
**7.4 Customer-wise & service-wise reports** — query layer.
**7.5 Banking commission & P&L reports** — query layer.
*Verify (7.3–7.5):* each report's totals equal a direct `SUM` over `ledger`
for the same period.

**7.6 Reports page wiring** — report picker and date range selection.
*Verify:* switching range refetches and totals change coherently.

**7.7 CSV export & print layout** — export any report.
*Verify:* exported CSV totals match the on-screen totals.

**7.8 Reconciliation test suite** — automated check that every report
reconciles with the ledger. This is PRD acceptance criterion 6, checked rather
than assumed.
*Verify:* the suite passes against a scripted month of mixed activity.

---

## Phase 8 — Auth, audit & backup

**8.1 Auth API** — `users`, bcrypt hashing, login/logout, session token.
*Verify:* the password is never stored or logged in plaintext.

**8.2 Auth enforcement** — guard on all endpoints, frontend login screen,
protected routes, token in memory not `localStorage`.
*Verify:* the app is unusable until authenticated; an unauthenticated API call
returns 401.

**8.3 Audit log writer** — before/after JSON on every financial mutation.
*Verify:* editing a transaction leaves a complete before/after audit row.

**8.4 Audit log viewer** — filterable UI.
*Verify:* the viewer shows the row written in 8.3.

**8.5 Automatic backup** — `VACUUM INTO` on app close, timestamped, retention
count from settings.
*Verify:* the backup is a valid SQLite file openable while the app runs.

**8.6 Restore flow** — backs up the current DB first, then restores; explicit
confirmation.
*Verify:* a restored backup reproduces all balances exactly.

**8.7 Day reopen override** — admin-only, writes an audit row.
*Verify:* reopening is impossible without admin and always leaves a trace.

---

## Phase 9 — Electron packaging

Deliberately last. Packaging a moving target does the work twice.

**9.1 Electron shell** — loads the built frontend, single window, app menu.
*Verify:* `npm run electron` opens the built app.

**9.2 Backend bundling & lifecycle** — PyInstaller build, spawned as a child
process on a fixed loopback port, terminated on quit.
*Verify:* no orphaned Python process remains after closing the app.

**9.3 App data paths** — DB and backups in `%APPDATA%\CSCMS`; migrations run on
version upgrade.
*Verify:* installing a newer build over an older one migrates the existing DB
without data loss.

**9.4 Windows installer** — electron-builder, icon, shortcuts.
*Verify:* the installer completes on a clean machine.

**9.5 First-run setup wizard** — shop name, accounts, opening balances.
*Verify:* a fresh install reaches a usable state without touching a terminal.

**9.6 Clean-machine acceptance test** — full PRD §12 pass.
*Verify:* installs on a machine with no Python and no Node, works with the
network disabled, and a transaction survives a full restart.

---

## Phase 10 — Deferred

Genuinely useful, genuinely not blocking. Pulled forward on request. Left
unbroken deliberately — breaking down work this far out is speculation.

- Printing module — a **new** `Printing.tsx` screen (none exists), photocopy
  and lamination pricing, passport photos.
- Attachments — upload against transactions and customers.
- Receipt/barcode printing.
- PRD §11 future work: multi-user, multi-branch, cloud sync, SMS/WhatsApp,
  GST reporting, mobile companion.

---

## Risk notes

**The ledger design in `ARCHITECTURE.md` §2 is load-bearing.** If stored
balance columns get reintroduced as a performance shortcut, reconciliation
breaks and the acceptance criteria become unachievable. Cache only with an
explicit rebuild command, never as a second writable source.

**Banking commission modelling (5.1, 5.5) is the most common correctness bug**
in this class of application. Booking the ₹5,000 principal of an AEPS
withdrawal as income overstates daily profit by a hundredfold.

**Concurrency was assumed away and it does not hold (H.1).** "Single operator,
single machine" was read as "one request at a time", but react-query issues
parallel queries by default — the Accounts page alone fires one balance request
per account card. The threading defect was invisible to sequential tests and to
manual clicking, and only appeared under a parallel probe. Any future assumption
of serialised access needs the same treatment.

**A guard proven by a sequential test is not a guard (H.11).** H.1 established
that concurrency is real here; H.5 and H.9 were then written and verified
sequentially anyway, and both fail under a parallel probe — the overdraft
guard let an account reach −₹4,000, and the single-reversal rule was bypassed
8 times on one entry. The cause is not the guards' logic but where they read:
Python's `sqlite3` opens no transaction for a bare `SELECT`, so every
check-then-write in the codebase reads pre-state. Any future rule of the form
"reject the write if the current state says X" needs `BEGIN IMMEDIATE` around
the check and a parallel probe in its *Verify* line, or it is decorative.

**Validation belongs where the column is written, not where the ledger is
(H.13).** H.2 was placed inside `insert_entry` on the reasoning that it is
"the only path anything reaches the ledger by" — true, and insufficient, because
`business_date` is a column on four tables. `create_transaction` writes it
before `insert_entry` runs, and skips `insert_entry` entirely for an unpaid
bill. Phase 4's expenses and Phase 5's banking each add another table with a
`business_date`; the validator has to be shared at the boundary, not at the
ledger.

**A missing error state is a wrong number (H.8).** The frontend's `data = []`
default turns a failed fetch into a confident "₹0". In a ledger app, silence and
zero must be visually distinct, or the operator reconciles against a figure the
system never actually had.

**The existing UI is a mock, not a partial implementation.** Its forms don't
submit and its numbers come from `mockData.ts`. Steps that say "wiring" are
paired with a separate form step for exactly this reason — the screens are the
easy half.

**Step count is not effort.** 3.8, 6.6 and 9.2 are each worth several of the
smaller steps.
