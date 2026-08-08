---
name: draft
description: Use when you need to assign tasks across many workers or agents without a central planner who must know everyone's load and skill, to load-balance using each worker's private knowledge of its own state, to let the best-suited worker self-select a task, to replace manual or round-robin task assignment, or to allocate jobs by real fitness/cost instead of position or guesswork. Publish the task, let capable workers bid their true cost, award to the best offer.
title: Draft - bid-and-claim task allocation
one_liner: Workers bid their true cost for a task; the best offer wins; allocation self-organizes with no all-knowing planner.
outcome: Tasks land on the workers who can do them cheapest/best right now, total cost drops, and no central planner has to track everyone's state.
tags: [allocation, load-balancing, scheduling, coordination, self-organizing, multi-agent]
works_with: [claude, cursor, windsurf, hermes, codex, any-agent]
composable: true
inputs: A set of open tasks with requirements, and a set of workers/agents that each privately know their own current cost or fitness for those tasks.
outputs: An assignment of tasks to workers (task -> winning worker @ winning bid) with materially lower total cost than position-based assignment, plus leftover free workers for the next round.
---

# /draft

A central planner that hands out every task has to know everything: each
worker's current load, skill, and cost, at the moment of assignment. It
never has that. So it falls back on something cheap and blind - position,
round-robin, "next free slot" - and routinely drops expensive work on the
wrong desk. The planner is also a bottleneck: every decision routes through
it.

Flip it. Publish the task. Let each capable worker offer a bid that reflects
what the task would truly cost it right now - low if it is idle, skilled, or
well-suited; high if it is busy or a bad fit. Award the task to the best
offer. Workers self-select. The private knowledge that no planner could ever
collect surfaces as bids, and the cheap assignment falls out of the market
instead of being computed at the center.

## When to use this

Reach for /draft when you hear or think:

- "Which agent/worker should take this job?"
- "I'm assigning tasks round-robin and it feels wasteful."
- "The scheduler doesn't know who's actually busy."
- "Spread this batch of work across the pool efficiently."
- "Let the best-suited worker pick it up instead of me deciding."
- "Load-balance these jobs without a master that tracks everyone."

Do NOT use it when there is a single worker (no one to bid against), or when
tasks must be done in a strict fixed order or by one mandated owner (then
allocation is not a choice and a market just adds overhead).

## The procedure

1. Publish the task and its requirements so every worker can see what is
   being offered and judge whether it qualifies.
2. Each capable worker computes its own true cost/fitness for that task
   right now - factoring in its current load, skill, and state. This is
   private knowledge only it has.
3. Each capable worker submits a bid equal to that true cost (low bid = I am
   cheap/idle/well-suited; high bid = I am busy/ill-suited). Workers that
   cannot do it do not bid.
4. Award the task to the best (lowest) bid.
5. Handle ties and no-bids: break ties deterministically (e.g. lowest worker
   id, or coin flip); if no one bids, the task stays open - raise its reward,
   relax its requirements, or escalate it.
6. When two tasks want the same worker, give that worker to the task where it
   has the bigger advantage (its bid is furthest below the next-best bid),
   and let the displaced task re-bid among the remaining free workers.
7. Losers stay free - they did not win this task, so they remain available to
   bid on other open tasks. Nobody is consumed by losing.
8. Optionally re-run rounds as loads change: as workers finish and free up,
   their costs drop, so re-publishing remaining work lets the allocation
   re-balance itself.
9. Guard against dishonest lowballing: a worker that bids below its real cost
   to grab work it cannot deliver poisons the whole pool. Track follow-through
   and penalize bidders who win then fail, so the cheapest path to winning is
   to bid your true cost.

## Output format

```
Final awards (task -> winning worker @ winning bid):
  t0 -> w1   (bid 12)
  t1 -> w0   (bid 10)
  t2 -> w3   (bid 13)
  t3 -> w2   (bid 11)

Total cost: 46   (naive position-based: 365)
Free workers remaining: none
```

State the assignment, each winning bid, the resulting total, the baseline it
beat, and which workers are still free for the next round.

## Composition (loops)

/draft is the allocation step inside a /loop:

```
loop over rounds:
    open_tasks   = tasks not yet done
    free_workers = workers not at capacity
    publish(open_tasks)                  # step 1
    bids = collect_bids(free_workers)    # steps 2-3: each bids true cost
    awards = award_best_bids(bids)       # steps 4-6: best offer wins, resolve conflicts
    dispatch(awards)                     # winners start work
    # losers stay free (step 7); re-loop as loads change (step 8)
    if no_bids_on(open_tasks):
        raise_reward_or_escalate()       # step 5
```

A /loop keeps publishing whatever is still open and collecting fresh bids;
/draft decides who wins each round. The planner inside the loop never needs
the cost matrix - it only collects offers and picks the best.

## Pitfalls

- A worker lowballs to win, then fails or delivers late. One dishonest bid
  drags the whole allocation. Require follow-through and penalize win-then-fail.
- Re-running the market too often causes thrash: tasks ping-pong between
  workers every round and nothing finishes. Re-bid only when loads actually
  change materially, or add hysteresis.
- Starvation of hard tasks nobody bids on. If a task is costly for everyone,
  it sits open forever. Raise its reward over time, split it, or relax
  requirements until it clears.
- Treating the lowest number as automatically best when bids are not
  comparable (different units, hidden externalities). Make all bidders price
  the same thing.

See references/logic.md for why bidding with private cost beats central
assignment, why honest bids are the worker's best move, and what breaks when
bids are dishonest.
