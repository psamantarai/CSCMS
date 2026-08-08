# /clarity - the logic behind it

This file explains WHY the procedure works. It deliberately does not name the
academic measures involved. You do not need them. You need the logic.

## The one idea

> A decision is only real when one option clearly beats the rest. Otherwise you
> are reporting noise as a choice.

Most pick-one-of-N failures come from reading a single number - the top score -
and acting on it. That number is blind to the one thing that matters: how close
the runners-up are. /clarity is built around the opposite instinct: look at the
whole shape of the belief before you commit to anything.

## Why the SHAPE carries more than the top value

Two distributions can have the identical top option and mean opposite things:

    [0.90, 0.04, 0.03, 0.03]   top = option 0, share 90%   -> near-certain
    [0.26, 0.25, 0.25, 0.24]   top = option 0, share 26%   -> a four-way tie

argmax returns "option 0" for both. It cannot see that the second one is a
coin flip, because it discarded the runners-up the instant it found the max.
The information that tells you whether to trust the pick does not live in the
peak - it lives in the GAP between the peak and everything else. To read that
gap you have to look at the whole distribution at once, which is exactly what a
spread measure does and a top-1 readout cannot.

## Why a near-uniform spread means near-zero real knowledge

Think about what "perfectly even" means. If four teams each get 25 percent, the
classifier is telling you it has no way to distinguish them - every option is as
good as every other. That is the definition of knowing nothing about which one
is right. The closer the belief gets to even, the less the model actually knows,
regardless of which option happens to be a hair ahead. A 26 percent leader in a
near-even field did not earn that lead with evidence; it earned it with rounding.

So a high spread is not "low confidence in the winner." It is a direct statement
that the underlying information could not separate the options at all. Acting on
it does not use knowledge you have - it manufactures knowledge you don't.

## Why normalize by the number of options

A raw spread measure gets bigger just because there are more options to spread
across. "Evenly split among 2" and "evenly split among 40" would produce
different raw numbers even though both mean the exact same thing: a dead tie,
total ignorance. By dividing so that a perfectly even split always reads 1.0 and
a single dominant option always reads 0.0, the number means the same thing in
every problem. That lets one threshold work across a 4-team router and a 40-intent
classifier, and lets you compare clarity between problems of different sizes.

## Why acting on a near-tie is laundering a coin flip

When you commit to the top option of [0.26, 0.25, 0.25, 0.24], you produce an
output that LOOKS like a decision - a team name, a route, a class label. It has
the form of knowledge. But the process that generated it was indistinguishable
from flipping a coin among four roughly-equal options. The danger is precisely
that it does not look like a coin flip downstream. The next system trusts it as
a real classification, builds on it, and the arbitrariness is now baked in and
invisible. Escalating instead keeps the uncertainty honest and visible, where a
human or more evidence can actually resolve it.

## What clarity does NOT tell you

It measures how SPLIT the belief is, not whether it is CORRECT. A model can put
99 percent on the wrong option: concentrated, so /clarity happily commits, and
it is still wrong. Clarity catches the failure of NOT KNOWING (ties), not the
failure of being confidently mistaken. Catching confident-but-wrong needs a
different tool: checking whether the model's stated sureness actually matches how
often it turns out right, measured against real outcomes. Use both. Clarity's
job is narrow and worth doing: never let a coin flip masquerade as a decision.

## The mental model in one line

    Read the whole spread, not the top. Commit only when one clearly wins. Otherwise say "I don't know yet."
