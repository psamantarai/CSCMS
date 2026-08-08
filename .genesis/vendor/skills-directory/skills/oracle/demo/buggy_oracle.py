"""
demo app for /oracle - an auto-approval gate that TRUSTS a model's stated confidence.

Scenario:
    A classifier outputs a "confidence" between 0 and 1 for each decision.
    The gate auto-approves anything the model claims it is >= 85% sure about,
    believing "85% sure" means "right 85% of the time".

    The model is OVERCONFIDENT. When it says 0.90 it is actually right ~60%
    of the time; when it says 0.70 it is right ~50%; and so on. The gate never
    checks this, so it ships a flood of wrong decisions while feeling safe.

Run:  python3 buggy_oracle.py
"""

import random

random.seed(7)

# How often the model is ACTUALLY right at each stated confidence level.
# (The model never sees this table; it is reality. It is far below the claim.)
TRUE_HIT_RATE = {
    0.55: 0.42,
    0.65: 0.47,
    0.75: 0.52,
    0.85: 0.58,
    0.95: 0.62,
}

STATED_LEVELS = list(TRUE_HIT_RATE.keys())


def make_predictions(n):
    """Simulate the model emitting (stated_confidence, was_correct) pairs.

    The model picks a stated confidence, then reality decides correctness at
    the TRUE (much lower) rate for that stated level.
    """
    rows = []
    for _ in range(n):
        stated = random.choice(STATED_LEVELS)
        was_correct = random.random() < TRUE_HIT_RATE[stated]
        rows.append((stated, was_correct))
    return rows


APPROVE_THRESHOLD = 0.85


def gate_trusts_stated(rows):
    """Auto-approve every prediction whose STATED confidence >= threshold."""
    approved = [(stated, ok) for (stated, ok) in rows if stated >= APPROVE_THRESHOLD]
    return approved


if __name__ == "__main__":
    rows = make_predictions(4000)

    approved = gate_trusts_stated(rows)
    n_approved = len(approved)
    n_correct = sum(1 for (_s, ok) in approved if ok)
    actual_rate = n_correct / n_approved if n_approved else 0.0

    # The gate BELIEVES the approved batch is at least 85% reliable
    # (it only let through >= 0.85 claims). Reality says otherwise.
    believed_rate = APPROVE_THRESHOLD

    print("AUTO-APPROVAL GATE (trusts the model's stated confidence)")
    print("  threshold to auto-approve : stated >= {:.0%}".format(APPROVE_THRESHOLD))
    print("  predictions auto-approved : {}".format(n_approved))
    print()
    print("  gate BELIEVES reliability : {:.1%}  (because every claim was >= 85%)".format(believed_rate))
    print("  ACTUAL reliability        : {:.1%}".format(actual_rate))
    print("  gap (false security)      : {:.1f} points".format((believed_rate - actual_rate) * 100))
    print()
    wrong_shipped = n_approved - n_correct
    print("  wrong decisions shipped   : {} of {}  ({:.1%})".format(
        wrong_shipped, n_approved, wrong_shipped / n_approved))
    print()
    print("The gate thinks it is shipping ~15% errors. It is actually shipping ~{:.0%}.".format(
        1 - actual_rate))
    print("It trusted the number the model WISHED were true, not the one reality backs.")
