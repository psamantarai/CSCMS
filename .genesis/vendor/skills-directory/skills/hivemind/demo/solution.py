"""
solution.py

The fix: make marks FADE every round, and let a small fraction of workers
explore at random instead of always following the crowd.

With fade, old marks decay unless something keeps reinforcing them. So a
path that stops paying off loses its strength and the fleet drifts away.
With a pinch of exploration, some workers keep sampling the alternatives,
so when a new path becomes best the fleet notices and piles onto it.

Reinforcement (good paths get stronger) plus fade (stale paths weaken)
together let a leaderless fleet track a MOVING best answer. No boss, no
dispatcher, no single point of failure.

Run it: the swarm converges on the genuinely best path in each phase and
shifts when the world changes. Assertions prove it.
"""

import random

random.seed(7)


def cost_of(path, round_idx):
    if round_idx < 20:
        return {"A": 2.0, "B": 5.0, "C": 6.0}[path]
    else:
        return {"A": 9.0, "B": 5.0, "C": 1.0}[path]


PATHS = ["A", "B", "C"]
NUM_WORKERS = 40
ROUNDS = 60

FADE = 0.85          # each round, all marks keep 85% of strength
EXPLORE = 0.10       # 10% of the time a worker tries a random path
MIN_TRAIL = 0.01     # floor so a path never dies completely

trail = {p: 1.0 for p in PATHS}


def choose_path(trail):
    if random.random() < EXPLORE:
        return random.choice(PATHS)
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
            trail[p] += 1.0 / c
        # FADE: every mark decays. Stale paths weaken unless re-reinforced.
        for p in PATHS:
            trail[p] = max(MIN_TRAIL, trail[p] * FADE)
        winner = max(round_choices, key=round_choices.get)
        chosen_history.append(winner)
    return chosen_history


if __name__ == "__main__":
    history = run()

    print("=== decentralized coordination WITH fade + exploration ===")
    print("Phase 1 (rounds 0-19): best path is A (cost 2.0)")
    print("Phase 2 (rounds 20+): world shifts, best path is C (cost 1.0)")
    print()
    print("Final trail strengths:", {p: round(v, 2) for p, v in trail.items()})
    print()

    # Look at the tail of each phase, after the fleet has had time to settle.
    phase1_tail = history[10:20]
    phase2_tail = history[50:60]

    p1_winner = max(set(phase1_tail), key=phase1_tail.count)
    p2_winner = max(set(phase2_tail), key=phase2_tail.count)

    print("Most-followed path, end of phase 1 (rounds 10-19):", p1_winner)
    print("Most-followed path, end of phase 2 (rounds 50-59):", p2_winner)
    print()

    # Proof 1: the fleet finds the best path in phase 1.
    assert p1_winner == "A", f"expected A in phase 1, got {p1_winner}"
    # Proof 2: the fleet SHIFTS to the new best path after the world changes.
    assert p2_winner == "C", f"expected C in phase 2, got {p2_winner}"
    # Proof 3: the now-stale early winner is no longer dominant.
    assert trail["A"] < trail["C"], "stale path A should have faded below C"

    print("PASS: leaderless fleet converged on the best path in each phase")
    print("PASS: fleet adapted when the world changed (A -> C) with no boss")
