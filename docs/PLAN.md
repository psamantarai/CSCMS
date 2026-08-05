# CSCMS — Implementation Plan

16 phases, 113 steps. Phases run in order; each depends on the one before.
(Phase 2.5 was inserted after an edge-case audit of the shipped Phase 0–2
code — see that phase for what it found and why it blocks Phase 3. Phase 3.5
came from the same pass repeated over the shipped Phase 3 code. Phase 4.5
repeated it again over the shipped Phase 4 code. Phase 7.9 repeated it once
more over the shipped Phase 5, 6 and 7 code — three phases shipped back to
back with no hardening pass in between. Phase 8.8 repeated it over the shipped
Phase 8 code.)

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

## Phase 4.5 — Hardening expenses

Inserted after an edge-case audit of the shipped Phase 4 code (backend run
against a scratch DB on port 8123 — after moving off a stale port-8100
listener left from before Phase 4 — via an Opus subagent per the audit's
money/concurrency reasoning requirement). ~905 probes across `/expenses`,
`/expenses/categories`, plus `/ledger` and `/accounts` for invariant checks:
malformed input, dates, identity, concurrency and idempotency. The money
invariant itself held throughout — every concurrency trial reconciled to
the paise, no orphan half-reversals, no account went negative — but two
write paths skip the `begin_write` lock H.11 introduced for exactly this
class of bug, and two more let a PATCH bypass H.15's deactivated-account
guard. Phase 5 (banking) and Phase 6 (closing) both read expense categories
and the expenses ledger rows these paths write, so the gaps compound if
carried forward.

Ordered by severity.

**H.21 Concurrent category writes silently lose data** — `add_category`
(`backend/app/expenses.py:169-177`) reads `_get_categories`, appends, then
`UPDATE settings` with no `begin_write` — the exact H.11 pattern, unapplied
to this write path. 12 barrier-synced POSTs of 12 distinct category names,
5 trials, persisted **1/12, 2/12, 4/12, 1/12, 3/12** — every losing request
still returned **HTTP 200** with the submitted name echoed in the response
body, so the client has no way to detect the loss. Downstream: Phase 5/6
read this same `settings` row for expense reporting; a category an operator
believes exists is silently gone.
*Verify:* 12 parallel `POST /expenses/categories` with 12 distinct names
against a clean settings row persist all 12, confirmed by a subsequent
`GET /expenses/categories`.

**H.22 A comma in a category name corrupts the stored list** —
`_get_categories` splits on `,` (`expenses.py:160`) and `add_category`
joins with `,` (`expenses.py:174`) with no escaping. `POST
/expenses/categories {"name": "Rent, Utilities r1"}` returns 200, but a
following `GET` shows the name split into two separate entries (`"Rent"`
and `"Utilities r1"`) — `"Rent, Utilities r1" in categories` is `False`.
Because the idempotency check (`if body.name not in categories`) can then
never match its own input, reposting the same name **twice** grows the
list from 37 to 41 entries — unbounded growth, not a no-op. Downstream:
`src/pages/Expenses.tsx:173` and `:216` render `<option key={c}>` over this
list, so the duplicate `"Rent"` produces duplicate React keys in both the
expense form and the filter dropdown.
*Verify:* `POST /expenses/categories {"name": "A, B"}` followed by `GET
/expenses/categories` contains exactly one entry equal to `"A, B"`, and
reposting the identical name twice leaves the list length unchanged.

**H.23 Concurrent or edit-racing delete returns 500 instead of 204/404** —
`delete_expense` (`expenses.py:241-248`) finds the live ledger entry and
reverses it with no `begin_write`, unlike `update_expense`'s money-changing
branch which locks at `expenses.py:209`. Two reproductions:
- 12 parallel `DELETE` on one expense, 3 trials: **9/12, 11/12 and 4/12
  requests returned 500** (`204` and `404` split the rest), the server log
  showing `ValueError: ledger entry … has already been reversed`
  (`ledger.py:114`) and `sqlite3.IntegrityError: UNIQUE constraint failed:
  ledger.reverses_id` — the migration-003 unique index is the only thing
  stopping a double reversal, not application logic.
- 6 parallel `DELETE` racing 6 parallel money-changing `PATCH` on the same
  expense, 4 trials: **every delete returned 500, every time**, and the
  expense survived live with the patched amount — the delete never once
  succeeded because `update_expense`'s lock always wins the race and the
  unlocked delete always reads a stale live-entry id.
