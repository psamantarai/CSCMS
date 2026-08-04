# RSCMS — Implementation Plan

11 phases, 66 steps. Phases run in order; each depends on the one before.

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

**9.3 App data paths** — DB and backups in `%APPDATA%\RSCMS`; migrations run on
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

**The existing UI is a mock, not a partial implementation.** Its forms don't
submit and its numbers come from `mockData.ts`. Steps that say "wiring" are
paired with a separate form step for exactly this reason — the screens are the
easy half.

**Step count is not effort.** 3.8, 6.6 and 9.2 are each worth several of the
smaller steps.
