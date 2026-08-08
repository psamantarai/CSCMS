# /clarity in real time - the support-ticket router

This is a real session you can replay. The router lives in `buggy_clarity.py`.
Run it once, then watch /clarity work. Do NOT read the fix ahead.

## Reproduce

    $ python3 buggy_clarity.py
    buggy router: always routes to the top class

    case 0: probs=[0.9, 0.04, 0.03, 0.03] -> ROUTE TO billing (90%)
    case 1: probs=[0.04, 0.88, 0.05, 0.03] -> ROUTE TO technical (88%)
    case 2: probs=[0.26, 0.25, 0.25, 0.24] -> ROUTE TO billing (26%)   [near-tie; truth was account: WRONG]
    case 3: probs=[0.3, 0.28, 0.22, 0.2] -> ROUTE TO billing (30%)   [near-tie; truth was technical: WRONG]
    case 4: probs=[0.27, 0.26, 0.24, 0.23] -> ROUTE TO billing (27%)   [near-tie; truth was shipping: WRONG]

    The router committed on ALL 5 cases.
    On the near-ties it guessed wrong 3 of 3 times.
    A 26% 'winner' among 4 teams is a coin flip wearing a decision's clothes.

Cases 0 and 1 are fine: one team clearly owns the belief. Cases 2-4 are the
failure. A 26% "winner" out of four teams barely beats the others - the model
is essentially saying "I have no idea," and the router is hearing "billing."
It auto-commits anyway, and on all three near-ties it routed to the wrong team.

The junior move is to trust argmax everywhere. /clarity won't.

## Step 1 - look at the whole spread, not just the top

argmax throws away everything except the winner. But [0.90, 0.04, 0.03, 0.03]
and [0.26, 0.25, 0.25, 0.24] both "win" with class 0 - yet they mean opposite
things. The first is a near-certainty. The second is a four-way tie. The top
value alone cannot tell them apart. The SHAPE of the whole distribution can.

## Step 2 - measure how evenly the belief is split

/clarity collapses the whole distribution into one 0..1 number:

    0.0  = all belief on one team        (concentrated -> safe to commit)
    1.0  = belief perfectly even         (a tie -> you actually know nothing)

It normalizes by the number of teams so the number means the same thing whether
you're choosing among 4 teams or 40 intents.

    case 0: [0.90, 0.04, 0.03, 0.03] -> spread 0.31   (concentrated)
    case 2: [0.26, 0.25, 0.25, 0.24] -> spread 1.00   (a near-perfect tie)

The spread number sees instantly what argmax was blind to.

## Step 3 - commit only when one option clearly dominates

Set a line. Below it, the belief is concentrated enough to act. Above it, the
options are too close together to tell apart, so committing is just guessing.
Here the line is 0.55. Below: commit. Above: escalate.

## Step 4 - escalate instead of guessing

    $ python3 solution.py
    /clarity router: commit only when spread <= 0.55

    case 0: probs=[0.9, 0.04, 0.03, 0.03]  spread=0.31  -> COMMIT to billing
    case 1: probs=[0.04, 0.88, 0.05, 0.03]  spread=0.36  -> COMMIT to technical
    case 2: probs=[0.26, 0.25, 0.25, 0.24]  spread=1.00  -> ESCALATE (belief too evenly split -> ask a human / gather more)
    case 3: probs=[0.3, 0.28, 0.22, 0.2]  spread=0.99  -> ESCALATE (belief too evenly split -> ask a human / gather more)
    case 4: probs=[0.27, 0.26, 0.24, 0.23]  spread=1.00  -> ESCALATE (belief too evenly split -> ask a human / gather more)

    All assertions passed:
      - confident cases committed
      - near-tie cases escalated instead of guessing

The confident tickets still auto-route - /clarity does not slow down the easy
cases. The near-ties now go to a human instead of being routed wrong three out
of three times. We did not pretend to know something we didn't.

## What just happened

We stopped reading only the top number and started reading the whole shape of
the belief. One 0..1 measure separated "I'm sure" from "this is a coin flip,"
and we only committed when one option clearly dominated. That is the whole skill.
