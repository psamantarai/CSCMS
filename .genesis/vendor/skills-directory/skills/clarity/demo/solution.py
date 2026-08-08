"""
solution.py - the support-ticket router with the /clarity gate applied.

Instead of blindly trusting the top class, /clarity looks at the SHAPE of the
whole belief. It measures how evenly the probability is spread across the
teams and turns that into a single 0..1 number:

    0.0  = all belief on one team   (concentrated, safe to commit)
    1.0  = belief split perfectly evenly (a tie, you actually know nothing)

It only auto-commits when that spread is below a threshold. For near-ties it
escalates to a human / asks for more evidence instead of laundering a coin
flip as a decision.

Run:  python3 solution.py
"""

import math

TEAMS = ["billing", "technical", "account", "shipping"]

# Commit only when the belief is concentrated enough. A spread above this
# means the options are too close together to act on.
SPREAD_LIMIT = 0.55


def argmax(probs):
    best = 0
    for i in range(1, len(probs)):
        if probs[i] > probs[best]:
            best = i
    return best


def spread(probs):
    """How evenly the belief is split, normalized to 0..1.

    Returns 0 when one option holds all the belief, and 1 when the belief is
    perfectly even across every option. We normalize by the number of options
    so the number means the same thing whether we're choosing among 2 teams
    or 40 intents.
    """
    n = len(probs)
    if n <= 1:
        return 0.0
    raw = 0.0
    for p in probs:
        if p > 0:
            raw -= p * math.log(p)   # measure of how unconcentrated the belief is
    even = math.log(n)               # the value when everything is perfectly even
    return raw / even


def decide(probs):
    """Commit to the top team only if the belief is concentrated enough.
    Otherwise escalate rather than guess."""
    s = spread(probs)
    if s <= SPREAD_LIMIT:
        return ("commit", TEAMS[argmax(probs)], s)
    return ("escalate", None, s)


CASES = [
    ([0.90, 0.04, 0.03, 0.03], "commit"),    # one team dominates
    ([0.04, 0.88, 0.05, 0.03], "commit"),    # one team dominates
    ([0.26, 0.25, 0.25, 0.24], "escalate"),  # near-tie
    ([0.30, 0.28, 0.22, 0.20], "escalate"),  # near-tie
    ([0.27, 0.26, 0.24, 0.23], "escalate"),  # near-tie
]


if __name__ == "__main__":
    print(f"/clarity router: commit only when spread <= {SPREAD_LIMIT}\n")
    for idx, (probs, expected_action) in enumerate(CASES):
        action, team, s = decide(probs)
        if action == "commit":
            msg = f"COMMIT to {team}"
        else:
            msg = "ESCALATE (belief too evenly split -> ask a human / gather more)"
        print(f"case {idx}: probs={probs}  spread={s:.2f}  -> {msg}")
        assert action == expected_action, (
            f"case {idx}: expected {expected_action}, got {action}"
        )

    print("\nAll assertions passed:")
    print("  - confident cases committed")
    print("  - near-tie cases escalated instead of guessing")
