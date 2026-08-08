---
name: foresight
description: "Use when watching a noisy metric that climbs toward a limit and you want warning before it breaches: memory, disk, queue depth, latency, error rate, cost burn. Smooths the signal, estimates its speed, and projects time-to-breach. Use this whenever the user wants early warning, trend-based alerting, or to catch a failure before it happens rather than after."
title: "Foresight - see the failure coming"
one_liner: "Stops you from alerting only when you're already on fire. Warns with lead time."
outcome: "Failures caught before they hit, real runway to act, fewer false alarms from noise."
tags: [monitoring, prediction, reliability, early-warning, trends]
works_with: [claude, cursor, windsurf, hermes, codex, any-agent]
composable: true # a /loop can call this each tick
inputs: ["a stream of noisy readings", "a metric climbing toward a limit", "a resource that can exhaust", "a queue that can overflow"]
outputs: ["a smoothed estimate of where the metric is", "an estimate of how fast it's moving", "a projected time-to-breach", "an early warning with real lead time"]
---

# /foresight

Most monitors (and most agents) do this:

 watch the number -> number crosses the red line -> alert -> but it's already too late

That is a smoke detector that only goes off once the house is ash. By the time
the level itself crosses the line, the failure has already happened or is one
tick away. And because real readings are noisy, a single jittery spike fires a
false alarm while a real climb hides in the wobble.

/foresight refuses to wait for the level. The core move: estimate not just where
the metric IS, but where it's HEADING, then project that line forward to see when
it will cross the danger threshold - and warn while there is still time to act.

## When to use this

Trigger /foresight when you have:

- a resource climbing toward a hard limit (disk, memory, connections, quota)
- a queue or backlog growing faster than it drains
- a metric trending toward an SLA breach (latency, error rate, lag)
- noisy readings where you cannot trust any single sample
- anything where "alert when it crosses the line" gives you no time to respond

Do NOT use it for binary events with no trend (a process is up or down), or for
metrics that don't move toward a threshold. /foresight is for things that CLIMB.

## The procedure

1. PIN THE THRESHOLD AND THE LIMIT.
 Name the hard wall (100% disk, queue capacity, SLA ceiling) and the safety
 margin you need to act inside. If you need 6 steps to drain a queue, your
 margin is 6. Warning later than that is the same as not warning.

2. TRACK THE RATE OF CHANGE, NOT JUST THE LEVEL.
 Keep two estimates: where the metric is now, and how fast it's moving. The
 level alone tells you nothing about runway. The rate is what predicts the wall.

3. SMOOTH THE NOISE BEFORE YOU TRUST A READING.
 Never react to one raw sample. Maintain a running estimate and let each new
 reading nudge it. Jitter should move you a little; it should never panic you.

4. BLEND PREDICTION WITH MEASUREMENT BY HOW MUCH YOU TRUST EACH.
 Predict the next value from the trend you believe, then pull that prediction
 toward the new reading by a trust weight. Noisy sensor -> trust the trend more.
 Clean sensor -> trust the reading more. You are reconciling two opinions, not
 replacing one with the other.

5. PROJECT THE LINE FORWARD TO THE THRESHOLD.
 At the current estimated rate, compute how many steps until the metric crosses
 the limit: runway = (limit - estimate) / rate. That number is your real warning.

6. WARN WITH LEAD TIME.
 The moment projected runway drops below your safety margin, raise the warning -
 stating the projection ("on track to hit 100% in ~6 steps"), not just the level.
 This fires well before the level itself reaches the line.

7. DON'T OVERREACT TO A SINGLE SPIKE.
 A lone reading that jumps and falls back should barely move the projection. If
 one sample flips you into alarm, your trust weight is too high - smooth harder.

8. RE-PROJECT EVERY TICK.
 The trend changes. Recompute the estimate, the rate, and the runway on each new
 reading. A breach that was 20 steps out can become 5 steps out; foresight is
 continuous, not a one-shot.

## Output format

 METRIC: <what is being watched + its hard limit>
 ESTIMATE: <smoothed current value> (raw reading: <noisy sample>)
 RATE: <estimated change per step>
 PROJECTION: on track to cross <limit> in ~<runway> steps
 WARNING: <fired / not yet> - runway below safety margin of <N>
 LEAD TIME: <steps of warning bought vs. waiting for the level to cross>

## Composition (loops)

A monitoring loop calls /foresight on every tick, and hands a projected breach
to a fixer BEFORE the incident:

 LOOP: every tick, read the metric
 -> /foresight (estimate + project)
 on projected breach within margin -> /repair (act with the runway you bought)
 -> /verify (confirm the trend bent away from the wall)

/foresight never fixes alone inside a loop. It produces the early warning and the
projection; a downstream skill acts on it while there is still time. The whole
value is the gap between "projected breach" and "actual breach" - that gap is the
window /repair gets to work in.

## Pitfalls

- Watching the level instead of the rate: you'll always alert too late. The level
 crossing the line IS the incident, not a warning of it.
- Trusting a single noisy reading: one spike fires a false alarm, one dip hides a
 real climb. Smooth first, then decide.
- Trust weight set too high: you track the noise instead of the trend and flap.
 Too low: you lag reality and lose lead time. Tune it to the sensor's jitter.
- Projecting once and forgetting: the rate changes. Re-project every tick or your
 warning goes stale.
- Warning with no margin: a warning that fires one step before the wall is just a
 slower alarm. The margin must be at least the time you need to act.

See references/logic.md for why tracking the rate beats tracking the level.
