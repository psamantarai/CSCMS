# Wiki Index — CSCMS

The project knowledge base. Same schema as the agentic-swe-kit wiki: concept pages in `concepts/`,
each with frontmatter and ≥2 `[[wikilinks]]`. The L3 RESEARCH loop writes here; G0 reads here first.

> **Read this file before any milestone (G0 step 1).** Pick candidate pages by name-matching the
> milestone's nouns, then drill in. The wiki is what prevents rebuilding work that already exists.

## Entities (the things this system has)
<!-- - [[concepts/<Entity>]] — one-line summary -->

## Concepts (how it works)
<!-- - [[concepts/<Concept>]] — one-line summary -->

## Sources (research distilled by L3)
<!-- - [[concepts/<source-slug>]] — one-line summary | filed <date> -->

## Seeded from agentic-swe-kit
Vendored at `.genesis/vendor/agentic-swe-kit/wiki/` (paths below are repo-relative). CSCMS has no
LLM/agent/RAG/distributed components, so `llmops-ai-agents` and most of `distributed-systems` are
not pulled in — only the phases this project actually touches:

- `.genesis/vendor/agentic-swe-kit/wiki/designing-data-intensive-applications/Transactions-and-Isolation.md`
  — read before touching any check-then-write on ledger state (overdraft guard, single-reversal
  guard); this is the concept behind the `checked_write_isolation` invariant and PLAN.md H.1/H.11.
- `.genesis/vendor/agentic-swe-kit/wiki/clean-architecture/concepts/Boundary-Lines.md`
  — the shape of the Phase 9.5 rule: presentation swap must not cross into `lib/api.ts`/`lib/queries.ts`.
- `.genesis/vendor/agentic-swe-kit/wiki/clean-architecture/concepts/Database-as-Detail-The-database-is-a-low-level-mechanism-like-a-doorknob-that-do.md`
  — matches ARCHITECTURE.md's own "database is a detail" stance (SQLite chosen, ledger is the invariant).
- `.genesis/vendor/agentic-swe-kit/wiki/security-engineering/concepts/Financial-Security-Controls.md`
  — Phase 8 (auth/audit/backup) and any future money-path change.
- `.genesis/vendor/agentic-swe-kit/wiki/security-engineering/concepts/Access-Control.md`
  — the existing single-user auth (Phase 8.8 hardening).
- `.genesis/vendor/agentic-swe-kit/wiki/release-it/concepts/Fail-Fast.md`
  — Phase 10.2 backend process lifecycle (spawn/terminate the FastAPI child process cleanly).
