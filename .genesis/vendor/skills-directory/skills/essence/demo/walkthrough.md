# /essence in real time - the 10-column dashboard that was really 2 signals

This is a real session you can replay. The "redundant features" problem is in
`buggy_essence.py`. Run it once, then watch /essence collapse it. Do NOT read the
solution ahead.

## Reproduce

    $ python3 buggy_essence.py
    === THE NAIVE DASHBOARD: all 10 columns treated as independent ===

    Per-column spread (the report calls each one a separate 'insight'):
       col0 spread =  4.304
       col1 spread =  4.096
       col2 spread =  3.890
       col3 spread =  3.955
       col4 spread =  3.806
       col5 spread =  3.667
       col6 spread =  1.466
       col7 spread =  1.508
       col8 spread =  2.285
       col9 spread =  4.192

    === NEAREST-NEIGHBOR LOOKUP over all 10 raw columns ===

    Most similar customer to #0 is #170 (distance 0.374).
    Where does that distance come from?
       from the 7 'spend' echo columns:  59.6% of the squared distance
       from the 2 'engagement' columns:  28.6% of the squared distance

Seven columns (0,1,2,3,4,5,9) have nearly the same spread (~3.7 to 4.3) and move
together. The "insights report" calls them seven separate findings. The distance
calculation lets them gang up: that one signal supplies ~60% of every distance
while the genuinely different engagement signal gets ~29%. The code cannot see that
it is double-counting.

## Step 1 - center the data

Subtract each column's average so everything sits around zero. We care about how
customers DIFFER, not the baseline value of each metric. Spread, not position.

## Step 2 - ask how the columns move together

Build the table of how each pair of columns rises and falls together. The result is
blunt: columns 0,1,2,3,4,5,9 move in near-lockstep with each other, columns 6 and 7
move together separately, and column 8 is half-and-half. Seven of the ten columns
are echoes of a single signal.

## Step 3 and 4 - find the largest-spread direction, peel it off, find the next

Nudge a guess vector repeatedly through that move-together table until it stops
moving; it settles on the direction the data is most spread along. Remove everything
that direction explains, then repeat on what's left. The second direction is forced
to be something new.

## Step 5 - keep adding directions until almost all variation is captured

    $ python3 solution.py
    === /essence: find the directions the data actually moves along ===

    Variation captured by each direction (largest spread first):
       direction 1:  96.05% of variation   (running total  96.05%)
       direction 2:   3.81% of variation   (running total  99.86%)
       direction 3:   0.02% of variation   (running total  99.88%)
       direction 4:   0.02% of variation   (running total  99.90%)
       direction 5:   0.02% of variation   (running total  99.92%)
       direction 6:   0.02% of variation   (running total  99.94%)
       direction 7:   0.02% of variation   (running total  99.96%)
       direction 8:   0.02% of variation   (running total  99.98%)
       direction 9:   0.01% of variation   (running total  99.99%)
       direction 10:   0.01% of variation   (running total 100.00%)

    Top 2 directions capture 99.86% of ALL the variation.
    The other 8 directions together hold 0.14% - that's the noise/repeats.

    ASSERT PASSED: top-2 captured fraction 0.9986 > 0.90

Look at the curve: direction 1 alone is 96%, direction 2 adds the last real 3.8%,
and then it flattens to nothing. The table that looked like 10 metrics was really
2 signals plus measurement wobble. The eight extra columns held 0.14% of the story.

## Step 6 and 7 - drop the rest, work in the two axes

    Collapsed 10 columns -> 2 axes. Customer #0 is now just: [-2.257, 1.188]

    === NEAREST-NEIGHBOR LOOKUP on the 2 axes ===
    Most similar customer to #0 is #170 (distance 0.164 on 2 axes).

Every customer is now two numbers instead of ten. The nearest-neighbor lookup runs
on those two honest axes: each real signal gets a fair say instead of one being
counted seven times, and each comparison does a fifth of the arithmetic.

## Step 8 - sanity-check what we dropped

Before celebrating, we confirm the eight discarded directions held only noise (0.14%
total) and not some rare label we secretly cared about. They did not. Safe to drop.

## What just happened

We never assumed a column carried new information just because it had a name. We
found the few directions the data actually varies along, measured that two of them
hold 99.86% of the variation, and threw the repeats away. Ten columns became two,
the double-counting disappeared, and the work got cheaper. That is the whole skill.
