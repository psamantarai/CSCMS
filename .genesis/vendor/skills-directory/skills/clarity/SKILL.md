---
name: clarity
description: "Use when a pick-one-of-N decision runs on uncertain scores and you need to know when the choice is too close to call: classifier output, router scores, intent detection, any confidence-gated routing. Commits only when belief is concentrated and escalates on ties. Use this whenever the user routes or classifies under uncertainty, or needs a clean human-handoff gate."
title: "Clarity - know when you don't know"
one_liner: "Stops you from acting on a coin flip. Commits only when the belief is concentrated."
outcome: "Fewer confident-but-arbitrary picks, clean escalation on ties, decisions you can audit."
tags: [classification, routing, uncertainty, reliability, hitl]
works_with: [claude, cursor, windsurf, hermes, codex, any-agent]
composable: true # a /loop can call this as a gate
inputs: ["a probability over several options", "a classifier output", "a router's scores", "any pick-one-of-N under uncertainty"]
outputs: ["a single 0..1 spread measure", "a decision: commit to one option OR escalate", "a clean handoff to a human when belief is too split"]
---

# /clarity

Most classifiers (and most agents) do this:

 get scores over N options -> pick the top one -> act on it -> done

That works great when one option clearly leads. It is a disaster on a near-tie.
A pick of [0.26, 0.25, 0.25, 0.24] "wins" with 26 percent - that is a four-way
coin flip wearing a decision's clothes. argmax can't tell it apart from a 90
percent near-certainty, because it only ever reads the top number.

/clarity refuses to commit until it has looked at the SHAPE of the whole belief.
The core move: measure how evenly the belief is split, and act only when one
option clearly dominates. Otherwise escalate instead of guessing.

## When to use this

Trigger /clarity whenever you are about to pick one of several options under
uncertainty:

- routing a ticket / request / lead to one of several teams or queues
- intent classification (which of N intents did the user mean?)
- choosing one tool / branch / handler from a scored list
- any "pick the top class" where the scores might be close
- any place a model gives you a probability and you're about to trust argmax

Do NOT use it when one option already dominates by a mile, or when there is no
real cost to being wrong (cheap, reversible, instantly correctable). /clarity is
for picks that matter and might be too close to call.

## The procedure

1. LOOK AT THE WHOLE SPREAD, NOT JUST THE TOP.
 argmax throws away everything except the winner. But the same winner can mean
 "near-certain" or "barely ahead." Read every option's share, not one number.

2. MEASURE HOW EVENLY THE BELIEF IS SPLIT.
 Collapse the whole distribution into one number from 0 to 1: 0 means all the
 belief sits on one option, 1 means it is split perfectly evenly across all of
 them. Even is bad - even means you genuinely cannot tell them apart.

3. NORMALIZE BY THE NUMBER OF OPTIONS.
 Divide so the measure means the same thing whether you're choosing among 2
 options or 40. A "barely-ahead" pick should read the same regardless of N.

4. A NEAR-EVEN SPLIT MEANS YOU'RE GUESSING.
 If the spread is high, the top option won only by noise. Committing to it is
 not a decision, it is laundering a coin flip. Treat high spread as "unknown."

5. COMMIT ONLY WHEN ONE OPTION CLEARLY DOMINATES.
 Set a threshold. Below it, the belief is concentrated enough - commit to the
 top option and move fast. The easy cases should stay easy.

6. OTHERWISE ESCALATE OR GATHER MORE.
 Above the threshold, do not pick. Ask a human, request more evidence, abstain,
 or fall back to a safe default. Saying "I don't know yet" is the correct output.

7. RECORD THE SPREAD WITH THE DECISION.
 Log the 0..1 number next to whatever you did. It makes every commit auditable
 and lets you tune the threshold from real outcomes instead of vibes.

8. TUNE THE THRESHOLD TO THE COST OF BEING WRONG.
 Cheap, reversible action: a loose threshold is fine. Expensive or
 irreversible action: tighten it so more borderline cases escalate.

## Output format

 OPTIONS: <the N choices and their shares of belief>
 SPREAD: <one number 0..1 - how evenly the belief is split>
 THRESHOLD: <the line below which you commit>
 DECISION: COMMIT to <option> OR ESCALATE (too evenly split)
 REASON: <one line: dominated clearly / near-tie, handing to a human>

## Composition (loops)

/clarity is a gate, not an actor. In a loop it stands in front of the thing that
acts, and only lets confident decisions through:

 LOOP: incoming tickets
 classify -> /clarity (gate)
 if concentrated -> /repair (auto-handle the ticket)
 if too split -> route to a human (HITL), gather more

Low clarity routes to a human instead of to action. The actor never fires on a
near-tie, so the loop never auto-commits a coin flip. Every commit carries its
spread number, so the whole loop stays auditable.

## Pitfalls

- Confident but wrong: a model can be 95 percent sure and dead wrong. /clarity
 measures how SPLIT the belief is, not whether it is CORRECT. It catches coin
 flips, not confident lies. Pair it with outcome-checking for the latter.
- Reading only the top score: that is exactly the failure mode. The top value
 cannot distinguish a near-certainty from a four-way tie. Read the spread.
- A wrong threshold: too loose and ties slip through; too tight and you escalate
 everything. Tune it against real outcomes and the cost of being wrong.
- Garbage probabilities: if the scores aren't real probabilities (don't sum to 1,
 or don't reflect real-world frequencies), the spread measure is meaningless.
 Normalize inputs first.

See references/logic.md for why the SHAPE of the whole belief carries more than its peak.
