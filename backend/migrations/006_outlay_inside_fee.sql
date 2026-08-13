-- 006_outlay_inside_fee.sql — PLAN 16.5 revision: the outlay is no longer
-- added on top of the fee. `fee_paise` now means the whole amount charged to
-- the customer, with the operator's outlay contained inside it — the banking
-- model, where an AEPS principal moves between the operator's own accounts
-- and inflates nothing.
--
-- Rows written under the original additive model carry the margin in
-- `fee_paise` (₹50) and the outlay separately (₹5,000), summing to
-- `total_paise` (₹5,050). Re-expressing them is arithmetic, not a
-- restatement: `total_paise` is deliberately left alone, so the bill, every
-- ledger row posted against it, customer outstanding and every report are all
-- bit-identical before and after. Only the meaning of the `fee_paise` column
-- is brought into line, so one column doesn't mean two different things
-- depending on when the row was written.
--
-- Without this, `_compute_total` re-derives a legacy row's total as the ₹50
-- margin alone on the next correction and rejects it — outlay above total —
-- leaving every existing outlay transaction permanently uneditable.

UPDATE transactions SET fee_paise = fee_paise + outlay_paise WHERE outlay_paise > 0;
