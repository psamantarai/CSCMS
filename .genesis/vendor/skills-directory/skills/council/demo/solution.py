#!/usr/bin/env python3
"""
solution.py

Fix: judge every option by its WORST-case outcome against the best
counter-move the opponent can mount. Then pick the option whose worst
case is the least bad. Finally, verify the choice is STABLE: neither
side can improve by switching unilaterally.

This is the /council mechanism made concrete:
  - proposer = us, choosing a row (strategy)
  - strongest critic = competitor, choosing a column (response)
  - we assume the critic will always pick the column that hurts us most
  - we select the row whose worst column is the best worst column
  - we check that at the resulting pair, nobody wants to deviate
"""

PAYOFFS = {
    "aggressive_pricing": {
        "competitor_ignores": 100,
        "competitor_matches": -40,
        "competitor_undercuts": -70,
    },
    "premium_positioning": {
        "competitor_ignores": 55,
        "competitor_matches": 30,
        "competitor_undercuts": 20,
    },
    "bundle_play": {
        "competitor_ignores": 70,
        "competitor_matches": 10,
        "competitor_undercuts": -10,
    },
}

RESPONSES = ["competitor_ignores", "competitor_matches", "competitor_undercuts"]


def worst_case(payoffs, option):
    """Worst outcome for an option, assuming the opponent plays to hurt us."""
    row = payoffs[option]
    worst_resp = min(row, key=row.get)
    return worst_resp, row[worst_resp]


def robust_pick(payoffs):
    """Pick the option with the best worst-case. Defend, don't dream."""
    best_option = None
    best_floor = float("-inf")
    best_resp = None
    for option in payoffs:
        resp, floor = worst_case(payoffs, option)
        if floor > best_floor:
            best_floor = floor
            best_option = option
            best_resp = resp
    return best_option, best_resp, best_floor


def opponent_floor_per_response(payoffs, response):
    """Best the opponent can hold us to with a fixed response is the
    smallest of our payoffs they would allow across our options... but
    the opponent wants to MINIMIZE our payoff, so per response we look at
    what we could get if we best-responded to that response."""
    # If the opponent commits to `response`, we (proposer) would pick the
    # option that maximizes our payoff in that column.
    return max(payoffs[o][response] for o in payoffs)


def is_stable(payoffs, option, response):
    """Stable = neither side improves by changing only their own move.

    Proposer check: given the opponent stays on `response`, can we get a
    higher payoff by switching rows? If yes, not stable.

    Opponent check: given we stay on `option`, can the opponent push our
    payoff lower by switching columns? If yes, not stable.
    """
    current = payoffs[option][response]

    # Proposer cannot do better in this column.
    best_for_us_in_col = max(payoffs[o][response] for o in payoffs)
    proposer_settled = current >= best_for_us_in_col

    # Opponent cannot hurt us more in this row.
    worst_for_us_in_row = min(payoffs[option][r] for r in RESPONSES)
    opponent_settled = current <= worst_for_us_in_row

    return proposer_settled and opponent_settled, current


def main():
    print("=== solution: pick by best worst-case, then verify stability ===\n")

    print("Worst-case outcome per strategy (opponent plays to hurt us):")
    for option in PAYOFFS:
        resp, floor = worst_case(PAYOFFS, option)
        print("  {:<22} worst = {:>5}  (via {})".format(option, floor, resp))
    print()

    choice, opp_resp, floor = robust_pick(PAYOFFS)
    print("Robust pick (best worst-case): {}".format(choice))
    print("  guaranteed floor: {}".format(floor))
    print("  opponent's strongest counter: {}".format(opp_resp))
    print()

    stable, val = is_stable(PAYOFFS, choice, opp_resp)
    print("Stability check at ({}, {}):".format(choice, opp_resp))
    print("  payoff here = {}".format(val))
    print("  proposer cannot improve by switching strategy: {}".format(
        val >= max(PAYOFFS[o][opp_resp] for o in PAYOFFS)))
    print("  opponent cannot hurt us more by switching response: {}".format(
        val <= min(PAYOFFS[choice][r] for r in RESPONSES)))
    print("  => STABLE: {}".format(stable))
    print()

    # --- Proof that robust beats optimistic where it counts ---
    # The optimistic picker (best-case) would have chosen aggressive_pricing.
    optimistic_choice = max(
        PAYOFFS, key=lambda o: max(PAYOFFS[o].values())
    )
    _, optimistic_real = worst_case(PAYOFFS, optimistic_choice)

    print("Compare under a smart opponent:")
    print("  optimistic choice {} -> real outcome {}".format(
        optimistic_choice, optimistic_real))
    print("  robust choice    {} -> real outcome {}".format(choice, floor))
    print()

    # Assertions: the robust choice survives where the optimistic one blows up.
    assert optimistic_choice == "aggressive_pricing"
    assert optimistic_real < 0, "optimistic pick should blow up under a smart opponent"
    assert floor >= 0, "robust pick should not lose under the worst case"
    assert floor > optimistic_real, "robust worst-case must beat optimistic worst-case"
    assert stable, "the selected pair must be stable (no one wants to deviate)"

    # Cross-check: the value the opponent can force equals what we can guarantee.
    # The most the opponent can hold us to (over their best responses) lines up
    # with the floor we secured -> the decision sits at a settled point.
    opponent_best_hold = min(
        opponent_floor_per_response(PAYOFFS, r) for r in RESPONSES
    )
    print("Opponent's best hold-down value: {}".format(opponent_best_hold))
    print("Our secured floor:               {}".format(floor))
    assert opponent_best_hold == floor, "the two sides meet at the same value"

    print()
    print("PASS: robust choice '{}' holds at {} under the worst attack,".format(
        choice, floor))
    print("      it is stable, and it beats the optimistic pick that lost {}.".format(
        optimistic_real))


if __name__ == "__main__":
    main()