The confirm-delete button in `Expenses.tsx:144` has no double-submit guard,
so a double-click reproduces the first case directly from the UI.
*Verify:* 12 parallel `DELETE` on one expense yield exactly one `204` and
eleven `404`, never a `500`; 6 parallel `DELETE` racing 6 parallel
money-changing `PATCH` on one expense leave the expense in a consistent
end state (either deleted with its ledger entry reversed, or updated with
exactly one live entry) with no `500` either side.

**H.24 PATCH bypasses the H.15 deactivated-account guard when `account_id`
is omitted** — `update_expense` only checks the account is active `if
"account_id" in fields` (`expenses.py:195-196`), but the reversal + fresh
`insert_entry` at `:216-225` runs whenever amount or date changed,
regardless of whether `account_id` was in the payload. Reproduced: create
an expense on account Z, deactivate Z (`PATCH /accounts/{id}
{"is_active": false}`), then `PATCH /expenses/{id} {"amount_paise": 11000}`
(no `account_id` key) — returns **200** and posts a fresh `-11000` entry to
the now-deactivated account Z. `create_expense` and a PATCH that explicitly
repeats the unchanged `account_id` both correctly reject with `400 account
is deactivated`; only the omitted-key path leaks through.
*Verify:* deactivate an account holding a live expense, then `PATCH` that
expense's `amount_paise` without an `account_id` key — expect `400 account
is deactivated`, not `200`.

**H.25 UI cannot edit any field of an expense once its account is
deactivated** — the flip side of H.24: `Expenses.tsx`'s `updateMutation`
(`:91-97`) always sends all five fields including the current
`account_id`, so `update_expense`'s unconditional check at `expenses.py:196`
rejects even a note-only edit with `400 account is deactivated`. The
account `<select>` at `Expenses.tsx:188` only lists active accounts, so
there is no way to retarget the expense to a valid account either — the
row is stuck. Share the fix with H.24: only require the *new* account be
active when money is actually moving (the `account_changed || date_changed
|| amount_changed` block already computed at `:200-202`), not whenever
`account_id` is merely present in the payload.
*Verify:* deactivate an account holding a live expense; editing only that
expense's note from the UI succeeds, and the row's ledger entry is
untouched.

**H.26 Out-of-range expense id returns 500** — `_get_or_404`
(`expenses.py:71-74`), reached from `GET/PATCH/DELETE /expenses/{id}`, does
`WHERE id = ?` with the raw path int. An id outside SQLite's 64-bit integer
range (`99999999999999999999`, or `-99999999999999999999`) raises
`OverflowError: Python int too large to convert to SQLite INTEGER`,
reproduced 11 times across `GET`/`PATCH`/`DELETE`. The int64 boundary
itself is fine (`9223372036854775807` → correct `404`).
*Verify:* `GET/PATCH/DELETE /expenses/99999999999999999999` return `404`,
not `500`.

**H.27 Ledger keeps the pre-edit note after a later money edit** — in
`update_expense`'s money-changing branch, the new ledger entry's
description is `fields.get("note", live_entry["description"])`
(`expenses.py:223`) — it falls back to the *old ledger row's* text, not the
expense's current note. Reproduced: create an expense with note "ORIGINAL
NOTE"; `PATCH {"note": "CORRECTED NOTE"}` (no money change, correctly
untouched); `PATCH {"amount_paise": 12000}` — the new, permanently
immutable ledger row is written with description `"ORIGINAL NOTE"`, even
though `GET /expenses/{id}` now shows `"CORRECTED NOTE"`.
*Verify:* correct an expense's note, then edit its amount — the resulting
ledger entry's `description` matches the expense's current note, not the
one it had before the note edit.

**H.28 Regression tests for the above** — extend
`backend/tests/test_edge_cases.py` in the existing plain-`assert` style
(`ARCHITECTURE.md` §8) to cover H.21, H.22, H.23 (both races, reusing the
file's threadpool helper), H.24, H.26 and H.27. H.25 is frontend-only and
cannot be covered there — walk its *Verify* in the browser once H.24 lands,
since the backend fix for H.24 is what unblocks it.
*Verify:* the file fails against today's code on every one of H.21–H.24 and
H.26–H.27, and passes after they land.

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

## Phase 7.9 — Hardening banking, daily closing, dashboard & reports

Inserted after an edge-case audit of the shipped Phase 5, 6 and 7 code
(backend run against a scratch DB on port 8123, ~490 probes across
`/api/banking*`, `/api/day/{date}*`, `/api/dashboard`, `/api/reports/*` and
the Phase-6-touched paths in `/api/transactions`, via an Opus subagent per
the audit's money/concurrency reasoning requirement, plus ~45 browser
interactions driving the Banking, DailyClosing, Dashboard and Reports pages).
Every item below is a **reproduced** failure, not a review opinion. Banking's
own concurrency guards (H.11/H.23-style `begin_write` placement) held under
load — 12 parallel creates against a funded account, 12 parallel deletes and
12 parallel corrections of one entry, and 12 parallel closes of one date all
serialised cleanly. What didn't hold is the closed-day guard PLAN 6.3 promised
"implemented once": it turns out to be conditional per call site, the same
shape as H.13 and H.21/H.23 before it, and Phase 8's audit log and backup
both assume a closed day's numbers are actually final.

H.29–H.31 are the ones that matter most: they mean a day that has been
formally closed, reported, and printed can still change under it, silently.

Ordered by severity. H.29–H.32 damage money or corrupt a sealed record.

**H.29 `correct_transaction` skips the closed-day guard unless the
computed replacement amount actually differs** — `ensure_business_day_open`
is only called `if date_changed` (`backend/app/transactions.py:302-315`);
the only other route to a check is `insert_entry`'s own internal guard,
reached only through the `if live_entry is not None:` branch at :322-336 —
which a **pending** transaction never enters (no live ledger row exists to
find) and which a **partially-paid** transaction skips whenever the
recomputed amount happens to equal the existing live entry's amount. Two
reproductions on a date closed via `POST /day/{date}/close`:
- Pending transaction, `fee_paise` 10000 → 77700: `PATCH /transactions/{id}`
  returned **200**; `total_paise` moved 10000 → 72700 with `service_id` and
  `discount_paise` also changed by two more 200s, all on a date whose
  `business_days.status = 'closed'`.
- Partially-paid customer transaction, `fee_paise` 20000 → 30000 (live entry
  amount unchanged): returned **200**; `total_paise` moved 20000 → 30000.
A control `POST /transactions` against the same closed date correctly
returned 409 — only the correction path is unguarded. Observed downstream:
`GET /reports/service-wise` for a range spanning the closed date reported the
corrected `Aadhaar · ₹727.00` figure for a day whose printed closing report
had already sealed `PAN · ₹100.00`.
*Verify:* create a pending transaction on date D, close D, `PATCH` its
`fee_paise` — returns 409, `total_paise` unchanged; the same for a
partially-paid transaction whose live-entry amount would be unchanged by the
correction.

**H.30 A correction or deletion can post a new ledger row onto an
already-closed date — the sealed report changes after close** —
`reverse_entry`'s offsetting row is deliberately exempt from the closed-day
guard (`backend/app/ledger.py:73-87`, comment: "the guard would otherwise
make even a pure deletion of anything dated on a closed day permanently
impossible"), and every correction path checks only the **new** date, never
the resource's *original* one: `transactions.py:314` guards `new_business_date`
only; `banking.py:252` (`update_banking`) the same; `banking.py:285-301`
(`delete_banking`) calls `ensure_business_day_open` **nowhere at all**. So a
reversal — and, via `delete_banking`'s missing check entirely, a fresh
replacement too — lands on a closed date with no guard ever firing.
Reproduced on `2026-08-03` after closing with a snapshot taken:
```
PATCH /transactions/2 {business_date:"2026-08-04"}  → 200  (reversal posted dated 2026-08-03)
DELETE /api/banking/2                                → 204  (3 reversals posted dated 2026-08-03)
DELETE /api/expenses/1                               → 204  (reversal posted dated 2026-08-03)
```
`daily_account_balance` snapshot vs. live `GET /api/day/2026-08-03/report`
afterwards: account 1 closing **₹7,140.00 → ₹5,050.00**, account 2
**−₹7,000.00 → −₹5,000.00** — off by exactly the moved amounts. Reproduced
again in isolation on `2027-01-05` (₹5,080.00 and ₹5,000.00 off) and
`2027-04-01` (cash closing ₹21,008.10 → ₹20,920.10 after moving a transaction
*off* the closed date). This directly contradicts `closing.py`'s own module
docstring ("nothing can write new entries onto a closed date") and
ARCHITECTURE.md §5's "keeps every closed day's printed report permanently
true." Shares its fix with H.29: check `ensure_business_day_open` against the
resource's *current* `business_date` unconditionally at the top of every
correction/deletion handler — transactions, banking, and (spot-check) any
future resource with the same reversal-based correction shape — not only
when the computed new state happens to trigger the existing branches.
*Verify:* on a closed date with a live entry, `DELETE /api/banking/{id}` and
`PATCH /transactions/{id}` moving money *off* that date both return 409;
`daily_account_balance` for a closed date matches `GET /api/day/{date}/report`
exactly after any later correction/deletion attempt targeting a row dated
that day.

**H.31 `create_transaction`'s closed-day check is an unlocked TOCTOU for
unpaid transactions** — `ensure_business_day_open` runs once, early
(`backend/app/transactions.py:207-208`), with no `begin_write` around it; for
`amount_paid_paise = 0` the entire `insert_entry` call — the only place a
second, re-verified check would run — is skipped (:233), and `INSERT INTO
transactions` plus `conn.commit()` follow unprotected (:221-229, :258). An
independent reader polling `(business_days.status, COUNT(transactions))`
every 0.5ms while one thread closed a date and 12 threads fired unpaid
`POST /transactions` against it, staggered across the close window, 8 trials
at a realistic 3-account close: **every trial showed transaction rows
committed after `business_days.status` had already flipped to `'closed'`** —
3 to 11 rows per trial (e.g. 12×201/1×409 with 11 post-close rows; 4×201/9×409
with 3 post-close rows). Paid transactions and every banking write are not
affected — both already re-check inside `insert_entry` or hold `begin_write`
across the window. Fix: wrap the day-open check and the transaction insert in
`begin_write`, the same serialisation `create_banking` already uses for
exactly this reason.
*Verify:* the same concurrent-close-vs-unpaid-create test yields zero
transaction rows whose `created_at` (or DB-commit-order, per the polling
method above) falls after `business_days.status` reads `'closed'` for that
date, across at least 8 trials.

**H.32 `physical_cash_paise` has no bound** — every other money field in the
codebase is `Field(ge=0/ge=_INT64_MIN, le=_INT64_MAX)`;
`backend/app/closing.py:105` is bare `int | None`. Two reproductions:
- `POST /day/{date}/close {physical_cash_paise: -100000, remarks: "neg"}` →
  **201**, and wrote a real `entry_type='adjustment'` ledger row of
  **−₹6,340.01** — a drawer cannot physically hold negative cash, and the day
  is now sealed with no reopen path (Phase 8.7 doesn't exist yet).
- `POST /day/{date}/close {physical_cash_paise: 10**19, remarks: "huge"}` →
  **500 Internal Server Error** (the resulting `variance` overflows int64 on
  insert; the close's own rollback is clean, so a follow-up close of the same
  date succeeded).
*Verify:* `physical_cash_paise: -100000` returns 422, not 201; `10**19`
returns 422, not 500; a genuine non-negative count still closes normally.

Ordered by severity. H.33–H.35 block use.

**H.33 Reports page throws an uncaught `TypeError` and white-screens the
whole app** — `src/pages/Reports.tsx:279-280` (and the CSV builder at
:121-124) do `dayReport!.accounts.map(...)`, guarded only by
`dayLoading || dayError`. react-query has a third state — `data === undefined`
with `isLoading === false` and `error === null`, which a query sits in while
backing off after a failed fetch — that neither guard covers. Reproduced:
open `/reports` (Daily tab), stop the backend — the page goes blank, the
sidebar disappears, and the console shows
`TypeError: Cannot read properties of undefined (reading 'accounts')` at
`Reports.tsx:626`, with no error boundary anywhere in the tree to catch it.
Network log confirms the underlying fetch returned 502. Same gap, not a new
one, as H.8's "silence and zero must be visually distinct" — here it's worse,
silence crashes the page instead of showing a wrong number.
*Verify:* stop the backend and open `/reports` — the Daily tab renders an
explicit error/empty state, never a blank page; no uncaught exception in the
console.

**H.34 An id past SQLite's 64-bit range 500s on every Phase-5/6-reachable
write path** — `accounts._get_or_404` and `customers._get_or_404` lack the
`OverflowError` catch `banking._get_or_404` already has
(`backend/app/banking.py:75-84`). Reproduced across six call sites, all
**500**: `POST /banking {settlement_account_id: 10**19}`,
`POST /transactions {account_id: 10**19}`,
`POST /transactions {customer_id: 10**19}`,
`POST /expenses {account_id: 10**19}`,
`POST /transfers {from_account_id: 10**19}`, and
`GET /banking/commission-summary?account_id=10**19`. `GET /banking/10**19`
itself correctly 404s — the fix pattern already exists in the repo, it's
just not shared to `accounts.py`/`customers.py`. This is app-wide, not new to
this phase, but is now reachable through every Phase 5/6 endpoint that
resolves an account or customer id.
*Verify:* each of the six calls above returns 404, not 500.

**H.35 Closing an untouched future date locks it permanently, with no
confirmation** — `close_day` auto-opens any date with no prior row
(`ensure_business_day_open`) and closes it in the same call, with no bound on
how far in the future `business_date` can be. Reproduced:
`GET /day/2030-06-15` → `{"status":"open","opened_at":null}`;
`POST /day/2030-06-15/close` → **201**, writing 6 `daily_account_balance`
rows for accounts that had never posted a single entry on that date; a
follow-up `POST /transactions {business_date:"2030-06-15"}` → **409, forever**
— there is no reopen path until Phase 8.7. One fat-fingered year in the close
dialog bricks that date.
*Verify:* `POST /day/{date}/close` for a `business_date` after the server's
current date returns 400; closing today's date or an already-open past date
still succeeds.

Ordered by severity. H.36–H.41 show the operator a wrong number.

**H.36 `/api/banking/commission-summary` double-counts reversed commission**
— it filters `l.entry_type = 'commission'` only (`backend/app/banking.py:141`);
PLAN 7.8's `with_reversals_sql` fix was applied to `reports.py`'s
`banking-commission` endpoint but never to this one, so the two disagree.
Reproduced in the browser: created an AEPS entry (₹5,000 principal / ₹50
commission) via the form, then corrected its commission to ₹80. Banking
page's "Total Commission" tile read **₹130.00** (5000-scale confusion aside,
the raw commission figures: 50 + 80); the row itself, `/reports/banking-commission`,
`/reports/profit-loss` and `/api/dashboard` all agreed on the correct net,
**₹80.00 / 8000 paise**. A second case (correction 5000→8000 paise plus a
deleted 2000-paise-commission entry) showed `commission-summary` at
**16000** against a true net of **9000** — a 78% overstatement that a delete
afterward left unchanged while the report correctly moved to 1000.
*Verify:* correct then delete banking commission entries on one account;
`GET /banking/commission-summary` and `GET /reports/banking-commission` for
the same account/period return identical totals, both matching the direct
ledger net.

**H.37 Daily Closing's "Total Income" / "Net Profit" tiles are
`received_paise`, which bundles in opening balances and customer
settlements** — `src/pages/DailyClosing.tsx:57-58` label
`report.totals.received_paise` as "Total Income" and `received − paid` as
"Net Profit"; `backend/app/closing.py:25` buckets `opening_balance` *and*
`customer_payment` into `received_paise`, both of which
`ledger.income_expenses` (the definition every other income figure in the
app uses) deliberately excludes. Reproduced on the 5 Aug 2026 closing report:
tiles read **"Total Income ₹15,30,129.99" / "Net Profit ₹15,30,129.99"**
against a true `income_expenses` figure for that date of **₹80.00** — the
difference is ₹15,29,999.99 of same-day account opening balances. The PRD
§6 reconciliation arithmetic itself is correct (opening + received − paid +
transfer_in − transfer_out + adjustment = closing, verified exactly); only
the *label* on `received_paise` is wrong.
*Verify:* on a date with an account opened (an `opening_balance` entry) or a
customer settlement, the closing report's income/profit tiles either use
`ledger.income_expenses`'s figure (matching the dashboard) or are relabeled
to reflect what `received_paise` actually is — pick one and confirm the tile
no longer reads as unbilled income.

**H.38 `cash_variance_paise` folds unrelated reversal rows into the
physical-count variance** — `_BREAKDOWN_SQL`'s `adjustment_paise` bucket is
`entry_type IN ('adjustment','reversal')` (`backend/app/closing.py:29`), and
`cash_variance_paise` is read straight from it (:90), even though the
variance-entry insert already tags itself distinctly
(`source_type="closing"`, :127-131). Reproduced: physical count of ₹10,000
against a system balance of ₹10,241.00 (a genuine −₹241.00 shortfall);
after locking, the closing report and the sealed `daily_account_balance` row
both read **Cash Variance −₹5,291.00** — composed of the real −₹24100 plus
−₹500000 and −₹5000 from an unrelated banking correction's reversal rows
posted the same day. A ₹5,050.00 phantom till discrepancy gets sealed into
the permanent record.
*Verify:* on a date with both a genuine physical-count variance and an
unrelated correction/deletion (which posts `entry_type='reversal'` rows),
`cash_variance_paise` equals only the counted variance.

**H.39 Dashboard "Cash in Hand" sums the entire ledger with no date bound,
disagreeing with Daily Closing and Reports for the same account** —
`backend/app/dashboard.py:25-31` has no `business_date` filter at all, unlike
`ledger.closing_balance` (`business_date <= D`) which Daily Closing and
Reports both use. Reproduced: Dashboard read "Cash in Hand ₹25,858.10" while
DailyClosing/Reports read "Closing Cash Balance ₹10,000.00" for the same
account, same moment. Cause is reachable through the public API with no
bound check — `POST /transactions {business_date: "9999-12-31", ...}`
returned **201** and moved `cash_in_hand_paise` on the *2027-03-01* dashboard
from ₹20,931.10 to **₹37,931.10** (+₹17,000.00); `business_date: "0001-01-01"`
was accepted too.
*Verify:* dashboard's `cash_in_hand_paise`/`total_bank_balance_paise` for
date D match `ledger.closing_balance` summed over cash/non-cash accounts as
of D; a ledger entry dated after D no longer moves D's dashboard figures.

**H.40 Reports "Daily Report" Cash Summary (and its CSV export) don't add
up** — `src/pages/Reports.tsx:262-265` and the CSV builder at :121-124 render
only opening/received/paid/closing, dropping `transfer_in`, `transfer_out`
and `adjustment` from the same `cashRow` object that already carries them.
Reproduced: **"Opening ₹5,161.00 + Received ₹130.00 − Paid ₹0.00 ="** shown
next to **"Closing ₹10,000.00"** — 5,161 + 130 = 5,291, not 10,000; the
missing ₹4,709 was a transfer that never appears on the card. PLAN 7.7's
*Verify* ("exported CSV totals match the on-screen totals") technically
passes — both surfaces are wrong the same way.
*Verify:* on a date with a transfer or adjustment entry, the Cash Summary
card's displayed rows sum to its own displayed closing figure, on screen and
in the exported CSV.

**H.41 Dashboard panels show "no data" instead of an error state when the
API is offline — the H.8 gap recurring on the new panels** — the eight stat
tiles are correctly gated behind `statsReady` and vanish, but "Today's
Transactions" and "Service Breakdown" fall through to their empty-result
copy regardless of *why* the query has no data. Reproduced: backend stopped,
`/dashboard` open — the two panels persistently read **"No transactions yet
today."** and **"No services rendered today."** (network log:
`GET /transactions?... → 502`) while the header correctly shows "API
Offline" — an operator glancing at just the panel sees a quiet day, not a
broken one.
*Verify:* stop the backend and load `/dashboard` — both panels show an
explicit error/offline state, never their empty-result copy.

Ordered by severity. H.42 is a rejected-input gap.

**H.42 `/api/reports/monthly` accepts nonsense years** — `year` has no
bound while `month` does (`backend/app/reports.py:21-25`). Reproduced, all
**200**: `year=0` → `start_date: "0000-02-01"`; `year=-5` →
`"-005-02-01"`; `year=99999` → `"99999-02-01"`; `year=10**19` →
`"10000000000000000000-02-01"` — none are valid ISO dates, and all four flow
straight into the CSV export.
*Verify:* `year=0`, `year=-5`, `year=99999` and `year=10**19` each return
400; `year=2026` still returns 200.

**H.43 Regression tests for the above** — extend
`backend/tests/test_edge_cases.py` in the existing plain-`assert` style
(`ARCHITECTURE.md` §8) to cover H.29–H.32, H.34, H.35, H.36, H.39 and H.42,
reusing the file's threadpool helper for H.31's race. H.33, H.37, H.38 and
H.40–H.41 are frontend-only and cannot be covered there: H.37/H.38 are a
label/bucket-math fix best asserted against `closing.py`'s own
`_day_breakdown` output in a backend test where possible, falling back to a
browser walk for the rest — walk each of H.33, H.40 and H.41's *Verify*
lines in the browser once their fixes land.
*Verify:* the file fails against today's code on every one of H.29–H.32,
H.34–H.36, H.39 and H.42, and passes after they land.

**Not scheduled, recorded deliberately.** Several behaviours were observed
but are policy calls or too marginal to schedule:
- Non-money `PATCH` fields (`remarks`, `customer_id`, `service_id`, `note`)
  on banking/transaction/expense rows still return 200 after their date is
  closed, while money-changing fields correctly 409. Whether audit-trail
  metadata should also freeze on a closed day is a call for Phase 8.3's audit
  log design, not this pass.
- Pydantic's default lax coercion accepts numeric strings and booleans for
  every `*_paise` field app-wide (`"1000"` → `1000`, `true` → `1`), not just
  in this phase's endpoints. Harmless while the frontend only ever sends
  numbers; revisit with `strict=True` if an API consumer outside the frontend
  is ever added.
- `_primary_cash_account_id` (`backend/app/closing.py:94-101`) returns `None`
  silently when no `account_type='cash'` account exists, and `close_day`
  then skips the physical-variance step entirely with no error. Never
  exercised — the seed data always has one cash account.
- `list_banking`/`list_ledger`-style endpoints clamp an out-of-range `limit`
  up to the 500 cap rather than down to the 50 default (so `limit=-1`
  returns 500 rows) — this is H.6's existing, deliberate behavior recurring
  in the new endpoints, not a new decision.
- A deactivated account ("Dead Wallet", `is_active=0`) was observed still
  listed in the closing report's per-account breakdown; didn't confirm
  whether its `DELETE` had actually failed or the report's account filter is
  deliberately `deleted_at`-only. Flagged for a follow-up look, not a finding.
- Profit & Loss renders a "₹0.00" row for a fully-reversed expense category
  rather than omitting it — cosmetic, unconfirmed as intentional.
- Banking's delete confirmation is a native `window.confirm`
  (`src/pages/Banking.tsx:213`), which blocks Chrome DevTools Protocol and
  therefore any future Playwright/E2E coverage of that path. Not a product
  defect; worth swapping to the app's own dialog component if one exists by
  the time E2E tooling is added (ARCHITECTURE.md §8).

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

## Phase 8.8 — Hardening auth, audit & backup

Audited the shipped Phase 8 surface (`backend/app/auth.py`, `audit.py`,
`backup.py`, and `closing.py`'s new `/reopen` endpoint, plus `src/lib/auth.tsx`,
`Login.tsx`, `AuditLog.tsx`, and `DailyClosing.tsx`'s `ReopenControl`) against
a scratch DB on port 8100, ~70 probes: login (malformed/missing/case/SQLi-
shaped credentials, bad/garbage/empty bearer tokens, double logout, 12
parallel logins), the audit log's filters (negative/huge limit and offset,
malformed dates, unknown table/action, non-numeric `user_id`), backup
creation and restore (path traversal, unconfirmed restore, non-existent/non-
SQLite files, 12–15 parallel creates, 6 parallel restores of the same file),
and the day-reopen override (non-admin 403, reopening an already-open day,
five reopen→close cycles), plus a browser pass logging in, viewing the Audit
Log page, and confirming a full page reload correctly returns to Login (the
intended behavior per ARCHITECTURE.md §9, not a defect). Auth enforcement,
role checks, and the audit log's filters held completely clean against every
malformed and boundary input thrown at them — every defect found is in
backup/restore and the reopen-then-close cycle, both of which Phase 8
introduced specifically to make the system more trustworthy under a mistake,
and both currently make it less so.

Ordered by severity. H.44 silently corrupts a sealed record; H.45–H.46 block
use of the backup/restore safety net Phase 8.5/8.6 exist to provide.

**H.44 Reopening and re-closing a business day accumulates duplicate
`daily_account_balance` snapshot rows instead of replacing the sealed one**
— `close_day` (`backend/app/closing.py:168-178`) always `INSERT`s a fresh
snapshot row per account with no corresponding `DELETE`, and `reopen_day`
(`:199-231`) never touches the table either. ARCHITECTURE.md §4.8 calls this
table a "write-once snapshot... the sealed record of what the derived numbers
were at close" — reopening breaks that by construction. Reproduced: closed
`2026-08-04`, then drove 5 reopen→close cycles through the API;
`daily_account_balance` for `business_date = '2026-08-04'` held **10 rows**
(5 closes × 2 accounts) afterward, each with a different `remarks` and no way
to tell which is "the" sealed record short of picking the highest `id`.
Nothing currently reads this table for display (Daily Closing's report is a
live ledger derivation, per `closing.py`'s own module docstring), so it's
invisible today — but it is exactly the landmine this pass watches for: any
future feature that reads `daily_account_balance` directly (an audit export,
a "what did we seal on day X" screen) will silently return stale or
ambiguous data.
*Verify:* close a date, reopen it via `POST /day/{date}/reopen`, close it
again — `daily_account_balance` holds exactly one row per active account for
that `business_date`, not two.

**H.45 Restoring the oldest kept backup always fails, and it's the normal
steady state, not an edge case** — `restore_endpoint`
(`backend/app/backup.py:96-100`) calls `create_backup()` first as a safety
copy of the current DB, and `create_backup`'s retention sweep (`:35-38`)
evicts the single oldest file whenever the count exceeds
`backup_retention_count` (default 5), with no exclusion for the file the
caller is about to restore. Since `on_shutdown` in `main.py:54-64` takes a
backup on every app close, a real install reaches the retention cap after its
fifth close and stays there — the oldest of the 5 kept backups is
permanently one safety-copy away from eviction. Reproduced deterministically,
no concurrency involved: with exactly 5 backups on disk, `POST /backup/restore
{filename: <oldest>, confirm: true}` — the safety-copy step pushes the count
to 6, retention deletes the oldest (the requested file), and `restore_backup`
then 404s on a file `GET /backup` had listed seconds earlier. Restoring any
of the other 4 backups works correctly (account state reverted exactly,
matching `test_backup.py`'s existing assertion). Fix in one place:
`create_backup` needs an optional `keep: str | None` parameter excluding a
named file from its own retention sweep, and `restore_endpoint` passes
`body.filename`.
*Verify:* with backup count at the retention cap, `POST /backup/restore` on
the oldest listed backup returns 204 and reproduces its balances exactly, not
404.

**H.46 Concurrent backup creation corrupts itself — a burst of "Backup Now"
clicks 500s more often than it succeeds** — `create_backup`'s retention sweep
(`backend/app/backup.py:35-38`) computes "which files are stale" from a bare
`glob()` with no locking, so one request's sweep can delete a file that a
concurrent request created but hasn't yet returned in its own response.
Reproduced: 12 parallel `POST /backup` → **4 of 12 failed with 500**; a
second run at 15 parallel → **9 of 15 failed with 500**. Two distinct
tracebacks from the same race: `FileNotFoundError` in
`create_backup_endpoint`'s `path.stat()` (the file it just created was
deleted by a concurrent request's retention sweep before this request read
it back), and `PermissionError: [WinError 32]` from two threads' `unlink()`
racing on the same stale file (Windows-specific — a second `unlink()` on a
handle still settling from the first fails instead of no-op'ing). No database
corruption resulted (`PRAGMA integrity_check` clean after every run) and no
client-facing detail leaked (`debug=False` returns the generic "Internal
Server Error" body) — this is an availability defect, not a data one, but a
half-succeeded burst leaves the operator staring at repeated failures on a
feature whose entire purpose is not to fail when it's needed. Shares its fix
location with H.45: wrap `create_backup`'s VACUUM INTO + retention block in a
single module-level lock (`ponytail: global lock — single-operator offline
app; per-request queueing only if throughput ever matters`), which also stops
H.45's failure mode from compounding into eviction of more than one file when
several restores race (6 parallel restores of the same non-oldest backup, run
as a follow-up probe, produced 404 on all 6 — their own safety copies raced
each other through the same unlocked sweep).
*Verify:* 12 parallel `POST /backup` all return 201, each with a distinct
filename, and the retention count afterward is exactly `min(12, retention)`.

**H.47 Regression tests for the above** — extend
`backend/tests/test_edge_cases.py` in the existing plain-`assert` style
(`ARCHITECTURE.md` §8) with three cases: H.44's reopen→close cycle asserting
`daily_account_balance` row count stays at one-per-account; H.45's
deterministic restore-of-the-oldest-at-cap reproduction (no threading
needed); and H.46's 12-parallel-`POST /backup` count, reusing the file's
existing threadpool helper for the parallel case.
*Verify:* the file fails against today's code on H.44, H.45 and H.46, and
passes after they land.

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

**A safety feature that touches the filesystem needs the same concurrency
discipline as one that touches the ledger (H.45/H.46).** Backup/restore was
built assuming "the app closes once and backs up once" — reasonable for
Phase 8.5's own *Verify* line, wrong once Phase 8.6's restore flow reuses the
same retention sweep as an internal step. The sweep races with itself both
under concurrent requests (H.46) and, deterministically, whenever restore's
own safety copy pushes a steady-state backup count over the retention cap
(H.45) — the second case needed no threading at all to reproduce. Any future
code that both writes new files and prunes old ones on the same path needs
either a lock around the whole read-prune-write sequence or an explicit
exclusion for files another in-flight step still needs, not just a *Verify*
line that only exercises the write.

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

**`begin_write` is opt-in per write path, not automatic (H.21, H.23).** H.11
added the helper and fixed every guarded write path that existed at the
time; Phase 4 then added two new ones (`add_category`, `delete_expense`)
that read-then-write without it, and both broke the same way H.11 already
catalogued. There is no lint or test that catches "this new endpoint needs
`begin_write`" short of a parallel probe in its *Verify* line — the same
conclusion H.11's risk note already reached, restated because it recurred
on the very next phase.

**A guard checked "when X changed" is not the same as a guard (H.29–H.31).**
`ensure_business_day_open` exists as one shared function precisely so the
closed-day rule only has to be right once, but every call site still decides
*whether* to call it from derived state — `if date_changed`, `if live_entry
is not None`, whether `insert_entry` happens to run at all for this request.
A pending transaction has no live entry, a delete path forgot the call
entirely, and an unpaid create's one check runs unlocked before an
unconditional commit. Three different call sites, three different reasons
the same shared guard didn't fire — the lesson from `begin_write` above
applies just as much to `ensure_business_day_open`: a helper that exists
doesn't help unless every write path that can reach the ledger calls it
unconditionally, not just the paths exercised by that phase's own sequential
tests.
