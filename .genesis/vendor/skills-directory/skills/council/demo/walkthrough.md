# Walkthrough: /council on a launch-strategy decision

Senior engineer, thinking out loud. We have to pick a go-to-market strategy
for a product launch. The decision is expensive and hard to walk back once the
market sees our move, so a single confident answer is not good enough. We run
/council.

## The decision and the options

DECISION: which launch strategy do we commit to?

Three concrete options, each with a real downside:
- aggressive_pricing: undercut the market hard.
- premium_positioning: charge more, compete on quality not price.
- bundle_play: package products together.

The outcome of each depends on how the competitor responds. They can ignore us,
match us, or undercut us. That is the opposition. A strategy is not a number; it
is a number that depends on a move we do not control.

## The naive optimistic pick, and why it blows up

First, the failure mode. The naive picker grabs the strategy with the highest
single best outcome and assumes the world cooperates.

Real output from `buggy_council.py`:

```
=== buggy_council: pick by best-case (optimistic) ===

Payoff table (our strategy vs competitor response):
  strategy                  competitor_ignores    competitor_matches  competitor_undercuts
  aggressive_pricing                       100                   -40                   -70
  premium_positioning                       55                    30                    20
  bundle_play                               70                    10                   -10

Optimistic picker chose: aggressive_pricing
It assumed best case score: 100

But the competitor is not asleep. Their best counter-move:
  response = competitor_undercuts
  our ACTUAL outcome = -70

BLOWUP: the 'best' strategy loses -70 once the opponent
        plays smart. We optimized for a world that does not exist.

Lesson: best-case selection ignores the adversary. The number
that sold us the plan (100) never gets realized.
```

aggressive_pricing has the shiniest cell: 100. That is what sells it in the
meeting. But that 100 only happens if the competitor ignores us, which a smart
competitor will not do. Their best counter is to undercut, and we land at -70.
We chose for a world where the opponent is asleep.

## Staging the opposition

Now /council. Proposer argues for a strategy; the strongest critic plays the
competitor and always picks the response that hurts that strategy most. We do
not let the critic be lazy - we assume they find the worst column every time.

For each strategy we compute the floor: the outcome under the competitor's
strongest counter.

## Evaluating worst cases and picking the stable choice

Real output from `solution.py`:

```
=== solution: pick by best worst-case, then verify stability ===

Worst-case outcome per strategy (opponent plays to hurt us):
  aggressive_pricing     worst =   -70  (via competitor_undercuts)
  premium_positioning    worst =    20  (via competitor_undercuts)
  bundle_play            worst =   -10  (via competitor_undercuts)

Robust pick (best worst-case): premium_positioning
  guaranteed floor: 20
  opponent's strongest counter: competitor_undercuts

Stability check at (premium_positioning, competitor_undercuts):
  payoff here = 20
  proposer cannot improve by switching strategy: True
  opponent cannot hurt us more by switching response: True
  => STABLE: True

Compare under a smart opponent:
  optimistic choice aggressive_pricing -> real outcome -70
  robust choice    premium_positioning -> real outcome 20

Opponent's best hold-down value: 20
Our secured floor:               20

PASS: robust choice 'premium_positioning' holds at 20 under the worst attack,
      it is stable, and it beats the optimistic pick that lost -70.
```

Read the floors: aggressive_pricing floors at -70, bundle_play at -10,
premium_positioning at +20. The highest floor wins. premium_positioning is the
only option that still makes money when the competitor plays its best counter.

## The stability check

The candidate is premium_positioning paired with competitor_undercuts. Two
questions:

- Can we do better by switching strategy while they keep undercutting? No - 20
  is the best we can get in that column.
- Can the competitor hurt us more by switching response while we hold
  premium_positioning? No - 20 is already the worst row for us.

Both no. Settled. Notice the two sides meet at the same number: the most the
competitor can hold us to is 20, and the most we can guarantee ourselves is 20.
When those meet, nobody can improve by walking away from the choice. That is a
decision that will not unravel the first time someone reconsiders.

## The result

CHOICE: premium_positioning
  survives: competitor undercuts, we still net +20.
  runner-up: bundle_play loses because its floor is -10 (it bleeds when
  undercut), and aggressive_pricing is worse still at -70.
STABILITY: settled. Neither side gains by deviating.

The optimistic answer (aggressive_pricing) would have lost 70. The stress-tested
answer banks 20 under the same smart opponent. Same table, opposite outcome -
the difference is entirely whether we judged by the ceiling or the floor.
