-- 005_transaction_outlay.sql — PLAN 16.5.1: money the operator lays out on
-- the customer's behalf (insurance premium, govt form fee) before recovering
-- it. Additive only, no table rebuild — see PLAN.md Phase 16.5 for why.

ALTER TABLE services     ADD COLUMN has_outlay        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN outlay_paise      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN outlay_account_id INTEGER REFERENCES accounts(id);
