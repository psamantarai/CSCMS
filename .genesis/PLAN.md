# PLAN — CSCMS

The machine-parseable implementation plan. Mirrors the milestone table in `DONE.html` (DONE.html is the
human/visual view; this is the one loops read). Sliced so each milestone ships in one L1 BUILD pass.

> Slicing rule: a milestone must have (a) a single clear outcome, (b) an exact **demo command** that
> proves it, and (c) a freeze boundary of files it may touch. If you can't write the demo command,
> the milestone is too vague — split it.

---

## Brainstorm (G0.5 — fill before slicing milestones)

> Three fundamentally different approaches to the cognitive job. Pick one. Record the rationale.
> This is the cheapest design decision — you haven't written a line of code yet.

CSCMS already has a detailed, user-approved plan (`docs/PLAN.md`, `docs/ARCHITECTURE.md`). The
cognitive job here isn't "design CSCMS" — it's "how should genesis's milestone slicing relate to
the plan that already exists." That's the real 3-way fork.

### Approach A — Mirror docs/PLAN.md verbatim (chosen)
Reuse the existing phase/step breakdown (9.5.15 → 9.5.16 → Phase 10 → Phase 11) as genesis
milestones one-for-one, deriving each demo command from the step's own `Verify:` line.
- Strengths: no re-litigating decisions already made with the user; one source of truth instead of
  two plans that can drift apart.
- Weaknesses: PLAN.md's step grain doesn't match "one L1 BUILD pass" evenly — 9.5.16 (a sweep) is
  much smaller than 10.6 (a full clean-machine acceptance test).

### Approach B — Re-slice from scratch via G0/G5
Run genesis's own milestone-slicing ritual fresh, independent of PLAN.md.
- Strengths: milestones sized precisely for the loop's token/iteration defaults.
- Weaknesses: produces a second, competing plan for the same work; risks silently contradicting
  decisions already recorded in PLAN.md/ARCHITECTURE.md (the ledger invariant, the Phase 9.5
  presentation-only boundary).

### Approach C — Hybrid: PLAN.md phases as milestones, steps as an internal checklist
Group at phase granularity (e.g. all of "Phase 10 Electron packaging" is one milestone), with its
numbered sub-steps as a checklist inside it rather than separate genesis milestones.
- Strengths: fewer, better loop-sized milestones.
- Weaknesses: loses per-step `Verify:` granularity; L4 VERIFY would have to check six sub-verifies
  at once, weakening the maker/checker split's precision.

### Chosen: Approach A — Mirror docs/PLAN.md verbatim. The user confirmed this directly when genesis
was set up: reuse the existing plan rather than re-slice it. PLAN.md's per-step `Verify:` lines
already satisfy genesis's demo-command requirement, at a finer and more auditable grain than a
phase-level rollup would give.

---

## Milestones

Sourced 1:1 from `docs/PLAN.md`. Phase 11 (Deferred) is deliberately **not** sliced here — it has
no demo command yet by design ("pull forward on request"); slicing it now would be inventing a
milestone the plan explicitly says not to invent yet.

### M1 — 9.5.15 Dark mode
- **Outcome:** a `next-themes`-free dark mode toggle (`useState` + `localStorage` +
  `classList.toggle("dark")` on `<html>`) in the sidebar footer.
- **Phase (swe-master):** Phase 2 Frontend Engineering (closest analog — no AI/streaming concerns apply)
- **Files / freeze boundary:** `src/**` (presentation only — not `lib/api.ts`, `lib/queries.ts`, `lib/format.ts`, or any mutation body, per the `phase_9.5_presentation_only` invariant)
- **Demo command:** `npx tsc --noEmit && pnpm build`
- **Success criteria:** automated — typecheck/build clean. Manual — toggling switches all 12 pages, both modals, and the sidebar; the choice survives a reload; no element is unreadable in either mode, checked page by page (docs/PLAN.md 9.5.15 Verify).
- **Loops:** L1, L4
- **Skills:** ponytail (always on) + shadcn + frontend-design
- **Token budget:** 50000

