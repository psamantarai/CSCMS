"""H.10: regression tests for the hardening pass (PLAN.md H.1-H.9). Each
check already lives next to the fix it covers (test locality); this file
just runs them together as one pass so the whole pass can be verified with a
single command instead of six. Run: python tests/test_edge_cases.py

H.3 (paise/date formatting) and H.8 (frontend loading/error states) have no
backend logic to assert on: H.3 is covered by src/lib/format.test.ts, and
H.8 is UI-only, out of scope for the assert-script tier per
ARCHITECTURE.md §8 (frontend tests limited to format.ts/paise conversion).
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
]

if __name__ == "__main__":
    for check in CHECKS:
        check()
    print(f"OK ({len(CHECKS)} checks)")
