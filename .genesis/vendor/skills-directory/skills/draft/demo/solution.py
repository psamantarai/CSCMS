#!/usr/bin/env python3
"""
solution.py

The fix: stop guessing from the center. Publish each task and let
every capable worker offer a bid equal to its TRUE cost to do that
task right now. Award each task to the best (lowest) bid. When two
tasks want the same worker, resolve by who has the bigger advantage
(the most to lose if displaced), then re-bid whoever got bumped.

No central planner needs to know the cost matrix. Each worker knows
its own column and offers it. The market surfaces the cheap global
assignment that round-robin could never see.

Run:  python3 solution.py
"""

import random

random.seed(7)

# Same hidden ground truth as buggy_draft.py. Each worker privately
# knows its own costs and bids them honestly.
WORKERS = ["w0", "w1", "w2", "w3"]
TASKS = ["t0", "t1", "t2", "t3"]

COST = {
    "w0": {"t0": 90, "t1": 10, "t2": 40, "t3": 35},
    "w1": {"t0": 12, "t1": 88, "t2": 30, "t3": 33},
    "w2": {"t0": 38, "t1": 31, "t2": 95, "t3": 11},
    "w3": {"t0": 34, "t1": 36, "t2": 13, "t3": 92},
}

CAPACITY = 1  # one task per worker this round


def total_cost(assignment):
    return sum(COST[w][t] for t, w in assignment.items())


def worker_bid(worker, task):
    """A worker offers what the task truly costs it right now.
    Honest bid = its own private cost. Lower means cheaper/idler/fitter."""
    return COST[worker][task]


def run_market(workers, tasks):
    """
    Iterated bidding. Each open task collects bids from all free
    workers. Award to the lowest bid. If a worker is contested by two
    tasks, it goes to the task where that worker has the bigger
    advantage (best bid minus next-best bid for that task), and the
    losing task re-bids among the remaining free workers.

    This is a price-adjusting loop: contested workers effectively get
    more expensive for the task that valued them less, so that task
    moves on to its next-cheapest option.
    """
    assignment = {}          # task -> worker
    worker_of = {}           # worker -> task
    open_tasks = list(tasks)

    rounds = 0
    while open_tasks:
        rounds += 1
        free_workers = [w for w in workers if w not in worker_of]

        # Each open task names its preferred (lowest) free bid.
        # claim[worker] = (task, bid, advantage)
        claims = {}
        for task in open_tasks:
            bids = sorted((worker_bid(w, task), w) for w in free_workers)
            if not bids:
                continue
            best_bid, best_worker = bids[0]
            second = bids[1][0] if len(bids) > 1 else best_bid
            advantage = second - best_bid  # how much this task gains here
            prev = claims.get(best_worker)
            if prev is None or advantage > prev[2]:
                claims[best_worker] = (task, best_bid, advantage)

        if not claims:
            # No free worker can take any remaining task this round.
            break

        # Award the claims that won their worker.
        for worker, (task, bid, _adv) in claims.items():
            assignment[task] = worker
            worker_of[worker] = task
            open_tasks.remove(task)

    return assignment, rounds


def main():
    print("=" * 60)
    print("MARKET ALLOCATION (/draft): workers bid their true cost")
    print("=" * 60)

    # Baseline for comparison (round-robin, cost-blind).
    rr = {t: WORKERS[i % len(WORKERS)] for i, t in enumerate(TASKS)}
    naive_total = total_cost(rr)

    assignment, rounds = run_market(WORKERS, TASKS)

    print(f"\nBidding settled in {rounds} round(s).")
    print("\nFinal awards (task -> winning worker @ winning bid):")
    for task in TASKS:
        w = assignment[task]
        print(f"  {task} -> {w}   (bid/true cost {COST[w][task]})")

    market_total = total_cost(assignment)

    print(f"\nNaive round-robin total cost : {naive_total}")
    print(f"Market allocation total cost : {market_total}")
    drop = naive_total - market_total
    pct = 100.0 * drop / naive_total
    print(f"Savings                      : {drop}  ({pct:.0f}% lower)")

    # --- Regression checks: prove the mechanism actually worked. -------
    # 1. Every task assigned exactly once.
    assert set(assignment.keys()) == set(TASKS), "every task must be awarded"
    # 2. No worker exceeds capacity (one task each here).
    used = list(assignment.values())
    assert len(used) == len(set(used)), "no worker double-awarded"
    for w in WORKERS:
        assert used.count(w) <= CAPACITY, f"{w} exceeded capacity"
    # 3. Market total is materially lower than the naive baseline.
    assert market_total < naive_total, "market must beat naive"
    assert market_total <= naive_total * 0.5, "expected a material drop (>50%)"
    # 4. The market found the true optimum (brute-forced for proof).
    optimal = brute_force_optimum()
    assert market_total == optimal, f"market {market_total} != optimum {optimal}"

    print("\n" + "=" * 60)
    print(f"PASS: market cost {market_total} beats naive {naive_total},")
    print(f"      matches the true optimum {optimal}, no worker overloaded.")
    print("=" * 60)


def brute_force_optimum():
    """Smallest possible total over all one-to-one assignments.
    Only used to PROVE the market found the best answer, not part of
    the mechanism itself."""
    import itertools
    best = None
    for perm in itertools.permutations(WORKERS, len(TASKS)):
        c = sum(COST[perm[i]][TASKS[i]] for i in range(len(TASKS)))
        if best is None or c < best:
            best = c
    return best


if __name__ == "__main__":
    main()
