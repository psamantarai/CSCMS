---
name: kingmaker
description: Use when ranking agents/sources/reviewers by trust, deciding whose vote should weigh more, finding the most influential node in a network, allocating authority to proven performers, or de-gaming a simple vote count. Spreads authority through an endorsement network so a nod from a widely-trusted agent counts more than a nod from a nobody, and a self-endorsing clique cannot inflate itself.
title: Kingmaker - Flow-Based Authority Ranking
one_liner: Rank by who trusted agents trust, not by raw vote count.
outcome: A stable authority score per node that reflects deep trust, plus a defensible weighting for future decisions.
tags: [ranking, trust, influence, networks, voting, anti-gaming]
works_with: [claude, cursor, windsurf, hermes, codex, any-agent]
composable: true
inputs: A set of nodes (agents, sources, reviewers, options) and directed endorsements between them (who vouches for whom).
outputs: A ranked authority score per node and a recommended weight for each node in downstream decisions.
---

# /kingmaker

Equal voting is easy to game. One vote is one vote, so anyone who can
spin up ten cheap accounts can crown whoever they want. Counting nods
treats a nod from a deeply respected agent the same as a nod from a
throwaway puppet. That is the bug.

Authority should flow. A nod is worth as much as the standing of whoever
gave it. The agents that end up on top are the ones trusted by other
trusted agents - and that property is expensive to fake, because you
cannot borrow standing you were never given.

/kingmaker spreads authority through the endorsement network until the
standings stop changing, then ranks by the settled scores.

## When to use this

Triggers:
- You need to rank agents, sources, reviewers, or options by trust.
- You are deciding whose vote should weigh more in a future decision.
- You want the single most influential node in a web of references.
- You want to allocate more authority to proven performers.
- A simple vote count is being gamed by a clique or sock puppets.

Do NOT use it when:
- There are no endorsements between nodes (nothing to flow). Use a flat
  score or a direct metric instead.
- Endorsements are not transitive in your domain (a vouch for X says
  nothing about who X vouches for). Flow assumes trust carries.
- You need a single objective ground-truth measurement, not a relative
  popularity-of-trust ranking.
- The graph is tiny and hand-auditable - just read it.

## The procedure

1. Build the endorsement graph. Nodes are the agents/sources/options.
   A directed edge A to B means "A endorses B / vouches for B / cites B."

2. Give everyone equal starting standing. If there are N nodes, each
   starts with 1/N. No node is privileged at the start.

3. Each round, every node hands a share of its current standing to the
   nodes it endorses, split evenly across its endorsements. A node that
   endorses four others gives each one a quarter of what it passes on.

4. Mix in a small uniform leak each round: hold back a small fraction of
   all standing and sprinkle it evenly across every node. This keeps
   dead ends and closed rings from trapping standing, and guarantees the
   numbers settle.

5. Repeat the round until the standings stop moving - when the total
   change from one round to the next falls below a small tolerance, you
   have converged. This usually takes tens to a few hundred rounds.

6. Read off the ranking. Sort nodes by their settled standing. The top
   node is the one trusted by other trusted nodes, not the one with the
   most raw nods.

7. Grant authority proportionally. Use each node's settled standing as
   its weight in the next decision - votes, source weighting, reviewer
   priority. Proven performers carry more.

8. Guard against a clique inflating itself. A group that mostly endorses
   each other can hoard the standing it already has, but it cannot grow
   it without inflow from trusted outsiders. Sanity-check: how much
   standing actually enters the group from the rest of the network? If a
   high-ranked node is fed almost entirely from inside its own cluster,
   discount it.

## Output format

Report, per node: settled standing (normalized so all standings sum to
1), rank, and recommended decision weight. Also report rounds-to-settle
and the leak fraction used, so the run is reproducible. Flag any node
whose standing comes mostly from within its own tight cluster.

## Composition (loops)

- Feed the weights into a weighted vote or a weighted source merge: each
  node's vote is scaled by its settled standing.
- Re-run after every decision round using updated endorsements, so
  authority tracks live performance instead of going stale.
- Chain with a filter step first: drop obviously fake nodes, then let
  flow handle the subtle gaming that survives the filter.

## Pitfalls

- Closed rings that hoard. A clique endorsing only itself keeps whatever
  it had. The leak limits this, but always check inflow from outside.
- Dead ends that leak away. A node with no outgoing endorsements would
  drain standing without the redistribution step in 4 - do not skip it.
- Stopping too early. If you stop before the standings settle, the
  ranking can still be jittering. Iterate to the tolerance.
- Treating standing as ground truth. It measures trust-of-trust, not
  correctness. Pair it with a real quality signal where you have one.
- Self-endorsement. Drop self-edges before you start; they are free
  standing for nobody.

See references/logic.md
