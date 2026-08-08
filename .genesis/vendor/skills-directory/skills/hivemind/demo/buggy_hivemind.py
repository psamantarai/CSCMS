"""
buggy_hivemind.py

Failure mode: decentralized coordination WITHOUT fade.

We have a fleet of workers choosing between several paths to a goal.
Each path has a cost. Workers leave a shared mark on the path they used,
stronger when the path was cheap. Other workers are biased toward stronger
marks. So far so good.

The bug: marks NEVER fade. Whatever looked good early gets reinforced
forever. When the world changes (a path that used to be cheap becomes
expensive, or a better path appears), the swarm cannot let go. It stays
locked on the stale winner because the old marks still dominate.

Run it and watch the fleet stay stuck on the worse path.
"""

import random

random.seed(7)

# Path costs over time. Lower cost is better.
# Phase 1 (rounds 0-19): path A is best.
# Phase 2 (rounds 20+): the world shifts, path C becomes clearly best.
def cost_of(path, round_idx):
    if round_idx < 20:
        return {"A": 2.0, "B": 5.0, "C": 6.0}[path]
    else:
        return {"A": 9.0, "B": 5.0, "C": 1.0}[path]


PATHS = ["A", "B", "C"]
NUM_WORKERS = 40
ROUNDS = 60

# Shared space: a strength value per path. Everyone reads and writes this.
trail = {p: 1.0 for p in PATHS}


def choose_path(trail):
    # Pick a path with probability proportional to its mark strength.
    total = sum(trail.values())
    r = random.random() * total
    upto = 0.0
    for p in PATHS:
        upto += trail[p]
        if r <= upto:
            return p
    return PATHS[-1]


def run():
    chosen_history = []
    for rnd in range(ROUNDS):
        round_choices = {p: 0 for p in PATHS}
        for _ in range(NUM_WORKERS):
            p = choose_path(trail)
            round_choices[p] += 1
            c = cost_of(p, rnd)
            # Reinforce: cheaper path gets a bigger deposit.
            trail[p] += 1.0 / c
            # NO FADE. Marks just pile up forever.
        winner = max(round_choices, key=round_choices.get)
        chosen_history.append(winner)
    return chosen_history


if __name__ == "__main__":
    history = run()

    print("=== decentralized coordination WITHOUT fade ===")
    print("Phase 1 (rounds 0-19): best path is A (cost 2.0)")
    print("Phase 2 (rounds 20+): world shifts, best path is C (cost 1.0)")
    print()
    print("Final trail strengths:", {p: round(v, 1) for p, v in trail.items()})
    print()

    early = history[:20]
    late = history[40:]
    early_winner = max(set(early), key=early.count)
    late_winner = max(set(late), key=late.count)

    print("Most-followed path early (rounds 0-19):", early_winner)
    print("Most-followed path late  (rounds 40-59):", late_winner)
    print()

    best_late = "C"
    if late_winner != best_late:
        print("BUG: world changed at round 20. Best path is now C.")
        print("But the swarm is STILL locked on path", late_winner,
              "- stale marks never faded, so the fleet never shifted.")
    else:
        print("Swarm adapted (unexpected for this buggy version).")
