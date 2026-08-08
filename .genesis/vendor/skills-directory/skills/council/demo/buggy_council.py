#!/usr/bin/env python3
"""
buggy_council.py

Failure mode: pick the option with the best BEST-CASE outcome.

We are choosing a launch strategy. Each strategy has a payoff that
depends on how a smart competitor responds. The naive picker assumes
the competitor will do nothing (or the friendliest thing) and grabs the
option that scores highest when everything goes right.

A real opponent does not cooperate. They pick the response that hurts us
most. So the option that looked best on paper collapses in practice.
"""

# Strategies we (the proposer) can choose.
# For each strategy, the payoff depends on the competitor's response.
# Rows = our strategies, columns = competitor responses.
# Higher number = better for us.
PAYOFFS = {
    "aggressive_pricing": {
        "competitor_ignores": 100,   # huge win if they sit still
        "competitor_matches": -40,   # price war, we bleed
        "competitor_undercuts": -70, # they go lower, we lose share
    },
    "premium_positioning": {
        "competitor_ignores": 55,
        "competitor_matches": 30,
        "competitor_undercuts": 20,  # we are not competing on price
    },
    "bundle_play": {
        "competitor_ignores": 70,
        "competitor_matches": 10,
        "competitor_undercuts": -10,
    },
}

RESPONSES = ["competitor_ignores", "competitor_matches", "competitor_undercuts"]


def best_case_pick(payoffs):
    """Pick the strategy with the highest single best outcome. Optimistic."""
    best_option = None
    best_score = float("-inf")
    for option, row in payoffs.items():
        optimistic = max(row.values())
        if optimistic > best_score:
            best_score = optimistic
            best_option = option
    return best_option, best_score


def smart_opponent_response(payoffs, option):
    """A real competitor picks the response that hurts us most."""
    row = payoffs[option]
    worst_resp = min(row, key=row.get)
    return worst_resp, row[worst_resp]


def main():
    print("=== buggy_council: pick by best-case (optimistic) ===\n")

    print("Payoff table (our strategy vs competitor response):")
    header = "  {:<22}".format("strategy") + "".join(
        "{:>22}".format(r) for r in RESPONSES
    )
    print(header)
    for option, row in PAYOFFS.items():
        line = "  {:<22}".format(option) + "".join(
            "{:>22}".format(row[r]) for r in RESPONSES
        )
        print(line)
    print()

    choice, optimistic_score = best_case_pick(PAYOFFS)
    print("Optimistic picker chose: {}".format(choice))
    print("It assumed best case score: {}".format(optimistic_score))
    print()

    # Now reality: a smart competitor responds to hurt us.
    resp, real_score = smart_opponent_response(PAYOFFS, choice)
    print("But the competitor is not asleep. Their best counter-move:")
    print("  response = {}".format(resp))
    print("  our ACTUAL outcome = {}".format(real_score))
    print()

    if real_score < 0:
        print("BLOWUP: the 'best' strategy loses {} once the opponent".format(real_score))
        print("        plays smart. We optimized for a world that does not exist.")
    else:
        print("Survived, but only by luck of the table.")

    print()
    print("Lesson: best-case selection ignores the adversary. The number")
    print("that sold us the plan ({}) never gets realized.".format(optimistic_score))


if __name__ == "__main__":
    main()
