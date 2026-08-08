"""
solution.py

The fix: learn a trust network from outcomes.

We keep a trust weight for every pair of agents. Start everyone equal.
After each collaboration:
  - good outcome  -> reinforce the link between that pair
  - bad outcome   -> weaken the link
  - every round   -> all links decay a little, so stale evidence fades
Weights are capped so no link can explode.

When choosing who to pair next, we mostly route work toward the
strongest known links, but keep a slice of exploration so we do not
lock onto one early winner and starve undiscovered partnerships.

Over many rounds the weights converge toward the hidden affinity truth:
the genuinely strong pairs float to the top, the clashing pairs sink.
The orchestrator then beats the naive baseline by a wide margin.

Run:  python3 solution.py
"""

import random

random.seed(7)

AGENTS = ["A", "B", "C", "D", "E", "F"]

# --- learning knobs ------------------------------------------------------
REINFORCE = 0.06   # how much a good co-outcome strengthens a link
WEAKEN = 0.06      # how much a bad co-outcome weakens a link
DECAY = 0.01       # per-round pull of every link back toward neutral
W_MIN = 0.0        # floor: a link cannot go negative
W_MAX = 1.0        # cap: a link cannot explode past this
NEUTRAL = 0.5      # starting / decay-target trust for every pair
EXPLORE = 0.15     # fraction of rounds we pick a random pair to learn more
SHARPNESS = 4      # how strongly soft-routing favors higher-trust links
# -------------------------------------------------------------------------


def build_truth():
    """Same hidden ground truth as the buggy demo."""
    truth = {}
    for i in range(len(AGENTS)):
        for j in range(i + 1, len(AGENTS)):
            truth[(AGENTS[i], AGENTS[j])] = 0.35
    truth[("A", "C")] = 0.90
    truth[("B", "E")] = 0.85
    truth[("D", "F")] = 0.80
    truth[("A", "B")] = 0.10
    truth[("C", "E")] = 0.12
    return truth


def key(x, y):
    return tuple(sorted((x, y)))


def collaborate(pair, truth):
    p = truth[key(*pair)]
    return 1 if random.random() < p else 0


def init_weights():
    """Equal, neutral trust for every pair to start."""
    w = {}
    for i in range(len(AGENTS)):
        for j in range(i + 1, len(AGENTS)):
            w[(AGENTS[i], AGENTS[j])] = NEUTRAL
    return w


def clamp(v):
    return max(W_MIN, min(W_MAX, v))


def update_link(weights, pair, outcome):
    """Strengthen on co-success, weaken on failure."""
    k = key(*pair)
    if outcome == 1:
        weights[k] = clamp(weights[k] + REINFORCE)
    else:
        weights[k] = clamp(weights[k] - WEAKEN)


def decay_all(weights):
    """Unused or not, every link is pulled gently back toward neutral.
    Links that keep getting reinforced stay high; stale ones fade."""
    for k in weights:
        weights[k] += (NEUTRAL - weights[k]) * DECAY


def pick_pair(weights):
    """
    Route toward strong links, but softly. Two guards against lock-in:
      1. with probability EXPLORE, pick a totally random pair so every
         partnership keeps getting sampled and can be discovered.
      2. otherwise sample a pair with probability proportional to its
         trust weight raised to SHARPNESS. This favors proven pairs
         WITHOUT collapsing onto a single early winner, so all genuinely
         strong partnerships get found, not just the first one.
    """
    if random.random() < EXPLORE:
        a, b = random.sample(AGENTS, 2)
        return (a, b)
    pairs = list(weights.keys())
    scores = [weights[p] ** SHARPNESS + 1e-9 for p in pairs]
    total = sum(scores)
    r = random.random() * total
    acc = 0.0
    for p, s in zip(pairs, scores):
        acc += s
        if r <= acc:
            return p
    return pairs[-1]


def learning_orchestrator(truth, rounds):
    weights = init_weights()
    good = 0
    history = []
    for r in range(rounds):
        pair = pick_pair(weights)
        outcome = collaborate(pair, truth)
        good += outcome
        update_link(weights, pair, outcome)
        decay_all(weights)
        if (r + 1) in (50, 200, 1000, rounds):
            history.append((r + 1, snapshot(weights)))
    return good / rounds, weights, history


def snapshot(weights):
    return dict(weights)


def naive_baseline(truth, rounds):
    good = 0
    for _ in range(rounds):
        a, b = random.sample(AGENTS, 2)
        good += collaborate((a, b), truth)
    return good / rounds


def top_links(weights, n=3):
    return sorted(weights.items(), key=lambda kv: kv[1], reverse=True)[:n]


def main():
    truth = build_truth()
    rounds = 4000

    # baseline uses the same seed stream position; reseed both fairly
    random.seed(7)
    naive_rate = naive_baseline(truth, rounds)

    random.seed(7)
    learned_rate, weights, history = learning_orchestrator(truth, rounds)

    print("=" * 60)
    print("LEARNED TRUST NETWORK vs NAIVE EQUAL TRUST")
    print("=" * 60)
    print(f"naive   avg success rate : {naive_rate:.3f}")
    print(f"learned avg success rate : {learned_rate:.3f}")
    print(f"improvement              : {learned_rate - naive_rate:+.3f}")
    print()

    print("Trust weights climbing/fading over rounds:")
    watch = [("A", "C"), ("B", "E"), ("D", "F"), ("A", "B"), ("C", "E")]
    header = "round | " + " | ".join(f"{a}+{b}" for a, b in watch)
    print(header)
    print("-" * len(header))
    for r, snap in history:
        cells = " | ".join(f"{snap[p]:.2f} " for p in watch)
        print(f"{r:5d} | {cells}")
    print()
    print("(A+C, B+E, D+F are the genuinely strong pairs -> climb)")
    print("(A+B, C+E genuinely clash -> fade toward floor)")
    print()

    learned_top = [p for p, _ in top_links(weights, 3)]
    true_top = sorted(truth.items(), key=lambda kv: kv[1], reverse=True)[:3]
    true_top_pairs = [p for p, _ in true_top]

    print("Top 3 learned links :", learned_top)
    print("Top 3 true-affinity :", true_top_pairs)
    print()

    # ---- regression checks ----------------------------------------------
    assert learned_rate > naive_rate + 0.20, (
        "learned routing should beat naive by a wide margin"
    )
    assert set(learned_top) == set(true_top_pairs), (
        "top learned links should match the genuinely high-affinity pairs"
    )
    # clashing pairs must have sunk below neutral
    assert weights[("A", "B")] < NEUTRAL, "clashing pair A+B should fade"
    assert weights[("C", "E")] < NEUTRAL, "clashing pair C+E should fade"
    # strong pairs must have risen above neutral
    assert weights[("A", "C")] > NEUTRAL, "strong pair A+C should climb"

    print("PASS: learned trust beats naive by a wide margin AND")
    print("PASS: the top learned links match the true strong partnerships.")


if __name__ == "__main__":
    main()