### M2 — 9.5.16 Sweep
- **Outcome:** migration cleanup — dead `index.css` rules, `colorMap`-era constants, leftover `inputStyle`/`labelStyle`/`cardStyle` locals (e.g. `Reports.tsx:35-37`), unused imports; confirm no page still hardcodes a color.
- **Phase:** Phase 2 Frontend Engineering
- **Files:** `src/**`
- **Demo command:** `npx tsc --noEmit && pnpm build && grep -rc "style={{" src --include=*.tsx`
- **Success criteria:** the `style={{` count matches only the deliberate survivors (print-report layout) and is recorded in `docs/progress-tracker.html`; typecheck/build clean; full click-through of all 12 pages with no console errors (docs/PLAN.md 9.5.16 Verify).
- **Loops:** L1, L4
- **Skills:** ponytail (always on) + shadcn + vercel-react-best-practices
- **Token budget:** 50000

### M3 — 9.6 Table sorting
- **Outcome:** click-to-sort headers (shared `SortableTableHead` helper, no new dependency) on every data table app-wide.
- **Phase (swe-master):** Phase 2 Frontend Engineering
- **Files / freeze boundary:** `src/**` (presentation only, per `phase_9.5_presentation_only` invariant — sorts already-fetched data, no API change)
- **Demo command:** `npx tsc --noEmit && pnpm build`
- **Success criteria:** clicking a header cycles asc → desc → unsorted with a correct indicator, on Accounts, Transactions, Ledger, Banking, Expenses, Services, Customers, AuditLog, Reports, and Dashboard's recent-transactions table (docs/PLAN.md 9.6 Verify).
- **Loops:** L1, L4
- **Skills:** ponytail (always on) + shadcn
- **Token budget:** 50000

### M4 — 9.7 Quick Actions modal rework
- **Outcome:** the three Dashboard quick-action Dialogs collapse into one modal with `Tabs`; forms go single-column; `DialogContent` overflow/overlap bug fixed (`max-h-[85vh] overflow-y-auto`).
- **Phase (swe-master):** Phase 2 Frontend Engineering
- **Files / freeze boundary:** `src/**` (Dashboard.tsx, the three form components, dialog.tsx — presentation only)
- **Demo command:** `npx tsc --noEmit && pnpm build`
- **Success criteria:** each quick action opens the correct tab; tab switch preserves in-progress form state; Close Business Day still navigates unchanged; no horizontal overflow, tall forms scroll inside the dialog (docs/PLAN.md 9.7 Verify).
- **Loops:** L1, L4
- **Skills:** ponytail (always on) + shadcn + frontend-design
- **Token budget:** 50000

### M5 — 9.8 First-run onboarding (account creation + setup wizard)
- **Outcome:** `POST /api/auth/bootstrap` creates the first admin account (only when zero users exist); `/setup` route walks Create Admin Account → Shop Setup (name, accounts, opening balances) before the normal login gate. Pulled forward from 10.5 so it ships web-only, ahead of Electron packaging.
- **Phase (swe-master):** Phase 2 Frontend Engineering + Phase 1 Backend/API Design
- **Files:** `backend/app/auth.py` (new `/bootstrap` endpoint), `src/**` (new `/setup` route + wizard, `App.tsx` routing gate)
- **Demo command:** fresh DB → open app, no terminal used
- **Success criteria:** a fresh DB (no users, no accounts) boots straight to `/setup`, not Login; finishing both steps reaches the Dashboard with the created account and balances visible; relaunching goes straight to Login (docs/PLAN.md 9.8 Verify).
- **Loops:** L1, L4
- **Skills:** ponytail (always on) + shadcn + frontend-design
- **Token budget:** 50000

