# /hivemind walkthrough

Watch a leaderless fleet coordinate itself, fail without forgetting, then fix
itself once we add fade. Senior-engineer narration, real output pasted below.

## The setup

A fleet of 40 workers, each round, choosing between three paths to a goal: A, B,
C. Lower cost is better. Nobody assigns work. Each worker picks a path, scores
it, and leaves a mark in a shared space (a strength value per path). Workers
lean toward stronger marks. That is the entire coordination mechanism.

The world is not static. It changes halfway through:

- Phase 1 (rounds 0-19): path A is cheap (cost 2.0). A is the right answer.
- Phase 2 (rounds 20+): the world shifts. A becomes expensive (cost 9.0) and C
  becomes the new cheapest (cost 1.0). Now C is the right answer.

A good leaderless fleet should pile onto A early, then notice the shift and
migrate to C. No boss tells it to. It has to figure it out from the marks alone.

## Run 1: reinforcement only, no fade. The stale-lock-in failure.

Name the failure mode first: positive feedback with no forgetting. Marks only
ever accumulate. The first path to get ahead keeps getting reinforced, its lead
compounds, and even when the world changes the historical pile of marks still
wins the vote. The fleet has memory but cannot forget.

Real output from `python3 buggy_hivemind.py`:

```
=== decentralized coordination WITHOUT fade ===
Phase 1 (rounds 0-19): best path is A (cost 2.0)
Phase 2 (rounds 20+): world shifts, best path is C (cost 1.0)

Final trail strengths: {'A': 546.9, 'B': 11.4, 'C': 80.3}

Most-followed path early (rounds 0-19): A
Most-followed path late  (rounds 40-59): A

BUG: world changed at round 20. Best path is now C.
But the swarm is STILL locked on path A - stale marks never faded, so the fleet never shifted.
```

Look at the final strengths. A sits at 546.9 - a mountain of stale deposits from
phase 1. C, the genuinely best path now, clawed its way to 80.3 but never got
close. A's early lead was insurmountable. The fleet is stuck on the worse path,
paying cost 9.0 every round when 1.0 was available. Coordination without
forgetting is just a slow-motion commitment to your first guess.

## Run 2: add fade + a little exploration. The fix.

Two changes:

1. Fade: every round, multiply all marks by 0.85. A mark only stays strong if
   workers keep reinforcing it. Stop using a path and its marks decay away.
2. Exploration: 10% of choices ignore the marks and pick at random, so the fleet
   keeps sampling alternatives and can discover a newly-better path.

Now the shared signal is recency-weighted. Recent success counts; ancient
success evaporates. That is exactly what you need to follow a moving target.

Real output from `python3 solution.py`:

```
=== decentralized coordination WITH fade + exploration ===
Phase 1 (rounds 0-19): best path is A (cost 2.0)
Phase 2 (rounds 20+): world shifts, best path is C (cost 1.0)

Final trail strengths: {'A': 1.51, 'B': 1.68, 'C': 205.69}

Most-followed path, end of phase 1 (rounds 10-19): A
Most-followed path, end of phase 2 (rounds 50-59): C

PASS: leaderless fleet converged on the best path in each phase
PASS: fleet adapted when the world changed (A -> C) with no boss
```

Now watch the strengths flip. In phase 1 the fleet still found A - reinforcement
works. But after the world changed, A's stale marks faded (down to 1.51) while C
accumulated fresh reinforcement (205.69). The fleet migrated from A to C on its
own. No orchestrator, no redeployment, no config change. The marks did it.

The assertions make it concrete: A wins phase 1, C wins phase 2, and the once-
dominant A has faded below C. The leaderless fleet tracks the moving best answer.

## The lesson

Reinforcement alone concentrates the fleet on what worked - and traps it there.
Fade adds forgetting, so the consensus reflects what is working NOW. The two
together give you a system with no boss that still commits hard to a good answer
and lets go of it when a better one appears.

The fade rate is the knob. Too slow and you get the buggy run's lock-in. Too
fast and good paths evaporate before consensus can form. Tune it to how fast
your world changes.

Mental model: lay down trails where things worked, let the trails slowly fade,
and the crowd will always be walking on whatever currently works.
