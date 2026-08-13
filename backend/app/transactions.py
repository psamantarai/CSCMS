"""Transactions API (PLAN 3.1/3.2/3.4): the server always computes total_paise
itself — fee + charge − discount — so a client-supplied total is never
trusted, the same pattern the other create endpoints use for money fields.
Ledger posting (3.2) is for the amount actually paid, not the amount billed
(ARCHITECTURE.md §3): a partly-paid transaction's unpaid remainder is never a
ledger row, it's customer outstanding. A creation-time payment for a customer
(not a walk-in) also gets a payments row — customers.py's outstanding query
(billed − SUM(payments.amount)) only ever looks at that table, so a payment
that skipped it would double-count as still owed.

status (3.4) is never hand-set — recompute_status() derives it from whichever
table can actually answer "how much has been paid against this bill":
payments, for a customer transaction (it's the sole attribution record once a
bill can be settled piecemeal via app/payments.py); the ledger's own
service_income row, for a walk-in, since payments.customer_id is NOT NULL and
a walk-in can never be paid against again after creation anyway.

Correction (3.6) covers the bill itself — service/fee/charge/discount/
account/date/remarks. The DB trigger blocks UPDATE on ledger rows regardless,
so whenever a correction changes the account, the business_date, or (for a
walk-in previously paid in full — see correct_transaction) the total, the
live posted entry moves via reversal + replacement (ARCHITECTURE.md §2 and
H.14) rather than ever mutating the original row. For a customer, later
settlement runs through app/payments.py instead of a transaction edit."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.accounts import _get_active_or_404 as _get_account_or_404
from app.accounts import _system_user_id
from app.audit import write_audit
from app.customers import _get_or_404 as _get_customer_or_404
from app.db import begin_write, get_db
from app.ledger import account_balance, ensure_business_day_open, insert_entry, reverse_entry, validate_business_date
from app.services import _get_active_or_404 as _get_service_or_404

router = APIRouter(prefix="/api/transactions", tags=["transactions"])

_INT64_MIN, _INT64_MAX = -(2**63), 2**63 - 1
MAX_LIST_LIMIT = 500  # same cap/clamp pattern as list_ledger (H.6)


def _compute_total(outlay_paise: int, fee_paise: int, charge_paise: int, discount_paise: int) -> int:
    """The one place total_paise is computed, for both create and correct —
    each field is already bounded at the pydantic boundary, but their sum can
    still overflow int64 (H.17) or land at zero/negative (H.16), which fee's
    own ge=0 bound can't catch since a discount alone can drive the total
    non-positive.

    PLAN 16.5 revised: the outlay is NOT added on top of the fee. It's the
    banking model — `insert_banking_entries` moves a withdrawal's principal
    between the operator's own accounts and books only the commission as
    income; the principal never inflates anything. Here likewise, fee is the
    whole amount charged to the customer and the outlay is the operator's own
    money passing through it: out of outlay_account_id, back into account_id
    as the customer pays (split_receipt), leaving fee − outlay as income.
    Adding the outlay to the fee double-counted it, billing ₹200 for a ₹100
    service that cost ₹100 to provide."""
    total_paise = fee_paise + charge_paise - discount_paise
    if total_paise < _INT64_MIN or total_paise > _INT64_MAX:
        raise HTTPException(status_code=400, detail="transaction total is out of range")
    if total_paise <= 0:
        raise HTTPException(status_code=400, detail="transaction total must be positive")
    # An outlay above the total is money the customer is never billed for and
    # so can never repay — split_receipt caps recovery at what actually comes
    # in, so nothing here goes negative; the operator is simply out of pocket
    # with no UI that ever surfaces it. banking.py needs no equivalent guard
    # because its principal leg is symmetric (out of settlement, into cash).
    if outlay_paise > total_paise:
        raise HTTPException(status_code=400, detail="outlay cannot exceed the transaction total")
    return total_paise


def split_receipt(outlay_paise: int, already_paid: int, amount: int) -> tuple[int, int]:
    """Money in against a bill recovers the operator's outlay before any of it
    becomes income — made whole first, profit last (PLAN 16.5.2). The single
    allocation rule shared by creation (16.5.3) and later settlement (16.5.5),
    so the two never disagree about the same bill."""
    recovery = min(amount, max(0, outlay_paise - already_paid))
    return recovery, amount - recovery


# H.4: these are all NOT NULL columns; the correction model has to accept them
# as optional so PATCH can omit fields it isn't touching, which leaves an
# explicit {"field": null} indistinguishable from omission at the type level.
# Only runs when the client actually sends a value — see accounts.py for the
# same pattern.
def _not_null(v):
    if v is None:
        raise ValueError("must not be null")
    return v


class TransactionCreate(BaseModel):
    business_date: str
    customer_id: int | None = None  # nullable = walk-in
    service_id: int
    fee_paise: int = Field(ge=0, le=_INT64_MAX)  # H.16: a negative fee is money flowing backwards, not a real bill
    charge_paise: int = Field(0, ge=_INT64_MIN, le=_INT64_MAX)
    discount_paise: int = Field(0, ge=_INT64_MIN, le=_INT64_MAX)
    account_id: int
    amount_paid_paise: int = Field(0, ge=0, le=_INT64_MAX)
    outlay_paise: int = Field(0, ge=0, le=_INT64_MAX)  # PLAN 16.5.3
    outlay_account_id: int | None = None
    remarks: str | None = None
    # Deliberately no total_paise field: pydantic ignores unknown fields by
    # default, so a client-sent total is dropped rather than trusted — the
    # server always computes it itself below.


class TransactionCorrection(BaseModel):
    business_date: str | None = None
    service_id: int | None = None
    fee_paise: int | None = Field(None, ge=0, le=_INT64_MAX)  # H.16
    charge_paise: int | None = Field(None, ge=_INT64_MIN, le=_INT64_MAX)
    discount_paise: int | None = Field(None, ge=_INT64_MIN, le=_INT64_MAX)
    account_id: int | None = None
    outlay_paise: int | None = Field(None, ge=0, le=_INT64_MAX)  # PLAN 16.5.6
    outlay_account_id: int | None = None  # nullable column: explicit null clears it, so no _not_null here
    remarks: str | None = None

    _v_business_date = field_validator("business_date")(_not_null)
    _v_service_id = field_validator("service_id")(_not_null)
    _v_fee_paise = field_validator("fee_paise")(_not_null)
    _v_charge_paise = field_validator("charge_paise")(_not_null)
    _v_discount_paise = field_validator("discount_paise")(_not_null)
    _v_account_id = field_validator("account_id")(_not_null)
    _v_outlay_paise = field_validator("outlay_paise")(_not_null)


def _row_to_dict(row: sqlite3.Row) -> dict:
    return dict(row)


def _get_or_404(conn: sqlite3.Connection, transaction_id: int) -> sqlite3.Row:
    row = conn.execute(
        "SELECT * FROM transactions WHERE id = ? AND deleted_at IS NULL", (transaction_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="transaction not found")
    return row


def _derive_status(total_paise: int, paid_paise: int) -> str:
    if paid_paise <= 0:
        return "pending"
    if paid_paise < total_paise:
        return "partial"
    return "completed"


def recompute_status(conn: sqlite3.Connection, transaction_id: int) -> str:
    """The one place status is computed — always from money already recorded
    elsewhere, never passed in by a caller. Used after every write that can
    change how much of a transaction has been paid (here, and from
    app/payments.py)."""
    txn = conn.execute("SELECT * FROM transactions WHERE id = ?", (transaction_id,)).fetchone()
    if txn["customer_id"] is not None:
        paid = conn.execute(
            "SELECT COALESCE(SUM(amount_paise), 0) FROM payments WHERE transaction_id = ? AND deleted_at IS NULL",
            (transaction_id,),
        ).fetchone()[0]
    else:
        # A walk-in has no customer to attach a payments row to (that table's
        # customer_id is NOT NULL) and can never be settled against again
        # after creation, so the ledger row from creation is the only record.
        # PLAN 16.5.4: an outlay splits the receipt into a service_income leg
        # and a transfer recovery leg (16.5.2), so both must count here or a
        # fully-paid outlay walk-in derives as partial. amount_paise > 0
        # excludes the outlay outflow leg, which shares the other predicates.
        paid = conn.execute(
            "SELECT COALESCE(SUM(amount_paise), 0) FROM ledger "
            "WHERE source_type = 'transaction' AND source_id = ? AND "
            "(entry_type = 'service_income' OR (entry_type = 'transfer' AND amount_paise > 0))",
            (transaction_id,),
        ).fetchone()[0]
    status = _derive_status(txn["total_paise"], paid)
    conn.execute("UPDATE transactions SET status = ?, updated_at = datetime('now') WHERE id = ?",
                 (status, transaction_id))
    return status


@router.get("")
def list_transactions(
    business_date: str | None = None,
    service_id: int | None = None,
    status: str | None = None,
    customer_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
    conn: sqlite3.Connection = Depends(get_db),
):
    """Date/service/status/customer filters, pagination — same {items, total,
    limit, offset} shape as list_ledger (H.6). Rows carry service_name,
    customer_name (joined — the page needs names, not just ids) and paid_paise
    (same derivation as recompute_status, batched into the query instead of
    N+1) so the frontend's collected/pending summary is the API's own figures,
    not a client-side guess from status alone."""
    if limit < 1 or limit > MAX_LIST_LIMIT:
        limit = MAX_LIST_LIMIT
    offset = max(0, offset)

    where = ["t.deleted_at IS NULL"]
    params: list = []
    if business_date:
        where.append("t.business_date = ?")
        params.append(business_date)
    if service_id is not None:
        where.append("t.service_id = ?")
        params.append(service_id)
    if status:
        where.append("t.status = ?")
        params.append(status)
    if customer_id is not None:
        where.append("t.customer_id = ?")
        params.append(customer_id)
    clause = f"WHERE {' AND '.join(where)}"

    total = conn.execute(f"SELECT COUNT(*) FROM transactions t {clause}", params).fetchone()[0]
    rows = conn.execute(
        f"SELECT t.*, s.name AS service_name, c.name AS customer_name, "
        f"CASE WHEN t.customer_id IS NOT NULL THEN "
        f"  COALESCE((SELECT SUM(amount_paise) FROM payments p WHERE p.transaction_id = t.id AND p.deleted_at IS NULL), 0) "
        f"ELSE "
        # PLAN 16.5.4: same fix as recompute_status — a walk-in's paid figure
        # must also count the transfer recovery leg an outlay splits off.
        f"  COALESCE((SELECT SUM(amount_paise) FROM ledger l WHERE l.source_type = 'transaction' AND l.source_id = t.id AND "
        f"(l.entry_type = 'service_income' OR (l.entry_type = 'transfer' AND l.amount_paise > 0))), 0) "
        f"END AS paid_paise "
        f"FROM transactions t "
        f"JOIN services s ON s.id = t.service_id "
        f"LEFT JOIN customers c ON c.id = t.customer_id "
        f"{clause} ORDER BY t.business_date DESC, t.id DESC LIMIT ? OFFSET ?",
        (*params, limit, offset),
    ).fetchall()
    return {"items": [_row_to_dict(r) for r in rows], "total": total, "limit": limit, "offset": offset}


@router.post("", status_code=201)
def create_transaction(body: TransactionCreate, conn: sqlite3.Connection = Depends(get_db)):
    validate_business_date(body.business_date)
    service = _get_service_or_404(conn, body.service_id)
    _get_account_or_404(conn, body.account_id)
    if body.customer_id is not None:
        _get_customer_or_404(conn, body.customer_id)

    # PLAN 16.5.3: existence/active/differ checks, same placement as
    # create_banking's settlement-vs-cash guards — only the balance check
    # below needs to sit inside begin_write (H.11: it's the only one that
    # reads state a concurrent request could also be racing to spend).
    if body.outlay_paise > 0:
        if body.outlay_account_id is None:
            raise HTTPException(status_code=400, detail="outlay_paise requires an outlay_account_id")
        if not service["has_outlay"]:
            raise HTTPException(status_code=400, detail="this service does not carry an outlay")
        if body.outlay_account_id == body.account_id:
            raise HTTPException(status_code=400, detail="outlay account and receiving account must differ")
        _get_account_or_404(conn, body.outlay_account_id)

    total_paise = _compute_total(body.outlay_paise, body.fee_paise, body.charge_paise, body.discount_paise)
    # H.12: the frontend already blocks this (Transactions.tsx) — exactly
    # why the server must too, since that's the side that can be bypassed.
    if body.amount_paid_paise > total_paise:
        raise HTTPException(status_code=400, detail="amount paid exceeds the transaction total")
    # H.50 / PLAN 15.1: a walk-in has no customer row to carry an unpaid
    # remainder as outstanding (see recompute_status above), so *any* unpaid
    # amount on one is permanently uncollectable — H.50's original guard let
    # amount_paid_paise == 0 through as "record now, collect at the counter",
    # but that state is the same defect at 100%: the whole bill is
    # uncollectable through any UI path and never shows up in
    # pending_credits_paise, which is derived per customer. Money may be left
    # owing only when there is a customer to owe it. Same H.12 reasoning: the
    # frontend guard alone isn't enough since this endpoint is reachable
    # directly. correct_transaction is deliberately not guarded this way —
    # rows created before 15.1 can be pending walk-ins, and a correction is
    # the operator's only route to fixing one.
    if body.customer_id is None and body.amount_paid_paise < total_paise:
        raise HTTPException(
            status_code=400,
            detail="a transaction left unpaid needs a customer — record the customer's details first",
        )

    # H.31: begin_write must wrap the closed-day check *and* the INSERT
    # below, not just precede it — an unpaid transaction (amount_paid_paise
    # == 0) never reaches insert_entry's own re-verified guard (skipped at
    # :~250), so without this lock a concurrent close could land between the
    # check and the write, same TOCTOU create_banking already guards against.
    # ensure_business_day_open does its own write (auto-open) and so must
    # run after begin_write too — sqlite3 auto-BEGINs on that write, and a
    # later begin_write() in an already-open transaction raises.
    begin_write(conn)
    try:
        # H.13: this row is written before insert_entry ever runs, and
        # insert_entry is skipped entirely for an unpaid bill — so
        # business_date has to be checked here too, not only inside the
        # ledger. PLAN 6.1/6.3: same reasoning for open/closed.
        ensure_business_day_open(conn, body.business_date)
        # H.11 pattern: read after the write lock, so N concurrent outlays
        # against the same wallet all check the same pre-state can't all pass.
        if body.outlay_paise > 0 and account_balance(conn, body.outlay_account_id) < body.outlay_paise:
            raise HTTPException(status_code=400, detail="insufficient balance in outlay account")
        user_id = _system_user_id(conn)

        cur = conn.execute(
            "INSERT INTO transactions "
            "(business_date, customer_id, service_id, fee_paise, charge_paise, discount_paise, "
            "outlay_paise, outlay_account_id, total_paise, account_id, operator_id, status, remarks) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
            (body.business_date, body.customer_id, body.service_id, body.fee_paise, body.charge_paise,
             body.discount_paise, body.outlay_paise, body.outlay_account_id, total_paise, body.account_id,
             user_id, body.remarks),
        )
        transaction_id = cur.lastrowid

        # PLAN 16.5: the outlay leg posts whenever there is one, independent
        # of whether the customer pays anything today — the operator has
        # already paid it out. ARCHITECTURE.md §3: only money actually paid
        # by the customer is ever posted beyond that; the unpaid remainder
        # isn't a ledger row at all.
        if body.outlay_paise > 0:
            insert_entry(
                conn, business_date=body.business_date, account_id=body.outlay_account_id,
                amount_paise=-body.outlay_paise, entry_type="transfer",
                source_type="transaction", source_id=transaction_id,
                description=body.remarks, created_by=user_id,
            )

        if body.amount_paid_paise > 0:
            # 16.5.2: incoming money recovers the outlay before any of it is
            # income — nothing has been paid against this bill before now.
            recovery_paise, income_paise = split_receipt(body.outlay_paise, 0, body.amount_paid_paise)
            if recovery_paise > 0:
                insert_entry(
                    conn, business_date=body.business_date, account_id=body.account_id,
                    amount_paise=recovery_paise, entry_type="transfer",
                    source_type="transaction", source_id=transaction_id,
                    description=body.remarks, created_by=user_id,
                )
            if income_paise > 0:
                insert_entry(
                    conn, business_date=body.business_date, account_id=body.account_id,
                    amount_paise=income_paise, entry_type="service_income",
                    source_type="transaction", source_id=transaction_id,
                    description=body.remarks, created_by=user_id,
                )
            # payments.customer_id is NOT NULL — a walk-in (no customer_id)
            # has no outstanding to track, so there's nothing to record here.
            if body.customer_id is not None:
                conn.execute(
                    "INSERT INTO payments (business_date, customer_id, amount_paise, account_id, transaction_id, remarks) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (body.business_date, body.customer_id, body.amount_paid_paise, body.account_id,
                     transaction_id, body.remarks),
                )
            recompute_status(conn, transaction_id)
    except Exception:
        # roll back the transaction row inserted above too — same
        # uncommitted DB transaction, matching insert_transfer_pair's
        # all-or-nothing pattern in ledger.py.
        conn.rollback()
        raise

    row = _row_to_dict(conn.execute("SELECT * FROM transactions WHERE id = ?", (transaction_id,)).fetchone())
    write_audit(conn, table_name="transactions", row_id=transaction_id, action="create",
                before=None, after=row, user_id=user_id)
    conn.commit()
    return row


@router.patch("/{transaction_id}")
def correct_transaction(transaction_id: int, body: TransactionCorrection, conn: sqlite3.Connection = Depends(get_db)):
    """PLAN 3.6 corrects the bill (service/fee/charge/discount/account/date/
    remarks). Whenever the correction changes the account, the business_date,
    or the total against a transaction that already has a live posted entry
    (H.14), that entry is reversed and a replacement posted — the ledger row
    is never UPDATEd. A walk-in's live entry IS its only paid-amount record
    (payments.customer_id is NOT NULL, so a walk-in can never be settled
    again after creation) — if it was covering the old bill in full, the
    replacement re-syncs to the corrected total so a completed walk-in never
    corrects into an unsettleable partial. A customer's creation-time entry
    is only ever the amount collected then; later settlement runs through
    app/payments.py and posts its own rows, so a fee/charge/discount
    correction leaves it alone there. total_paise and status are then
    re-derived, same as create."""
    txn = _get_or_404(conn, transaction_id)
    before = _row_to_dict(txn)
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        return before

    if "business_date" in fields:
        validate_business_date(fields["business_date"])  # H.13
    if "service_id" in fields:
        _get_service_or_404(conn, fields["service_id"])
    new_account_id = fields.get("account_id", txn["account_id"])
    if "account_id" in fields:
        _get_account_or_404(conn, new_account_id)

    fee = fields.get("fee_paise", txn["fee_paise"])
    charge = fields.get("charge_paise", txn["charge_paise"])
    discount = fields.get("discount_paise", txn["discount_paise"])
    new_outlay_paise = fields.get("outlay_paise", txn["outlay_paise"])
    new_outlay_account_id = fields.get("outlay_account_id", txn["outlay_account_id"])

    # PLAN 16.5.6: same guards create_transaction applies (16.5.3), re-run
    # against whatever the corrected figures leave in place.
    if new_outlay_paise > 0:
        if new_outlay_account_id is None:
            raise HTTPException(status_code=400, detail="outlay_paise requires an outlay_account_id")
        service_row = _get_service_or_404(conn, fields.get("service_id", txn["service_id"]))
        if not service_row["has_outlay"]:
            raise HTTPException(status_code=400, detail="this service does not carry an outlay")
        if new_outlay_account_id == new_account_id:
            raise HTTPException(status_code=400, detail="outlay account and receiving account must differ")
        _get_account_or_404(conn, new_outlay_account_id)

    total_paise = _compute_total(new_outlay_paise, fee, charge, discount)

    new_business_date = fields.get("business_date", txn["business_date"])
    account_changed = new_account_id != txn["account_id"]
    date_changed = new_business_date != txn["business_date"]
    amount_changed = total_paise != txn["total_paise"]
    outlay_changed = new_outlay_paise != txn["outlay_paise"] or new_outlay_account_id != txn["outlay_account_id"]

    try:
        if account_changed or date_changed or amount_changed or outlay_changed:
            # H.11: acquire the write lock before the live-rows lookup
            # below, so N concurrent corrections of the same transaction
            # can't all find and reverse the same live entries.
            begin_write(conn)
            # H.29: gating this on date_changed let any correction that left
            # the date alone (a pending transaction, whose amount never
            # reaches insert_entry's own guard below since no live entry
            # exists to find; or a partially-paid one whose recomputed
            # amount happens to match the live entry) skip the closed-day
            # check entirely. The resource's *current* business_date must be
            # checked unconditionally here, not only when the correction
            # happens to move it. Must run after begin_write:
            # ensure_business_day_open does its own write (auto-open), and
            # sqlite3 auto-BEGINs on that, so a begin_write() afterwards
            # would hit "transaction within a transaction".
            ensure_business_day_open(conn, txn["business_date"])
            if date_changed:
                ensure_business_day_open(conn, new_business_date)

            # PLAN 16.5.6: an actual reversal is only warranted when where
            # the money sits or how it splits against the outlay changes —
            # a customer's fee/charge/discount-only correction never
            # touches already-collected money (H.14: settlement happens
            # through app/payments.py, not here); a walk-in's total always
            # resyncs because H.50/15.1 requires it to be paid in full or
            # not at all.
            needs_repost = account_changed or date_changed or outlay_changed or \
                (txn["customer_id"] is None and amount_changed)
            if needs_repost:
                user_id = _system_user_id(conn)
                # All live rows for this transaction, not just the
                # service_income leg — an outlay adds a transfer-out and a
                # transfer-recovery row alongside it. Same shape banking.py's
                # _live_ledger_entries uses: entry_type != 'reversal'
                # excludes the reversal rows themselves, so a second
                # correction can't re-reverse one and trip reverse_entry's
                # H.9 guard.
                live_rows = conn.execute(
                    "SELECT * FROM ledger WHERE source_type = 'transaction' AND source_id = ? "
                    "AND entry_type != 'reversal' AND id NOT IN "
                    "(SELECT reverses_id FROM ledger WHERE reverses_id IS NOT NULL)",
                    (transaction_id,),
                ).fetchall()
                received_so_far = sum(r["amount_paise"] for r in live_rows if r["amount_paise"] > 0)
                for row in live_rows:
                    reverse_entry(conn, entry_id=row["id"], created_by=user_id,
                                   description=f"Correction of transaction {transaction_id}")

                # the old outlay returns to its account via the reversal
                # above, so this sees the true post-reversal balance — the
                # ordering update_banking already established.
                if new_outlay_paise and account_balance(conn, new_outlay_account_id) < new_outlay_paise:
                    raise HTTPException(status_code=400, detail="insufficient balance in outlay account")

                if new_outlay_paise > 0:
                    insert_entry(
                        conn, business_date=new_business_date, account_id=new_outlay_account_id,
                        amount_paise=-new_outlay_paise, entry_type="transfer",
                        source_type="transaction", source_id=transaction_id,
                        description=fields.get("remarks", txn["remarks"]), created_by=user_id,
                    )
                # H.14: a live walk-in is always paid exactly its total
                # (H.50/15.1), so a corrected total resyncs the reposted
                # amount to the NEW total — there's no other mechanism to
                # collect a walk-in's remainder later. A customer's
                # already-collected amount is untouched by the bill itself;
                # only how it splits against the outlay is re-run (16.5.2).
                amount_to_allocate = total_paise if (txn["customer_id"] is None and live_rows) else received_so_far
                if amount_to_allocate > 0:
                    recovery_paise, income_paise = split_receipt(new_outlay_paise, 0, amount_to_allocate)
                    if recovery_paise > 0:
                        insert_entry(
                            conn, business_date=new_business_date, account_id=new_account_id,
                            amount_paise=recovery_paise, entry_type="transfer",
                            source_type="transaction", source_id=transaction_id,
                            description=fields.get("remarks", txn["remarks"]), created_by=user_id,
                        )
                    if income_paise > 0:
                        insert_entry(
                            conn, business_date=new_business_date, account_id=new_account_id,
                            amount_paise=income_paise, entry_type="service_income",
                            source_type="transaction", source_id=transaction_id,
                            description=fields.get("remarks", txn["remarks"]), created_by=user_id,
                        )

        set_fields = {**fields, "total_paise": total_paise}
        set_clause = ", ".join(f"{k} = ?" for k in set_fields)
        conn.execute(
            f"UPDATE transactions SET {set_clause}, updated_at = datetime('now') WHERE id = ?",
            (*set_fields.values(), transaction_id),
        )
        recompute_status(conn, transaction_id)
        after = _row_to_dict(_get_or_404(conn, transaction_id))
        write_audit(conn, table_name="transactions", row_id=transaction_id, action="update",
                    before=before, after=after, user_id=_system_user_id(conn))
    except Exception:
        conn.rollback()
        raise

    conn.commit()
    return after