### M5.5 — 9.9 Session persistence across reload (httpOnly cookie auth)
- **Outcome:** move the session token off the JS-held bearer/`Authorization` header
  onto an httpOnly, `SameSite=Strict` cookie the backend sets on login and reads on
  every request; the frontend restores `user` on mount via `GET /auth/me` instead of
  starting logged-out. Reload keeps the user signed in, and the token becomes
  unreadable to any JS (stronger than today's in-memory approach, not weaker).
  Reported by the user as "refresh logs me out"; investigated and confirmed
  intentional-but-improvable (`ARCHITECTURE.md` §9, Phase 8.8 audit) before slicing
  this milestone — not a silent architecture change.
- **Phase (swe-master):** Phase 1 Backend/API Design (trust boundary — auth mechanism) + Phase 2 Frontend Engineering
- **Files / freeze boundary:** `backend/app/auth.py` (login/logout/`get_current_user`), `src/lib/api.ts` (drop `authToken`/`setAuthToken`, add `credentials: "include"`), `src/lib/auth.tsx` (`AuthProvider` mount restore via `/auth/me`)
- **Demo command:** log in, refresh the page → still authenticated; `npx tsc --noEmit && pnpm build`
- **Success criteria:** login sets the cookie with no token in the JSON body; a valid session cookie authenticates with no `Authorization` header; logout clears the cookie and it's rejected afterward; refresh on any authenticated page stays logged in; no session cookie still lands on Login; `document.cookie` never contains the token (docs/PLAN.md 9.9 Verify).
- **Loops:** L1, L4
- **Skills:** ponytail (always on) — trust-boundary change, no unrequested scope beyond the two files above
- **Token budget:** 50000

### M6 — 10.1 Electron shell
- **Outcome:** Electron shell loads the built frontend — single window, app menu.
- **Phase:** Phase 13 Infrastructure & Deployment
- **Files:** new `electron/` entry point, `package.json`
- **Demo command:** `npm run electron`
- **Success criteria:** opens the built app (docs/PLAN.md 10.1 Verify).
- **Loops:** L1, L4
- **Skills:** ponytail (always on)
- **Token budget:** 50000

### M7 — 10.2 Backend bundling & lifecycle
- **Outcome:** PyInstaller build of the FastAPI backend, spawned as a child process on a fixed loopback port, terminated on quit.
- **Phase:** Phase 13 Infrastructure & Deployment
- **Files:** `backend/**` (packaging only, per `Fail-Fast` wiki pointer — no ledger/API behavior change), `electron/**`
- **Demo command:** launch app, quit, then `tasklist | findstr python` (Windows) — must return nothing
- **Success criteria:** no orphaned Python process remains after closing the app (docs/PLAN.md 10.2 Verify).
- **Loops:** L1, L4
- **Skills:** ponytail (always on)
- **Token budget:** 50000

### M8 — 10.3 App data paths
- **Outcome:** DB and backups live in `%APPDATA%\CSCMS`; migrations run on version upgrade.
- **Phase:** Phase 13 Infrastructure & Deployment
- **Files:** `backend/**` (paths/migration runner only)
- **Demo command:** install a newer build over an older one; inspect `%APPDATA%\CSCMS` before/after
- **Success criteria:** migrates the existing DB without data loss (docs/PLAN.md 10.3 Verify).
- **Loops:** L1, L4
- **Skills:** ponytail (always on)
- **Token budget:** 50000

### M9 — 10.4 Windows installer
- **Outcome:** electron-builder installer with icon and shortcuts.
- **Phase:** Phase 13 Infrastructure & Deployment
- **Files:** `electron/**`, `package.json`, installer config
- **Demo command:** run the built installer on a clean VM/machine
- **Success criteria:** installer completes on a clean machine (docs/PLAN.md 10.4 Verify).
- **Loops:** L1, L4
- **Skills:** ponytail (always on)
- **Token budget:** 50000

### M10 — 10.6 Clean-machine acceptance test
- **Outcome:** full PRD §12 pass on a machine with no Python and no Node.
- **Phase:** Phase 13 Infrastructure & Deployment (final gate before Phase 11)
- **Files:** none (test-only milestone; failures route back to whichever M6–M9 milestone owns the gap)
- **Demo command:** install on a clean machine, disable networking, create and survive a full restart with a transaction
- **Success criteria:** installs with no Python/Node present, works with network disabled, a transaction survives a full restart (docs/PLAN.md 10.6 Verify).
- **Loops:** L1, L4
- **Skills:** ponytail (always on) + edge-case-audit
- **Token budget:** 50000

> 10.5 (First-run setup wizard) is not a separate milestone here — it's
> absorbed into M5 (9.8), which ships the same wizard earlier. See
> docs/PLAN.md 10.5's "Superseded" note.

---

## Progress (loops append here on milestone completion — newest last)

- **2026-08-08 · M1 (9.5.15 Dark mode) — DONE.** G0 verdict UNBUILT (no existing toggle; `.dark`
  tokens already in `index.css` from shadcn init). Theme state added to `App.tsx` (useState +
  localStorage + classList.toggle on `<html>`), Sun/Moon toggle in sidebar footer. Demo command
  passed (`tsc --noEmit`, `vite build`, pnpm not on PATH in this shell so used the equivalent
  `npx vite build`). L4 VERIFY (fresh-context checker): APPROVE. Manual live-browser check via
  Chrome automation: all 12 pages + 2 Dashboard modals dark-themed and readable, choice survives
  reload. Quiz-me gate: closed after a `/clear` interrupted the original session — re-quizzed next
  session, user accepted the milestone as-is. Full log: `checkpoints/M1.md`.
- **2026-08-08 · M2 (9.5.16 Sweep) — DONE.** G0 verdict PARTIAL — the prior 9.5.10-9.5.14 shadcn
  rebuild commits had already eliminated the `inputStyle`/`labelStyle`/`cardStyle` locals and dead
  CSS the plan described; the sole remaining `colorMap` (StatCard.tsx) turned out to be live,
  dark-mode-safe code, not a migration relic. Scope narrowed to the one real orphan a one-off
  `tsc --noUnusedLocals` sweep found: unused `TableRowState` import in `Customers.tsx`, removed.
  Demo command passed (`tsc --noEmit`, `vite build`, `style={{` count = 2, both CSS custom
  properties not colors). L4 VERIFY (fresh-context checker, independently re-derived every G0
  claim): APPROVE. Manual live-browser click-through of all 12 pages: zero console errors. Quiz-me
  gate: APPROVE (3/3). Full log: `checkpoints/M2.md`.
- **2026-08-08 · M3 (9.6 Table sorting) — DONE.** G0 verdict UNBUILT (no existing sort UI anywhere;
  one unrelated data-prep `.sort()` in `Dashboard.tsx` doesn't count). New shared
  `src/components/SortableTableHead.tsx` (`useSort` hook + `SortableTableHead` wrapper around
  `ui/table.tsx`'s `TableHead`, lucide `ArrowUp`/`ArrowDown`, asc→desc→unsorted cycle, no new
  dependency) wired into all 10 milestone pages (13 `<Table>` instances total, including Customers'
  two history tables and Reports' three tables). Status/badge workflow columns left non-sortable per
  spec's carve-out; categorical Badge columns (Type/Action/Category) made sortable by label text.
  Demo command passed (`tsc --noEmit`, `vite build` clean). L4 VERIFY (fresh-context checker,
  independently re-ran build/typecheck, grepped `backend/` and `package.json` itself): APPROVE.
  Manual live-browser verify: real 3-click asc→desc→unsorted cycles confirmed correct on
  Transactions/Ledger/Banking/Expenses/Services/AuditLog/Reports with live data reordering; mechanical
  cycle + correct header wiring confirmed on Accounts/Customers/Dashboard where seeded data was too
  sparse to show reordering. Zero console errors across all 10 pages. Quiz-me gate: APPROVE (3/3).
  Full log: `checkpoints/M3.md`.
- **2026-08-08 · M4 (9.7 Quick Actions modal rework) — DONE.** G0 verdict PARTIAL (three quick-action
  forms/Dialogs already existed; this milestone unified them). `Dashboard.tsx`'s three separate Dialogs
  collapsed into one controlled `Dialog` + `Tabs` (`activeTab`/`modalOpen` state, `TabsContent
  keepMounted` per panel so an in-progress form survives a tab switch); `DialogContent` base class
  gained `max-h-[85vh] overflow-y-auto`; `TransactionForm`/`BankingEntryForm`/`ExpenseForm` grids
  changed to `grid-cols-1`. L4 VERIFY round 1: REJECT — independent checker caught a real bug, the
  pre-existing `rs-grid` class left on these forms still forced 2 columns via an `!important` media
  query between 600-900px viewport width, beating the new `grid-cols-1` utility. Fixed by dropping
  `rs-grid` from the three forms (kept in `index.css` for its other, legitimate uses elsewhere). L4
  VERIFY round 2: APPROVE. Demo command passed both times (`tsc --noEmit`, `vite build` clean). Manual
  live-browser verify: modal opens on the matching tab for all three quick actions; tab-switch state
  preservation confirmed via a real typed value surviving a switch away and back; modal fully resets on
  close/reopen; `DialogContent` measured at exactly 85vh with genuine internal scroll (no horizontal
  overflow) on the tallest form; Close Business Day still navigates to `/closing`; zero console errors.
  Quiz-me gate: APPROVE (3/3). Full log: `checkpoints/M4.md`.
