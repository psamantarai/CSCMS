-- 002_ledger_immutable.sql — enforce ledger append-only-ness at the DB level
-- (ARCHITECTURE.md §2): no UPDATE, no DELETE. A correction is a new row with
-- reverses_id pointing at the original.

CREATE TRIGGER ledger_no_update
BEFORE UPDATE ON ledger
BEGIN
  SELECT RAISE(ABORT, 'ledger rows are immutable; insert a reversal instead');
END;

CREATE TRIGGER ledger_no_delete
BEFORE DELETE ON ledger
BEGIN
  SELECT RAISE(ABORT, 'ledger rows are immutable; insert a reversal instead');
END;
