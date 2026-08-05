"""PLAN 7.8: the reconciliation test suite -- PRD acceptance criterion 6
("financial reports always reconcile with ledger entries") checked, not
assumed. One scripted month of mixed activity (transactions including a
partial payment and a fee correction, an expense including an amount
correction, banking including a commission correction, a transfer, a
settlement payment, and a closed day) is run through every report
(monthly/service-wise/customer-wise/banking-commission/profit-loss,
dashboard, and the daily closing report) and each figure is checked against
a direct ledger SUM/derivation for the same scope -- plus cross-report totals
against each other. A month boundary leak (Dec activity) and every
transfer/banking pair summing to zero are checked too.
Run: python tests/test_reconciliation.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.accounts import AccountCreate, create_account
from app.banking import BankingCreate, BankingUpdate, create_banking, update_banking
from app.customers import CustomerCreate, create_customer
from app.dashboard import get_dashboard
from app.db import get_connection, run_migrations
from app.expenses import ExpenseCreate, ExpenseUpdate, create_expense, update_expense
from app.closing import close_day, get_day_report, CloseDayRequest
from app.ledger import closing_balance, income_expenses
from app.payments import PaymentCreate, create_payment
from app.reports import (
    banking_commission_report, customer_wise_report, monthly_report,
    profit_loss_report, service_wise_report,
)
from app.seed import run_seed
from app.services import ServiceCreate, create_service
from app.transactions import TransactionCorrection, TransactionCreate, correct_transaction, create_transaction
from app.transfers import TransferCreate, create_transfer

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"
START, END = "2024-11-01", "2024-11-30"


def test_reconciliation_suite_scripted_month():
    with tempfile.TemporaryDirectory() as tmp:
        conn = get_connection(Path(tmp) / "test.db")
        run_migrations(conn, MIGRATIONS_DIR)
        run_seed(conn)

        cash_id = conn.execute("SELECT id FROM accounts WHERE name = 'Cash Drawer'").fetchone()[0]
        sbi_id = create_account(AccountCreate(name="SBI", account_type="settlement", opening_balance_paise=1000000), conn)["id"]
        alice = create_customer(CustomerCreate(name="Alice"), conn)
        bob = create_customer(CustomerCreate(name="Bob"), conn)
        pan = create_service(ServiceCreate(name="PAN Card", category="PAN", default_fee_paise=10000), conn)
        cert = create_service(ServiceCreate(name="Certificate", category="Certificates", default_fee_paise=35000), conn)
        printing = create_service(ServiceCreate(name="Printing", category="Printing", default_fee_paise=500), conn)

        # -- 2024-11-01: two transactions (one customer, one walk-in), an expense.
        txn1 = create_transaction(TransactionCreate(
            business_date="2024-11-01", customer_id=alice["id"], service_id=pan["id"],
            fee_paise=10000, account_id=cash_id, amount_paid_paise=10000), conn)
        txn2 = create_transaction(TransactionCreate(
            business_date="2024-11-01", service_id=printing["id"],
            fee_paise=500, account_id=cash_id, amount_paid_paise=500), conn)
        create_expense(ExpenseCreate(business_date="2024-11-01", category="Rent", amount_paise=4000, account_id=cash_id), conn)

        # -- 2024-11-05: a partial-payment customer transaction, a banking
        # withdrawal, an account transfer.
        txn3 = create_transaction(TransactionCreate(
            business_date="2024-11-05", customer_id=bob["id"], service_id=cert["id"],
            fee_paise=35000, account_id=cash_id, amount_paid_paise=10700), conn)
        create_banking(BankingCreate(
            business_date="2024-11-05", txn_type="withdrawal", principal_paise=100000,
            commission_paise=1500, settlement_account_id=sbi_id, cash_account_id=cash_id), conn)
        create_transfer(TransferCreate(business_date="2024-11-05", from_account_id=cash_id, to_account_id=sbi_id, amount_paise=20000), conn)

        # -- 2024-11-10: settle Bob's outstanding, an expense correction
        # (500 -> 300, exercises the expense-reversal fix), a second banking
        # transaction that gets corrected on 2024-11-15 below.
        create_payment(PaymentCreate(business_date="2024-11-10", customer_id=bob["id"], amount_paise=24300, account_id=cash_id), conn)
        paper = create_expense(ExpenseCreate(business_date="2024-11-10", category="Paper", amount_paise=500, account_id=cash_id), conn)
        update_expense(paper["id"], ExpenseUpdate(amount_paise=300), conn)

        # -- fee correction on the walk-in printing transaction: 500 -> 750.
        # customer_id is None, so this DOES reverse+replace the live
        # service_income entry (the fee-only guard that leaves a customer's
        # creation-time entry alone doesn't apply here) -- exercises the
        # transaction-reversal fix, still dated 2024-11-01 (unchanged).
        correct_transaction(txn2["id"], TransactionCorrection(fee_paise=750), conn)

        # -- 2024-11-15: a second banking transaction whose commission gets
        # corrected 800 -> 1200 (exercises the banking-reversal fix).
        banking2 = create_banking(BankingCreate(
            business_date="2024-11-15", txn_type="withdrawal", principal_paise=50000,
            commission_paise=800, settlement_account_id=sbi_id, cash_account_id=cash_id), conn)
        update_banking(banking2["id"], BankingUpdate(commission_paise=1200), conn)

        # -- outside the month: must not leak into any November figure.
        create_transaction(TransactionCreate(
            business_date="2024-12-01", customer_id=alice["id"], service_id=pan["id"],
            fee_paise=99900, account_id=cash_id, amount_paid_paise=99900), conn)
        create_expense(ExpenseCreate(business_date="2024-12-01", category="Rent", amount_paise=88800, account_id=cash_id), conn)

        # -- close 2024-11-01 last, after its correction (dated 2024-11-01)
        # has already landed -- closing first would 409 that correction.
        close_day("2024-11-01", CloseDayRequest(), conn)

        # ---- every entry_type='transfer' pair (plain transfers and banking
        # principal moves, corrected or not) sums to zero, grouped by the
        # source it belongs to.
        transfer_groups = conn.execute(
            "SELECT source_type, source_id, SUM(amount_paise) AS total FROM ledger "
            "WHERE entry_type = 'transfer' GROUP BY source_type, source_id"
        ).fetchall()
        assert transfer_groups  # the suite actually exercised transfers
        assert all(g["total"] == 0 for g in transfer_groups)

        # ---- true net November income/expenses, corrections netted by hand:
        # txn1 10000 + txn2 (500 - 500 + 750) + txn3 10700 + commission (1500 + (800-800+1200))
        expected_income = 10000 + 750 + 10700 + 1500 + 1200
        # expense1 4000 + paper (500 - 500 + 300)
        expected_expenses = 4000 + 300
        income_paise, expenses_paise = income_expenses(conn, START, END)
        assert (income_paise, expenses_paise) == (expected_income, expected_expenses)

        # ---- monthly report matches the same hand-netted figures.
        monthly = monthly_report(2024, 11, conn)
        assert monthly["income_paise"] == expected_income
        assert monthly["expenses_paise"] == expected_expenses
        assert monthly["profit_paise"] == expected_income - expected_expenses

        # ---- profit & loss splits income/expenses but must total the same.
        pl = profit_loss_report(start_date=START, end_date=END, conn=conn)
        assert pl["service_income_paise"] == 10000 + 750 + 10700
        assert pl["commission_paise"] == 1500 + 1200
        assert pl["total_income_paise"] == expected_income == monthly["income_paise"]
        assert {r["category"]: r["amount_paise"] for r in pl["expenses_by_category"]} == {"Rent": 4000, "Paper": 300}
        assert pl["total_expenses_paise"] == expected_expenses == monthly["expenses_paise"]
        assert pl["profit_paise"] == monthly["profit_paise"]

        # ---- banking commission report nets the corrected banking2 too.
        bc = banking_commission_report(start_date=START, end_date=END, conn=conn)
        assert bc["total_commission_paise"] == 1500 + 1200 == pl["commission_paise"]

        # ---- service-wise incomes sum to the same service_income total,
        # each service reconciling against its own direct ledger SUM
        # (source_type='transaction', no entry_type filter -- includes any
        # reversal/replacement, same joins the report itself uses).
        service_rows = {r["service_id"]: r for r in service_wise_report(start_date=START, end_date=END, conn=conn)}
        assert service_rows[pan["id"]]["income_paise"] == 10000
        assert service_rows[pan["id"]]["billed_paise"] == 10000
        assert service_rows[cert["id"]]["income_paise"] == 10700
        assert service_rows[cert["id"]]["billed_paise"] == 35000
        assert service_rows[printing["id"]]["income_paise"] == 750
        assert service_rows[printing["id"]]["billed_paise"] == 750  # transactions.total_paise reflects the correction
        assert sum(r["income_paise"] for r in service_rows.values()) == pl["service_income_paise"]

        # ---- customer-wise: billed/collected reconcile per customer, and
        # every customer transaction is fully settled by month end.
        customer_rows = {r["customer_id"]: r for r in customer_wise_report(start_date=START, end_date=END, conn=conn)}
        assert customer_rows[alice["id"]]["billed_paise"] == 10000
        assert customer_rows[alice["id"]]["collected_paise"] == 10000
        assert customer_rows[bob["id"]]["billed_paise"] == 35000
        assert customer_rows[bob["id"]]["collected_paise"] == 10700 + 24300 == 35000

        # ---- dashboard (2024-11-01, now closed): today's figures scope to
        # that single day; running balances reconcile against closing_balance
        # as of that date (H.39: not account_balance's whole-ledger sum, which
        # would leak in the 5th/10th/15th/Dec activity dated after this day).
        dash = get_dashboard(business_date="2024-11-01", conn=conn)
        assert dash["today_income_paise"] == 10000 + 750  # txn1 + corrected txn2, not txn3 (dated the 5th)
        assert dash["today_expenses_paise"] == 4000
        assert dash["today_profit_paise"] == 10000 + 750 - 4000
        assert dash["cash_in_hand_paise"] == closing_balance(conn, cash_id, "2024-11-01")
        assert dash["total_bank_balance_paise"] == closing_balance(conn, sbi_id, "2024-11-01")
        assert dash["pending_credits_paise"] == 0  # Alice and Bob are both fully settled by month end
        assert dash["today_customers"] == 1  # Alice only -- txn2 is a walk-in
        assert dash["closing_status"] == "closed"

        # ---- the closed day's report: opening + received - paid +
        # transfer_in - transfer_out + adjustment reconciles to closing by
        # construction (closing.py), and the cash figure matches a
        # hand-derived total: txn1 10000 + txn2 net 750 - expense1 4000.
        report = get_day_report("2024-11-01", conn)
        assert report["status"] == "closed"
        cash_row = next(a for a in report["accounts"] if a["account_id"] == cash_id)
        assert cash_row["closing_paise"] == 10000 + 750 - 4000
        for a in report["accounts"]:
            assert (a["opening_paise"] + a["received_paise"] - a["paid_paise"]
                    + a["transfer_in_paise"] - a["transfer_out_paise"] + a["adjustment_paise"]) == a["closing_paise"]
        # the cash account's adjustment bucket still includes txn2's -500
        # reversal, dated 2024-11-01, from its fee correction (closing.py
        # deliberately buckets every entry_type='reversal' row as
        # "adjustment" regardless of source) -- but cash_variance_paise
        # (H.38) excludes it: no physical-count variance was recorded
        # (CloseDayRequest() left physical_cash_paise unset), so it's 0.
        assert cash_row["adjustment_paise"] == -500
        assert report["cash_variance_paise"] == 0

        conn.close()


if __name__ == "__main__":
    test_reconciliation_suite_scripted_month()
    print("OK")
