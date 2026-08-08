# Why flow-based authority works, and why counting does not

## The failure of counting

Counting endorsements treats every nod as equal. That has one fatal
property: the cost of a nod is flat and low. If I can create cheap
nodes, I can manufacture nods at will, and the count of any target I
choose goes up linearly with how many puppets I spin up. There is no
term in the formula that asks "who gave this nod, and were they worth
listening to?" So the metric is exactly as trustworthy as the cheapest
account anyone can make. That is not trust. That is headcount.

## The fix: standing should be earned from the already-standing

Flip the rule. A nod is worth the standing of whoever gave it, and your
standing is the sum of the nods you received, each weighted by the
giver's standing. Written out, that is circular: your score depends on
their scores, which depend on yours. The circularity is the whole point
- it is what makes the metric hard to fake. You cannot hand out standing
you do not have.

We resolve the circularity by iterating instead of solving it in one
shot. Start everyone equal. Then repeatedly apply the rule: each node
pushes a share of its current standing out along its endorsements, split
evenly. After one round, standing has moved one hop. After two rounds,
it has moved two hops, so a node now reflects not just who endorsed it
but who endorsed those endorsers. Keep going and the standing of any
node folds in trust from further and further away in the network.

## Why it settles to a stable answer

Each round is the same redistribution applied again. Standing is neither
created nor destroyed in the core step - it is only moved along edges -
plus a small uniform amount that is held back and resprinkled evenly.
Two things make the numbers stop moving:

1. Conservation. The total standing across all nodes stays fixed at 1
   every round. So the system cannot run away to infinity or collapse to
   zero. It can only shuffle a fixed pie.

2. Contraction toward one arrangement. The uniform leak is the key. By
   mixing a little flat baseline into every node each round, you ensure
   every node always has a path of influence to every other, and you pull
   the whole system toward a single arrangement regardless of where it
   started. Any two different starting guesses get closer together every
   round. Because they converge to the same place, that place is the
   unique settled answer. The leak also fixes two structural traps: dead
   ends (nodes with no outgoing endorsements) that would otherwise drain
   standing into a hole, and closed rings that would otherwise hoard
   whatever they caught. We additionally redistribute dead-end standing
   uniformly so nothing is lost, which keeps the pie at exactly 1.

The settling is geometric: the gap from the final answer shrinks by a
roughly constant factor each round, so a few tens to a few hundred
rounds gets you to high precision. You stop when the round-to-round
change drops under a small tolerance.

## Why it resists gaming

Consider the clique attack: a group of cheap nodes that endorse only
each other, with extra puppets piling endorsements onto one chosen
member. Under counting, the chosen member's score is just the puppet
count - it wins easily.

Under flow, the clique's total standing is capped by how much standing
flows INTO the clique from the rest of the network. Endorsements among
the clique only reshuffle the standing the clique already holds; they
cannot create more. The puppets have almost no standing of their own
(nobody trusted endorses them), so the standing they pour onto the
chosen member is tiny. The clique can rank its own members relative to
each other, but it cannot lift any of them above a node that is fed by
genuinely high-standing endorsers. To actually game flow, you would have
to get trusted outsiders to endorse you - which is just earning trust,
the thing we wanted to measure.

The genuine cluster wins for the mirror-image reason: it receives
endorsements from many honest nodes, and its members endorse each other
back, so a large real inflow recirculates inside it and compounds. Real
trust reinforces; fake trust only recycles a tiny seed.

## Mental model

Authority is not how many point at you - it is how much standing flows to
you when everyone keeps passing their standing to whoever they trust,
over and over, until it stops moving.
