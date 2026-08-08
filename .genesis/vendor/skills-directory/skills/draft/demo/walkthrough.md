# Walkthrough: /draft catching a bad allocation in real time

This narrates what happens when you point /draft at a pool of workers and a
batch of tasks. Both scripts below were run with python3; the output pasted in
is the actual stdout, not a sketch.

## 1. The naive plan and its inflated cost

We have four workers and four tasks. There is a hidden cost matrix - each
worker privately knows what each task would cost it. The central planner does
not see that matrix, so it falls back on round-robin: task 0 to worker 0, task
1 to worker 1, and so on. Fair-looking. Cost-blind.

Running `python3 buggy_draft.py`:

```
============================================================
NAIVE CENTRAL ASSIGNMENT (round-robin, cost-blind)
============================================================

Who got what:
  t0 -> w0   (real cost 90)
  t1 -> w1   (real cost 88)
  t2 -> w2   (real cost 95)
  t3 -> w3   (real cost 92)

Total cost of this plan: 365

Where it went wrong:
  t2 went to w2 at cost 95, but the cheapest worker could do it for 13.
  That single mismatch wastes 82 cost units.

The planner never asked what each worker actually costs.
It assigned by position. Expensive work landed on the wrong desks.

NAIVE_TOTAL_COST = 365
```

The matrix was built so the round-robin diagonal is a trap. Every worker is
expensive at the task that happens to sit at its own index, and cheap at one
just off it. Position-based assignment walks straight into the expensive
diagonal and totals 365. The cheap options were right there, one desk over.

## 2. Publish the tasks and collect bids

/draft does not assign from the center. It publishes each open task and asks
every free worker for a bid equal to its true cost. The low bidder for each
task is the worker for whom that task is genuinely cheapest right now.

When two tasks both want the same cheap worker, /draft gives it to the task
where that worker has the bigger advantage (its bid furthest below the
next-best bid) and lets the displaced task re-bid among whoever is still free.
That displacement is the price signal doing its job.

## 3. Award to the best offers, with conflict resolution

Running `python3 solution.py`:

```
============================================================
MARKET ALLOCATION (/draft): workers bid their true cost
============================================================

Bidding settled in 1 round(s).

Final awards (task -> winning worker @ winning bid):
  t0 -> w1   (bid/true cost 12)
  t1 -> w0   (bid/true cost 10)
  t2 -> w3   (bid/true cost 13)
  t3 -> w2   (bid/true cost 11)

Naive round-robin total cost : 365
Market allocation total cost : 46
Savings                      : 319  (87% lower)

============================================================
PASS: market cost 46 beats naive 365,
      matches the true optimum 46, no worker overloaded.
============================================================
```

## 4. The result

Every task moved to the worker who actually does it cheapest. t0 went to w1
(12, not w0's 90), t1 to w0 (10), t2 to w3 (13, not w2's 95), t3 to w2 (11).
Total cost fell from 365 to 46 - an 87% drop - and no worker took more than its
capacity of one task.

The regression checks in solution.py prove three things, not just print a happy
number: every task is awarded exactly once, no worker is double-awarded, and
the market total equals the brute-forced true optimum (46). The market found
the best possible assignment without any central planner ever holding the cost
matrix. Each worker volunteered its own private number, and the cheap plan fell
out of the offers.

That is the whole point: the planner that must know everything is the
bottleneck and the source of the error. Let workers bid their true cost, take
the best offer, and the allocation organizes itself.
