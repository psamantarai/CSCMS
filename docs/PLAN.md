# CSCMS — Implementation Plan

12 phases, 76 steps. Phases run in order; each depends on the one before.
(Phase 2.5 was inserted after an edge-case audit of the shipped Phase 0–2
code — see that phase for what it found and why it blocks Phase 3.)

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
