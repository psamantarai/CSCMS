"""Self-check for PLAN 16.5.2 — split_receipt, the one allocation rule shared
by transaction creation and later settlement. Pure function, no DB needed.
Run: python tests/test_split_receipt.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.transactions import split_receipt


def test_outlay_fully_recovered():
    # amount pays back the whole outlay and nothing more.
    recovery, income = split_receipt(outlay_paise=500000, already_paid=0, amount=500000)
    assert (recovery, income) == (500000, 0)


def test_outlay_partially_recovered():
    # amount is less than the outlay still owed — all of it is recovery.
    recovery, income = split_receipt(outlay_paise=500000, already_paid=0, amount=200000)
    assert (recovery, income) == (200000, 0)


def test_outlay_already_recovered():
    # already_paid exceeds outlay (fee/charge portion collected earlier) —
    # nothing left to recover, so the whole amount is income.
    recovery, income = split_receipt(outlay_paise=500000, already_paid=600000, amount=100000)
    assert (recovery, income) == (0, 100000)


def test_zero_outlay_is_the_ordinary_transaction_path():
    # no outlay at all — every paise becomes income, matching pre-16.5 behaviour.
    recovery, income = split_receipt(outlay_paise=0, already_paid=0, amount=500000)
    assert (recovery, income) == (0, 500000)


def test_amount_exceeds_remaining_outlay():
    # amount pays off what's left of the outlay and then some, which becomes income.
    recovery, income = split_receipt(outlay_paise=500000, already_paid=300000, amount=1000000)
    assert (recovery, income) == (200000, 800000)


if __name__ == "__main__":
    test_outlay_fully_recovered()
    test_outlay_partially_recovered()
    test_outlay_already_recovered()
    test_zero_outlay_is_the_ordinary_transaction_path()
    test_amount_exceeds_remaining_outlay()
    print("OK")
