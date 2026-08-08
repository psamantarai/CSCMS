---
name: essence
description: "Use when a table or feature set has many columns that echo each other and you want the few axes that actually carry the signal: redundant features, a cluttered dashboard, a slow distance computation, or correlated metrics. Use this whenever the user suspects redundancy, wants to simplify or speed up, or asks which features actually matter."
title: "Essence - keep what carries the signal"
one_liner: "Most of your columns are echoes of each other. Find the few axes the data actually varies along and work in those."
outcome: "Fewer features, faster code, decisions driven by real differences instead of repeated noise."
tags: [signal, features, simplification, data, modeling]
works_with: [claude, cursor, windsurf, hermes, codex, any-agent]
composable: true # a /loop can call this
inputs: ["a wide table with many columns", "a feature set you suspect is redundant", "a distance / similarity computation", "a dashboard with too many metrics"]
outputs: ["the few directions that carry almost all the variation", "how much variation those directions capture", "the data re-expressed in those few axes", "the columns you can safely drop"]
---

# /essence

Most engineers (and most agents) do this:

 get 10 columns -> treat all 10 as independent -> weight them equally -> drown in noise

That is mistaking volume for information. If eight of your ten columns are just
the same two underlying signals restated with a little noise, then measuring all
ten does not give you ten times the insight. It gives you the same two facts,
counted eight times, and it quietly overweights whatever happens to be repeated.

The core move: never assume a column carries new information just because it has
its own name. Find the few directions the data really moves along, measure how
much of the variation they explain, and work in those directions from then on.

## When to use this

Trigger /essence when you hit any of:

- a wide table where many columns look correlated or "say the same thing"
- a distance / similarity / nearest-neighbor computation that feels dominated by one theme
- a model that is slow or overfits because it has too many near-duplicate features
- a dashboard with 20 metrics that all rise and fall together
- "we have a lot of data but can't tell what actually drives the outcome"

Do NOT use it when every column is already known to be independent and meaningful,
or when you have only two or three features to begin with. /essence is for
redundancy, not for genuinely rich, distinct signals.

## The procedure

1. CENTER THE DATA.
 Subtract each column's average so every column sits around zero. You care about
 how things vary, not where they happen to sit. Spread, not position.

2. ASK HOW THE COLUMNS MOVE TOGETHER.
 For each pair of columns, see whether they rise and fall together. Columns that
 move in lockstep are echoes; they are not adding new information, just volume.

3. FIND THE DIRECTION OF LARGEST SPREAD.
 Look for the single direction (a blend of columns) along which the data is most
 spread out. That is where the real differences between rows live.

4. REMOVE IT AND FIND THE NEXT.
 Strip out everything that first direction explains, then find the direction of
 largest spread in what remains. Repeat. Each new direction is forced to be
 different from the ones before it.

5. KEEP ADDING DIRECTIONS UNTIL YOU'VE CAPTURED ALMOST ALL THE VARIATION.
 Track the running share of total variation explained. Stop when the next
 direction would add almost nothing. Usually a handful covers nearly everything.

6. DROP THE REST.
 The remaining directions carry only noise and repetition. Discard them. The
 columns that just repeated the kept directions can go too.

7. WORK IN THOSE FEW AXES FROM NOW ON.
 Re-express every row as its position along the kept directions. Run your distance,
 your model, your dashboard on those axes. Same information, a fraction of the size,
 no double-counting.

8. SANITY-CHECK WHAT YOU DROPPED.
 Before you commit, confirm none of the discarded directions secretly held the
 thing you actually care about (see Pitfalls). Variation and importance are not
 always the same word.

## Output format

 INPUT: <N rows x M columns, suspected redundant>
 HOW THEY MOVE: <which columns are echoes of which>
 KEPT AXES: <the few directions of largest spread>
 VARIATION: axis 1 = XX%, axis 2 = YY%, ... running total = ZZ%
 KEPT FRACTION: <share of all variation the kept axes carry, e.g. 0.96>
 RE-EXPRESSED: <each row as coordinates on the kept axes>
 DROPPED: <the columns / directions that were pure repetition or noise>

## Composition (loops)

A pipeline loop can call /essence the moment a feature table arrives:

 LOOP: ingest new feature table
 on arrival -> /essence (find the few real axes) -> /model (train on those axes) -> /verify

/essence produces the compact axes; downstream skills act on them. It never decides
the final model alone inside a loop. It hands the simplified data to the next step so
the reduction stays auditable and reversible.

## Pitfalls

- Dropping a low-spread axis that is actually the label you care about. A rare-but-critical
 signal (fraud flag, defect, the one outlier) can have tiny spread yet be the whole point.
 Largest-spread is not the same as most-important. Check before discarding.
- Forgetting to center first. If you skip step 1, the direction of "largest spread" just
 points at whichever column has the biggest raw numbers, not at the real differences.
- Comparing columns on different scales (dollars vs. counts vs. percentages). Put them on a
 common footing first, or the big-unit column will masquerade as the main signal.
- Keeping too many axes "to be safe." If a handful already explains nearly everything, the
 extra axes are noise you are paying to carry. Trust the running total.

See references/logic.md for why a handful of directions almost always explains the whole table.
