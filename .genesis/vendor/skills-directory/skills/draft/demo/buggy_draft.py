#!/usr/bin/env python3
"""
buggy_draft.py

The failure mode: a central planner hands out tasks without knowing
what each worker actually costs to do them right now.

Here the "planner" uses round-robin: task 0 to worker 0, task 1 to
worker 1, and so on. It feels fair. It ignores reality.

There is a hidden per-worker per-task cost matrix. Each worker is
genuinely cheap at some tasks and expensive at others (different
skills, different current load). Round-robin is blind to all of it,
so it routinely drops an expensive task on the wrong worker.

Run:  python3 buggy_draft.py
"""

import random

random.seed(7)

# ----------------------------------------------------------------------
# Hidden ground truth: cost[worker][task].
# Lower is better. This is each worker's PRIVATE knowledge of what the
# job would actually cost them right now. A central planner does not
# see it.
# ----------------------------------------------------------------------
WORKERS = ["w0", "w1", "w2", "w3"]
TASKS = ["t0", "t1", "t2", "t3"]

# Built so the obvious round-robin diagonal is a trap: the diagonal
# (w_i -> t_i) is loaded with expensive entries, while cheap options
# sit just off-diagonal.
COST = {
    "w0": {"t0": 90, "t1": 10, "t2": 40, "t3": 35},
    "w1": {"t0": 12, "t1": 88, "t2": 30, "t3": 33},
    "w2": {"t0": 38, "t1": 31, "t2": 95, "t3": 11},
    "w3": {"t0": 34, "t1": 36, "t2": 13, "t3": 92},
}

# Each worker can take at most one task this round (capacity = 1).
CAPACITY = 1


def round_robin_assign(workers, tasks):
    """Central naive planner: i-th task to i-th worker. Blind to cost."""
    assignment = {}
    for i, task in enumerate(tasks):
        worker = workers[i % len(workers)]
        assignment[task] = worker
    return assignment


def total_cost(assignment):
    return sum(COST[w][t] for t, w in assignment.items())


def main():
    print("=" * 60)
    print("NAIVE CENTRAL ASSIGNMENT (round-robin, cost-blind)")
    print("=" * 60)

    assignment = round_robin_assign(WORKERS, TASKS)

    print("\nWho got what:")
    for task in TASKS:
        w = assignment[task]
        print(f"  {task} -> {w}   (real cost {COST[w][task]})")

    tc = total_cost(assignment)
    print(f"\nTotal cost of this plan: {tc}")

    # Show the damage: which worker got a task far above its cheapest option.
    print("\nWhere it went wrong:")
    worst_task, worst_worker, worst_gap = None, None, -1
    for task in TASKS:
        w = assignment[task]
        cheapest_for_task = min(COST[ww][task] for ww in WORKERS)
        gap = COST[w][task] - cheapest_for_task
        if gap > worst_gap:
            worst_task, worst_worker, worst_gap = task, w, gap
    print(
        f"  {worst_task} went to {worst_worker} at cost "
        f"{COST[worst_worker][worst_task]}, "
        f"but the cheapest worker could do it for "
        f"{min(COST[ww][worst_task] for ww in WORKERS)}."
    )
    print(f"  That single mismatch wastes {worst_gap} cost units.")

    print(
        "\nThe planner never asked what each worker actually costs.\n"
        "It assigned by position. Expensive work landed on the wrong desks."
    )
    print(f"\nNAIVE_TOTAL_COST = {tc}")


if __name__ == "__main__":
    main()
