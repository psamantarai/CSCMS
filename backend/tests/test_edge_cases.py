"""H.10 + H.20 + H.28: regression tests for all three hardening passes
(PLAN.md H.1-H.9, H.11-H.17, then H.21-H.27). Each check already lives next
to the fix it covers (test locality); this file just runs them together as
one pass so the whole thing can be verified with a single command instead of
a dozen. Run:
python tests/test_edge_cases.py

H.3 (paise/date formatting) and H.8 (frontend loading/error states) have no
backend logic to assert on: H.3 is covered by src/lib/format.test.ts, and
H.8 is UI-only, out of scope for the assert-script tier per
ARCHITECTURE.md §8 (frontend tests limited to format.ts/paise conversion).

H.18 and H.19 are frontend-only too and not aggregated here: H.18 is covered
by src/lib/api.test.ts (error detail extraction) plus the emptyForm fix being
a one-line change tsc/build already catch; H.19 was verified with a live
browser walkthrough of PLAN 3.8's Verify, not an automated check.

H.25 is frontend-only too: update_expense's guard fix (H.24) is what
unblocks it, and it was verified with a live browser walkthrough of PLAN.md's
Verify rather than an automated check.

H.33, H.37, H.38 and H.40-H.41 (PLAN.md's second hardening pass) are
frontend-only and not aggregated here either: H.37/H.38 are a label/bucket-
math fix asserted against closing.py's own output directly in test_closing.py
rather than through this file's imports, and H.33/H.40/H.41 were verified
with a live browser walkthrough of their Verify lines.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

# H.1: thread-safe connections
from test_db import test_concurrent_writers_do_not_error, test_connection_usable_from_another_thread

# H.2: malformed business_date rejected
from test_ledger import test_insert_entry_rejects_malformed_business_date, test_reversal_of_a_reversal_rejected
from test_transfers import (
    test_transfer_exceeding_balance_rejected,
    test_transfer_from_deactivated_account_rejected,
    test_transfer_to_deactivated_account_rejected,
    test_transfer_with_malformed_business_date_rejected,
)

# H.4: null/whitespace/overflow rejected at the pydantic boundary
from test_accounts import (
    test_null_account_type_and_is_active_rejected_on_update,
    test_null_and_blank_name_rejected as test_accounts_null_and_blank_name_rejected,
    test_opening_balance_overflow_rejected,
)
from test_customers import test_null_and_blank_name_rejected as test_customers_null_and_blank_name_rejected
from test_services import (
    test_fee_overflow_rejected,
    test_null_and_blank_name_and_category_rejected,
    test_null_fee_and_is_active_rejected_on_update,
)

# H.6: ledger read hardening (filtered running balance, limit/offset clamping)
from test_ledger_api import test_filtered_running_balance_continues_from_prior_balance, test_limit_and_offset_are_clamped

# H.7: customer search escaping and soft-delete reachability
from test_customers import test_history_and_outstanding_reachable_after_soft_delete, test_search_escapes_like_wildcards

# H.9: reversal-of-a-reversal rejected — see test_ledger import above

# H.11: serialised read-check-write money guards, one race per write path
from test_payments import test_concurrent_payments_against_one_bill_only_one_succeeds
from test_transaction_correction import test_concurrent_account_corrections_never_double_reverse_the_same_entry
from test_transfers import test_concurrent_transfers_never_drive_balance_negative

# H.12: a payment larger than the bill rejected at create time
from test_transactions import test_amount_paid_exceeding_total_rejected_at_create

# H.13: business_date validated on the transactions write path too, not just insert_entry
from test_transaction_correction import test_malformed_business_date_rejected_on_correction
from test_transactions import (
    test_malformed_business_date_rejected_when_paid,
    test_malformed_business_date_rejected_when_unpaid,
)

# H.14: corrections that change the amount or date move the ledger, not just the bill
from test_transaction_correction import (
    test_business_date_correction_moves_the_live_ledger_entry,
    test_customer_bill_correction_does_not_touch_ledger,
    test_walk_in_full_payment_correction_resyncs_the_live_ledger_entry,
)

# H.15: deactivated accounts/services rejected on transactions, corrections, and payments
from test_payments import test_payment_to_deactivated_account_rejected
from test_transaction_correction import test_correction_onto_deactivated_account_rejected
from test_transactions import test_deactivated_account_rejected_at_create, test_deactivated_service_rejected_at_create

# H.16: non-positive transaction totals rejected, on both create and correct
from test_transaction_correction import test_correction_to_non_positive_total_rejected
from test_transactions import (
    test_discount_exceeding_fee_rejected,
    test_fee_and_discount_equal_with_nonzero_charge_still_succeeds,
    test_negative_fee_rejected_at_pydantic_boundary,
    test_zero_total_rejected,
)

# H.17: an overflowing total rejected with 400, not a 500 from SQLite
from test_transaction_correction import test_correction_to_overflowing_total_rejected
from test_transactions import test_total_overflow_rejected_with_400_not_500

# H.21: concurrent category writes no longer silently lose data
# H.22: a comma in a category name no longer corrupts the stored list
# H.23: concurrent/racing expense deletes no longer 500
# H.24: an amount/date-only PATCH still guards against a deactivated account
# H.26: an out-of-range expense id 404s instead of 500
# H.27: a money edit's ledger row carries the expense's current note
from test_expenses import (
    test_amount_only_patch_onto_deactivated_account_rejected,
    test_amount_correction_on_a_closed_date_rejected as test_expense_amount_correction_on_a_closed_date_rejected,
    test_comma_in_category_name_does_not_corrupt_the_list,
    test_concurrent_add_category_never_loses_a_write,
    test_concurrent_delete_of_one_expense_yields_exactly_one_success,
    test_concurrent_delete_racing_amount_correction_leaves_a_consistent_end_state,
    test_delete_on_a_closed_date_rejected as test_expense_delete_on_a_closed_date_rejected,
    test_note_correction_then_amount_correction_uses_current_note,
    test_out_of_range_expense_id_returns_404_not_500,
)

# H.29: correct_transaction's closed-day guard skipped whenever the computed
# replacement amount happened not to change (pending, or partially-paid with
# an unchanged live-entry amount)
# H.30: a correction/deletion could still post a new ledger row onto an
# already-closed date because every write path checked only the *new*
# business_date (or, for delete_banking, checked nothing at all)
from test_transaction_correction import (
    test_correction_moving_a_transaction_off_a_closed_date_rejected,
    test_correction_of_partially_paid_transaction_on_closed_day_rejected,
    test_correction_of_pending_transaction_on_closed_day_rejected,
)
from test_banking import (
    test_commission_summary_nets_corrections_and_deletes,
    test_commission_summary_out_of_range_account_id_returns_404_not_500,
    test_correction_moving_money_off_a_closed_date_rejected,
    test_delete_on_a_closed_date_rejected as test_banking_delete_on_a_closed_date_rejected,
)

# H.31: create_transaction's closed-day check and its insert were an unlocked
# TOCTOU for unpaid transactions -- a close could land between them
from test_transactions import test_concurrent_close_never_lets_an_unpaid_create_slip_through

# H.32: physical_cash_paise had no bound, unlike every other money field
# H.35: closing an untouched future date auto-opened and sealed it in the
# same call, with no reopen path
from test_closing import (
    test_closing_a_future_date_rejected,
    test_closing_todays_date_still_succeeds,
    test_genuine_non_negative_count_still_closes_normally,
    test_negative_physical_cash_rejected_at_pydantic_boundary,
    test_overflowing_physical_cash_rejected_at_pydantic_boundary,
)

# H.34: an id past SQLite's 64-bit range 500'd instead of 404ing, on every
# account/customer id lookup and on banking's commission-summary
from test_accounts import test_out_of_range_account_id_returns_404_not_500
from test_customers import test_out_of_range_customer_id_returns_404_not_500

# H.36: commission-summary filtered entry_type = 'commission' only, double-
# counting corrections and deletes that other reports already netted
# correctly -- see test_commission_summary_nets_corrections_and_deletes above

# H.39: dashboard's cash_in_hand/total_bank_balance had no business_date
# filter, so a future-dated entry could move a past date's figures
from test_dashboard import test_future_dated_entries_do_not_move_an_earlier_dates_balances

# H.42: /api/reports/monthly accepted nonsense years (0, negative, 5-digit,
# absurdly large) with no bound, unlike month
from test_reports import test_monthly_report_rejects_out_of_range_year

CHECKS = [
    test_connection_usable_from_another_thread,
    test_concurrent_writers_do_not_error,
    test_insert_entry_rejects_malformed_business_date,
    test_transfer_with_malformed_business_date_rejected,
    test_accounts_null_and_blank_name_rejected,
    test_null_account_type_and_is_active_rejected_on_update,
    test_opening_balance_overflow_rejected,
    test_null_and_blank_name_and_category_rejected,
    test_null_fee_and_is_active_rejected_on_update,
    test_fee_overflow_rejected,
    test_customers_null_and_blank_name_rejected,
    test_transfer_from_deactivated_account_rejected,
    test_transfer_to_deactivated_account_rejected,
    test_transfer_exceeding_balance_rejected,
    test_filtered_running_balance_continues_from_prior_balance,
    test_limit_and_offset_are_clamped,
    test_search_escapes_like_wildcards,
    test_history_and_outstanding_reachable_after_soft_delete,
    test_reversal_of_a_reversal_rejected,
    test_concurrent_payments_against_one_bill_only_one_succeeds,
    test_concurrent_account_corrections_never_double_reverse_the_same_entry,
    test_concurrent_transfers_never_drive_balance_negative,
    test_amount_paid_exceeding_total_rejected_at_create,
    test_malformed_business_date_rejected_on_correction,
    test_malformed_business_date_rejected_when_paid,
    test_malformed_business_date_rejected_when_unpaid,
    test_business_date_correction_moves_the_live_ledger_entry,
    test_customer_bill_correction_does_not_touch_ledger,
    test_walk_in_full_payment_correction_resyncs_the_live_ledger_entry,
    test_payment_to_deactivated_account_rejected,
    test_correction_onto_deactivated_account_rejected,
    test_deactivated_account_rejected_at_create,
    test_deactivated_service_rejected_at_create,
    test_correction_to_non_positive_total_rejected,
    test_discount_exceeding_fee_rejected,
    test_fee_and_discount_equal_with_nonzero_charge_still_succeeds,
    test_negative_fee_rejected_at_pydantic_boundary,
    test_zero_total_rejected,
    test_correction_to_overflowing_total_rejected,
    test_total_overflow_rejected_with_400_not_500,
    test_concurrent_add_category_never_loses_a_write,
    test_comma_in_category_name_does_not_corrupt_the_list,
    test_concurrent_delete_of_one_expense_yields_exactly_one_success,
    test_concurrent_delete_racing_amount_correction_leaves_a_consistent_end_state,
    test_amount_only_patch_onto_deactivated_account_rejected,
    test_out_of_range_expense_id_returns_404_not_500,
    test_note_correction_then_amount_correction_uses_current_note,
    test_correction_of_pending_transaction_on_closed_day_rejected,
    test_correction_of_partially_paid_transaction_on_closed_day_rejected,
    test_correction_moving_a_transaction_off_a_closed_date_rejected,
    test_correction_moving_money_off_a_closed_date_rejected,
    test_banking_delete_on_a_closed_date_rejected,
    test_expense_amount_correction_on_a_closed_date_rejected,
    test_expense_delete_on_a_closed_date_rejected,
    test_concurrent_close_never_lets_an_unpaid_create_slip_through,
    test_negative_physical_cash_rejected_at_pydantic_boundary,
    test_overflowing_physical_cash_rejected_at_pydantic_boundary,
    test_genuine_non_negative_count_still_closes_normally,
    test_out_of_range_account_id_returns_404_not_500,
    test_out_of_range_customer_id_returns_404_not_500,
    test_closing_a_future_date_rejected,
    test_closing_todays_date_still_succeeds,
    test_commission_summary_nets_corrections_and_deletes,
    test_commission_summary_out_of_range_account_id_returns_404_not_500,
    test_future_dated_entries_do_not_move_an_earlier_dates_balances,
    test_monthly_report_rejects_out_of_range_year,
]

if __name__ == "__main__":
    for check in CHECKS:
        check()
    print(f"OK ({len(CHECKS)} checks)")
