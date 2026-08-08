"""
buggy_bond.py

The naive failure mode: an orchestrator that trusts every collaborator
equally and never learns from outcomes.

Setup: we have a pool of agents. The world has a HIDDEN truth - some
pairs of agents genuinely work well together (high co-success rate),
most pairs are mediocre, a few actively clash. The orchestrator does
not know this map. It just needs to keep forming pairs to get work done.

The naive orchestrator picks partners at random, with equal trust for
everyone. It never notices that some pairings reliably win and others
reliably fail. So it keeps re-forming bad teams and leaves the good
partnerships undiscovered.

Run:  python3 buggy_bond.py
"""

import random

random.seed(7)

AGENTS = ["A", "B", "C", "D", "E", "F"]


def build_truth():
    """
    Hidden ground-truth affinity for each unordered pair.
    affinity = probability that this pair produces a good outcome
    when they collaborate.

    A few pairs are genuinely strong, most are mediocre, a couple clash.
    The orchestrator cannot see these numbers.
    """
    truth = {}
    for i in range(len(AGENTS)):
        for j in range(i + 1, len(AGENTS)):
            pair = (AGENTS[i], AGENTS[j])
            truth[pair] = 0.35  # default: mediocre
    # genuinely strong partnerships
    truth[("A", "C")] = 0.90
    truth[("B", "E")] = 0.85
    truth[("D", "F")] = 0.80
    # pairs that actively clash
    truth[("A", "B")] = 0.10
    truth[("C", "E")] = 0.12
    return truth


def key(x, y):
    return tuple(sorted((x, y)))


def collaborate(pair, truth):
    """Run one collaboration. Returns 1 for good outcome, 0 for bad."""
    p = truth[key(*pair)]
    return 1 if random.random() < p else 0


def naive_orchestrator(truth, rounds):
    """
    Trust everyone equally forever. Pick two distinct agents at random
    every round. Never update anything based on what happened.
    """
    good = 0
    for _ in range(rounds):
        a, b = random.sample(AGENTS, 2)
        outcome = collaborate((a, b), truth)
        good += outcome
    return good / rounds


def best_possible(truth):
    """If we always paired the single best partnership, the ceiling."""
    return max(truth.values())


def main():
    truth = build_truth()
    rounds = 4000

    rate = naive_orchestrator(truth, rounds)
    ceiling = best_possible(truth)

    print("=" * 60)
    print("NAIVE ORCHESTRATOR: equal trust, no learning")
    print("=" * 60)
    print(f"rounds run            : {rounds}")
    print(f"avg success rate      : {rate:.3f}")
    print(f"best pair's true rate : {ceiling:.3f}  (the ceiling)")
    print(f"gap left on the table : {ceiling - rate:.3f}")
    print()
    print("The hidden strong partnerships were:")
    print("  A+C = 0.90,  B+E = 0.85,  D+F = 0.80")
    print("The orchestrator never found them. It kept rolling dice,")
    print("re-forming clashing teams (A+B=0.10, C+E=0.12) just as often")
    print("as winning ones. Equal trust = throwing away free success.")


if __name__ == "__main__":
    main()
