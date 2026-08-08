---
name: oracle
description: "Use when a model emits a stated confidence that gates an action and you need to know whether that number is trustworthy: a 90 percent that is right only 70 percent of the time. Checks stated confidence against actual outcomes and corrects it. Use this whenever the user gates decisions on a probability, suspects a model is over- or under-confident, or asks if a confidence score can be trusted."
title: "Oracle - trust your confidence only when reality backs it"
one_liner: "Stops you acting on a stated probability until you've checked it comes true that often."
outcome: "Decisions gate on the number reality backs, not the number the model wishes were true."
tags: [confidence, reliability, decision-gating, trust, measurement]
works_with: [claude, cursor, windsurf, hermes, codex, any-agent]
composable: true # a /loop can call this
inputs: ["a model that emits a stated confidence", "predictions with known outcomes", "a confidence threshold that gates an action"]
outputs: ["the reality-backed confidence for each stated level", "the gap between how sure it feels and how often it's right", "a decision gate that acts on the corrected number"]
---

# /oracle

Most systems (and most agents) do this:

 model says "90% sure" -> treat that as "right 90% of the time" -> gate an action on it

That is taking a claim at face value. A stated confidence is a CLAIM about the
world, not a measurement of it. A systematically overconfident model will say 90%
and be right 60% of the time, and a gate that trusts the number ships a flood of
wrong decisions while feeling perfectly safe.

The core move: never act on a stated confidence until you have checked, against
real outcomes, how often predictions at that confidence actually come true. Report
the number reality backs. Gate on that one.

## When to use this

Trigger /oracle any time a stated probability or confidence GATES AN ACTION:

- "auto-approve / auto-merge / auto-send when the model is >= X% sure"
- a router or filter that trusts a score ("0.9 confidence, ship it")
- ranking, triage, or escalation driven by a confidence number
- any "the model says it's very likely, so we skipped the check" decision
- a self-reported certainty you are about to bet on ("I'm 95% sure, proceed")

Do NOT bother for decisions where being wrong is cheap and reversible, or where
you never act on the number at all. /oracle is for confidence that moves money,
merges code, or skips a human.

## The procedure

1. COLLECT PREDICTIONS WITH OUTCOMES.
 Gather a batch of past predictions where you know both the stated confidence
 AND whether each one turned out correct. This labeled set is your ground truth.
 No outcomes, no /oracle: you cannot check a claim you never scored.

2. GROUP BY HOW SURE THE MODEL CLAIMED TO BE.
 Bucket the predictions by their stated confidence (the 0.9 claims together, the
 0.7 claims together, and so on). Each bucket is a promise: "things in here are
 right this often."

3. MEASURE HOW OFTEN THOSE ACTUALLY CAME TRUE.
 In each bucket, count the real hit rate: of everything the model called 90%,
 what fraction was actually correct? That fraction is the reality-backed number.

4. LEARN THE GAP.
 For each bucket, compare the claimed number to the measured one. A persistent gap
 in one direction (claim high, reality low) is systematic overconfidence, not noise.
 Record the stated->actual mapping. This mapping IS the correction.

5. REPORT THE REALITY-BACKED NUMBER.
 At decision time, take the model's stated confidence, look up what predictions at
 that level actually come true at, and report THAT. The model can keep saying 90%
 internally; what leaves your system is the 60% reality backs.

6. GATE ON THE CORRECTED NUMBER.
 Apply your threshold to the reality-backed number, never the raw claim. "Auto-approve
 at 85% reliability" must mean 85% ACTUAL, so a 90%-claim that truly hits 60% gets
 refused. The gate now means what it says.

7. SIZE YOUR BUCKETS HONESTLY.
 A bucket with five predictions in it cannot tell you a reliable hit rate. If a level
 has too few samples to trust, widen the bucket or say "not enough evidence yet" rather
 than inventing a correction from noise.

8. RE-MEASURE OVER TIME.
 Confidence drifts: a model retrained, a data shift, a new release can move the real
 hit rates. The mapping you learned is a snapshot. Refresh it on fresh outcomes so the
 correction keeps matching reality.

## Output format

 STATED vs REALITY: for each confidence level: claimed X%, actually Y%, gap Z pts
 SYSTEMATIC SKEW: over- or under-confident, and by how much
 GAP BEFORE: avg distance between reported number and reality (raw)
 GAP AFTER: avg distance once corrected (should be small)
 GATE DECISION: what the threshold approves on CORRECTED numbers
 REFUSED: the claims the raw gate trusted that reality rejects

## Composition (loops)

A monitoring loop converts raw confidence to trustworthy confidence FIRST, then lets
the acting skills run:

 LOOP: stream of model decisions
 each decision -> /oracle (raw confidence -> reality-backed confidence)
 -> if trustworthy enough -> /clarity (act / explain)
 -> else -> /repair (route to human or recheck)

/oracle never decides alone inside a loop. It corrects the number, then hands a number
you can trust to whatever acts on it, so the action is gated on reality not on a wish.

## Pitfalls

- Too few samples per bucket: a hit rate from a handful of predictions is noise dressed
 up as a measurement. Trust wide buckets, distrust thin ones.
- Treating the mapping as permanent: confidence drifts when the model or data changes.
 A correction learned last quarter can be wrong today. Re-measure on fresh outcomes.
- Correcting only the high end: under-confidence (claim 60%, truly right 85%) wastes good
 predictions by refusing them. Measure the whole range, both directions.
- Scoring on the same data you measured on: check the correction against outcomes it did
 not learn from, or you will just memorize the batch.

See references/logic.md for why a stated probability is a claim that must be checked, not a measurement you can trust.
