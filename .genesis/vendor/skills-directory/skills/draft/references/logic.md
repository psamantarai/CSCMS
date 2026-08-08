# Why bidding beats central assignment

## The information problem

A central planner that assigns every task needs one thing it can never fully
have: the true cost for every worker to do every task, at this exact moment.
That cost is not fixed. It moves with each worker's current load, its skill on
this specific task, what it is already mid-way through, how tired its queue is.
The only entity that knows a worker's real cost right now is the worker itself.

So the planner guesses. It uses a proxy it can see from the center - position
in a list, round-robin order, "next idle slot" - and assigns on that. The
proxy is blind to real cost. That is why round-robin can hand a task to a
worker that costs 95 when another worker two desks over would have done it for
13. The planner was never wrong on purpose. It just could not see.

## What bidding changes

Bidding moves the decision to where the information lives. Instead of pulling
every worker's hidden state into the center (impossible, and stale the moment
you collect it), you publish the task and ask each worker one question: what
would this cost you, right now? The worker answers with a bid. It does not have
to explain its load or skill or queue - the single number folds all of that in.

Now the center's job shrinks to something it can actually do well: collect the
offers and take the best one. It does not compute the cheap assignment. The
market reveals it. The planner stops being an all-knowing oracle and becomes a
simple referee.

## Why the best bid is the globally cheaper choice

When every capable worker prices the same task and you take the lowest bid, you
are picking the worker for whom this task is genuinely cheapest right now. Do
that across all tasks, and resolve conflicts by who has the bigger advantage,
and the totals fall out near the global minimum without the center ever
enumerating combinations. The contested-worker rule matters: when two tasks
both want the same cheap worker, the one that needs it most (its bid is
furthest below its next option) keeps it, and the other is pushed to its
second-cheapest worker. That displacement is exactly the price signal - the
contested worker is effectively "more expensive" for the task that valued it
less, so that task moves on. Repeat until nothing is contested and you land on
the assignment a perfect planner would have computed, except no planner had to.

## Why a worker should bid its true cost

This is the part that makes the whole thing hold together. A worker has three
moves: bid its true cost, bid too low, or bid too high.

- Bid too high and it loses tasks it should have won. It sits idle while work
  it was well-suited for goes to a worse fit. It loses out.
- Bid too low and it wins tasks it cannot actually afford. It either eats the
  loss, delivers late, or fails - and in a system that tracks follow-through,
  failing after winning costs it future work. Cheating to win is a trap.
- Bid the true cost and it wins exactly the tasks where it really is the best
  choice, and loses the ones where someone else is better. That is the best
  outcome available to it.

When bidding your real number is your own best strategy, you do not need to
police honesty hard - the incentives line up. The worker volunteers the
private information the planner could never extract, because telling the truth
is what serves the worker.

## What breaks when bids are dishonest

The honesty is load-bearing. If a worker can win by lowballing and walk away
from the consequences, the market poisons:

- The cheapest assignment on paper becomes the most expensive in reality,
  because the "cheap" winner cannot deliver.
- Honest workers who bid real costs lose to liars and stop participating.
- The signal that made the whole thing work - bid equals true cost - goes
  noisy, and the center is back to guessing.

The fix is to close the loop: measure delivery, and make winning-then-failing
cost more than bidding honestly and losing. Once the penalty for a bad bid
outweighs the prize for grabbing work you cannot do, truth is the cheapest
strategy again.

## Mental model

Stop telling workers what to do; publish the work and let the one it costs the least claim it.
