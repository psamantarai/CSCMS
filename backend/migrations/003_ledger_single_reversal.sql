-- 003_ledger_single_reversal.sql — H.11: begin_write serializes the
-- read-check-write reversal guard at the app level; this is the DB-level
-- backstop, same belt-and-braces reasoning as 002's immutability triggers.
-- NULLs are distinct under SQLite UNIQUE, so ordinary (non-reversal) rows
-- with reverses_id IS NULL are unaffected.

CREATE UNIQUE INDEX idx_ledger_single_reversal ON ledger(reverses_id) WHERE reverses_id IS NOT NULL;
