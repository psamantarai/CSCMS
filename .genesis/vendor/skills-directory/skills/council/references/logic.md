# Why the best worst-case wins

## The core mistake: optimizing for a world with no opponent

When one agent hands you an answer, it usually came from picking the option
with the highest ceiling. "This plan could get us to 100." That number is the
best case: it assumes everything breaks your way and nobody pushes back.

But almost every real decision has an opponent. Sometimes literal - a
competitor, an attacker, a negotiating counterparty. Sometimes not - the
opponent is the worst-case world: the dependency that fails, the edge input,
the load spike, the assumption that turns out false. Either way, something gets
to respond to your choice after you make it, and it will respond in the way
that hurts you most.

So the ceiling is a fantasy. You do not get the best case. You get whatever is
left after the response. If you chose your option by its ceiling, you chose it
for a world that does not exist.

## The fix: judge by the floor, not the ceiling

For each option, ignore the best thing that could happen. Find the worst thing
that happens when the other side plays its strongest move against that specific
option. That is the option's floor - the outcome you are actually guaranteed.

Then pick the option with the highest floor. Not the highest ceiling, the
highest floor. You are choosing the option that gives the best result when
things go worst.

This feels pessimistic. It is not. It is honest. The ceiling was never on
offer. Among the outcomes actually available to you once the opponent gets to
move, you are taking the best one. That is optimism aimed at reality instead of
at a fantasy.

Why this produces robust decisions: a choice selected by its floor cannot be
surprised. The bad case was already priced in. Whatever the opponent does, you
do at least as well as the floor you computed. A choice selected by its ceiling
has no such guarantee - its first contact with a smart opponent can drop it
through the floor, as the demo shows (a plan that "scores 100" actually loses
70 once the competitor undercuts).

## What "stable" means in plain terms

A decision is stable when, at the pairing of your choice and the opponent's
strongest response, neither side can do better by changing only its own move.

Two checks:

1. Holding the opponent's response fixed, you (the chooser) cannot find a
   different option that does better against that response. If you could, you
   picked the wrong option.

2. Holding your option fixed, the opponent cannot find a different response
   that hurts you more. If they could, you underestimated the attack and your
   real floor is lower than you thought.

When both are true, the situation is settled. There is no profitable single
move for either side. You are sitting on a point that nobody wants to leave.
That is exactly the property you want from a decision: it does not unravel the
moment one party reconsiders. Anyone who deviates unilaterally makes their own
position worse.

This is why the stability check is not optional. The best-worst-case option is
your candidate; the stability check confirms there is no hidden stronger attack
and no better option against that attack. If the check fails, your floor was a
mirage and you have to redo the analysis with the move you missed.

Notice the meeting point in the demo: the most the opponent can hold us to and
the most we can guarantee ourselves land on the exact same value (20). When the
two sides meet at one number, you have found the settled point. The decision
rests there because pushing from either direction costs the pusher.

## Why not just pick the best best-case sometimes?

Because the upside is not yours to keep. If reaching it requires the opponent
to cooperate (or the world to be kind), and the opponent has no reason to
cooperate, the upside will not happen. You only keep what survives the response.
Chasing the ceiling means accepting a worst case you never examined - which is
how confident plans blow up.

The one exception: when the downside is genuinely tiny and reversible. Then the
worst case barely matters and you can chase upside freely. That is precisely the
"do NOT use this" case in the skill. The whole mechanism earns its keep only
when being wrong is expensive.

## Mental model

Choose the move whose worst outcome is the best, then confirm neither side gains by walking away from it.
