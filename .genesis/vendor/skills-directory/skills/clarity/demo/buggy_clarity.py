"""
demo app for /clarity - a support-ticket router with a PLANTED FAILURE MODE.

The router takes a probability over 4 teams and ALWAYS picks the top one
(argmax), no matter how thin the lead. On confident inputs that's fine.
On a near-tie like [0.26, 0.25, 0.25, 0.24] it confidently routes a coin
flip, and the "winner" is basically arbitrary noise.

Run:   python3 buggy_clarity.py
You'll see it auto-commit on EVERY case, including the near-ties where it
is wrong / arbitrary. Your job (and the skill's job) is NOT to trust argmax
blindly - it's to notice when the belief is too evenly split to act.
"""

TEAMS = ["billing", "technical", "account", "shipping"]


def route(probs):
    """Always pick the top class. No check on how thin the lead is."""
    best = 0
    for i in range(1, len(probs)):
        if probs[i] > probs[best]:
            best = i
    return best


# Each case: (probabilities over the 4 teams, the team it SHOULD go to)
# For near-ties there is no real "should" - the true team is whatever the
# evidence would reveal if we gathered more, NOT whatever argmax happens to hit.
CASES = [
    # confident: one team clearly dominates -> auto-routing is fine
    ([0.90, 0.04, 0.03, 0.03], "billing"),
    ([0.04, 0.88, 0.05, 0.03], "technical"),
    # near-ties: belief is basically split 4 ways -> argmax is a coin flip
    ([0.26, 0.25, 0.25, 0.24], "unknown"),   # true answer turned out to be 'account'
    ([0.30, 0.28, 0.22, 0.20], "unknown"),   # true answer turned out to be 'technical'
    ([0.27, 0.26, 0.24, 0.23], "unknown"),   # true answer turned out to be 'shipping'
]

# What the near-tie tickets ACTUALLY were (revealed later by a human).
# This is here only to show that the buggy router's confident pick was wrong.
GROUND_TRUTH = {2: "account", 3: "technical", 4: "shipping"}


if __name__ == "__main__":
    print("buggy router: always routes to the top class\n")
    wrong = 0
    for idx, (probs, expected) in enumerate(CASES):
        pick = route(probs)
        picked_team = TEAMS[pick]
        lead = max(probs)
        line = f"case {idx}: probs={probs} -> ROUTE TO {picked_team} ({lead:.0%})"
        if idx in GROUND_TRUTH:
            truth = GROUND_TRUTH[idx]
            ok = "CORRECT" if picked_team == truth else "WRONG"
            if picked_team != truth:
                wrong += 1
            line += f"   [near-tie; truth was {truth}: {ok}]"
        print(line)

    print(f"\nThe router committed on ALL {len(CASES)} cases.")
    print(f"On the near-ties it guessed wrong {wrong} of {len(GROUND_TRUTH)} times.")
    print("A 26% 'winner' among 4 teams is a coin flip wearing a decision's clothes.")
