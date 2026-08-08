---
name: bond
description: Use when you need to learn which agents/tools/sources collaborate well instead of trusting everyone equally - building a trust network from real outcomes, routing work to proven partnerships, replacing a hand-coded team chart with learned affinities, adapting team composition over time, or noticing that an orchestrator keeps re-forming teams that clash. Use when you have repeated collaborations and an outcome signal to learn from.
title: Bond - learn a trust network and route work to proven partnerships
one_liner: Strengthen the links between collaborators that succeed together, decay the rest, and route work toward the partnerships that pay off.
outcome: An orchestrator that stops trusting everyone equally and instead routes work to the agent/tool pairings it has watched reliably win together.
tags: [orchestration, routing, trust, learning, partnerships, adaptation, teaming]
works_with: [claude, cursor, windsurf, hermes, codex, any-agent]
composable: true
inputs: A pool of collaborators (agents, tools, or sources), a stream of repeated collaborations, and an outcome signal per collaboration (good or bad).
outputs: A trust map of link weights per collaborator pair, plus a routing decision that favors high-weight partnerships while keeping some exploration.
---

# /bond

Treating every collaborator as equally trustworthy is the naive default, and it
is wrong. Some pairings reliably produce good work together. Others clash every
time. If you pair agents at random, or hand-code a team chart once and never
revisit it, you keep re-forming the teams that fail and you never discover the
ones that win. The success you leave on the table is enormous and invisible.

/bond fixes this by learning from what actually happened. Every collaboration is
evidence. When two collaborators work together and the outcome is good, the link
between them strengthens. When it goes badly, the link weakens. Links nobody
uses slowly decay back toward neutral, so stale trust does not linger. Over time
the system learns who works well with whom - no one had to draw the chart.

## When to use this

Use this when:
- You orchestrate repeated work across a pool of agents, tools, or data sources.
- You catch yourself pairing collaborators at random or by a fixed chart.
- "Which combination of these should I actually use together?"
- "This team keeps producing bad results and I do not know which pairing is the problem."
- "I want routing that improves as it sees more outcomes."
- You want to replace a hand-tuned team chart with affinities learned from results.

Do NOT use it when: the task is a one-off with no repeated collaboration to learn
from, or when you have no reliable outcome signal (if you cannot tell good from
bad, there is nothing to reinforce and you will just learn noise).

## The procedure

1. Start with equal, neutral trust on every collaborator pair. No favorites yet.
2. Pick a pair to do the next unit of work. Early on this is mostly exploration;
   later it leans toward the pairs with the highest trust weight.
3. Run the collaboration and read its outcome: good or bad.
4. If the outcome was good, reinforce the link between that pair (raise its weight).
5. If the outcome was bad, weaken the link (lower its weight).
6. Each round, decay every link a little toward neutral, so partnerships that
   stop being used or stop paying off fade and the map tracks current reality.
7. Cap weights at a floor and a ceiling so no link can explode or go negative.
8. Route future work toward strong links - but softly, in proportion to trust,
   and always keep a slice of exploration so undiscovered good pairs still get
   tried and no single early winner can monopolize all the work.
9. Repeat. The trust map sharpens as evidence accumulates.

## Output format

Maintain and report:
- A trust map: weight per collaborator pair, e.g. `{(A,C): 0.99, (A,B): 0.37, ...}`.
- The current top partnerships (highest-weight links).
- The routing decision for the next unit of work, and whether it was an
  exploit (high-trust pick) or an explore (random pick).

Example:
```
trust map (top): A+C=0.99  B+E=0.73  D+F=0.66  ...  A+B=0.37
next route     : A+C   (exploit, weight 0.99)
success rate   : 0.699 learned   vs   0.413 equal-trust baseline
```

## Composition (loops)

/bond is the routing brain inside a /loop:

```
loop:
    pair    = bond.pick_pair(trust)      # explore or exploit
    outcome = run_collaboration(pair)    # do the actual work
    bond.update_link(trust, pair, outcome)  # reinforce or weaken
    bond.decay_all(trust)                # forget stale evidence
    if converged(trust): break
```

The /loop supplies repeated trials; /bond turns each outcome into an updated
trust map and hands back the next routing choice. Feed real outcomes back every
iteration - the quality of the learned map is only as good as the signal you give it.

## Pitfalls

- Rich-get-richer lock-in: if you always exploit the current best and never
  explore (or never decay), one early lucky winner hoards all the work and
  genuinely strong pairs are never discovered. Keep exploration and decay on.
- Learning noise: if the outcome signal is unreliable or arbitrary, you reinforce
  garbage. Make sure good-vs-bad is a real, consistent measurement first.
- No cap: unbounded reinforcement lets a weight run away and drowns out everything
  else. Always clamp to a floor and ceiling.
- No decay: without decay the map remembers partnerships that have gone stale or
  whose performance has changed, and it stops tracking current reality.
- Too-sharp routing: routing purely to the single top link collapses the team to
  one pair. Favor strong links softly, in proportion to trust.

See references/logic.md for why strengthening co-success links and decaying the
rest converges to a trustworthy map.
