# /foresight in real time - disk climbing toward full

This is a real session you can replay. The reactive monitor lives in
`buggy_foresight.py`; the /foresight monitor lives in `solution.py`. Both read
the SAME seeded series of noisy disk readings, so the contrast is honest.

## Reproduce the failure - the reactive monitor

    $ python3 buggy_foresight.py
    step | true usage | noisy reading
       0 |      60.0% |     62.8%
       1 |      62.0% |     61.6%
       2 |      64.0% |     61.0%
       3 |      66.0% |     68.5%
       4 |      68.0% |     70.6%
       5 |      70.0% |     70.5%
       6 |      72.0% |     73.0%
       7 |      74.0% |     71.5%
       8 |      76.0% |     77.6%
       9 |      78.0% |     76.4%
      10 |      80.0% |     77.2%
      11 |      82.0% |     83.7%
      12 |      84.0% |     83.1%
      13 |      86.0% |     86.7%
      14 |      88.0% |     88.7%
      15 |      90.0% |     87.9%
      16 |      92.0% |     90.1%
      17 |      94.0% |     91.7%
      18 |      96.0% |     93.1%
      19 |      98.0% |     97.9%  <-- ALERT_LEVEL crossed
      20 |     100.0% |    102.8%  <-- ALERT_LEVEL crossed
      ... (climbs past 100 and keeps going)

      Disk is actually EXHAUSTED (true usage >= 100%) at step 20.
      Reactive monitor first ALERTS at step 19.
      That gives only 1 step(s) of warning before exhaustion. Too late.

One step of warning. The alert and the crash are practically the same moment.
Worse, look at step 18: the TRUE usage is already 96% (past the 95% line) but the
noisy reading came in at 93.1%, so the reactive monitor stayed silent - noise hid
a real breach. A junior move is to lower the threshold to 90%; that just trades
late alarms for a flood of false ones, because the noise band is +/- 3%. /foresight
does not touch the threshold. It changes what it watches.

## Step 1 - pin the threshold and the limit

    LIMIT:  100% (disk full -> service dies)
    MARGIN: we need ~6 steps to act (page someone, expand the volume, shed load)

So a warning is only useful if it fires at least 6 steps before exhaustion.

## Step 2 - track the rate, not the level

Instead of storing only the latest reading, we keep two estimates: a smoothed
current usage, and a climb rate (how fast usage moves per step).

## Step 3 and 4 - smooth the noise, blend by trust

Each tick we predict the next value from the trend, then nudge that prediction
toward the new reading by a trust weight (0.4 here, because the sensor is jittery).
A wild reading only tugs the estimate; it cannot yank it. Watch the smoothed
column stay calm while the raw readings wobble.

## Step 5 and 6 - project forward and warn with lead time

    $ python3 solution.py
    step | true usage | noisy reading | smoothed est | est rate | projected runway
       0 |      60.0% |     62.8%   |      62.8%  |    0.00  |       --
       1 |      62.0% |     61.6%   |      62.3%  |   -0.14  |       --
       2 |      64.0% |     61.0%   |      61.7%  |   -0.28  |       --
       3 |      66.0% |     68.5%   |      64.3%  |    0.56  |     63.4
       4 |      68.0% |     70.6%   |      67.1%  |    1.26  |     26.1
       5 |      70.0% |     70.5%   |      69.2%  |    1.51  |     20.4
       6 |      72.0% |     73.0%   |      71.7%  |    1.78  |     15.9
       7 |      74.0% |     71.5%   |      72.7%  |    1.55  |     17.6
       8 |      76.0% |     77.6%   |      75.6%  |    1.96  |     12.5
       9 |      78.0% |     76.4%   |      77.1%  |    1.82  |     12.6
      10 |      80.0% |     77.2%   |      78.2%  |    1.62  |     13.5
      11 |      82.0% |     83.7%   |      81.4%  |    2.08  |      8.9
      12 |      84.0% |     83.1%   |      83.3%  |    2.04  |      8.2
      13 |      86.0% |     86.7%   |      85.9%  |    2.20  |      6.4
      14 |      88.0% |     88.7%   |      88.3%  |    2.27  |      5.1  <-- /foresight WARNS
      15 |      90.0% |     87.9%   |      89.5%  |    1.95  |      5.4
      16 |      92.0% |     90.1%   |      90.9%  |    1.78  |      5.1
      17 |      94.0% |     91.7%   |      92.3%  |    1.66  |      4.6
      18 |      96.0% |     93.1%   |      93.6%  |    1.55  |      4.1
      19 |      98.0% |     97.9%   |      96.3%  |    1.89  |      2.0
      20 |     100.0% |    102.8%   |     100.0%  |    2.44  |     -0.0
      ...

      Disk truly EXHAUSTED at step 20.
      Reactive monitor alerts at step 19 (lead time: 1 step).
      /foresight WARNS at step 14: projected to hit 100% in ~5 steps.
      /foresight bought 6 steps of lead time before exhaustion,
      and fired 5 steps EARLIER than the reactive monitor.

      ASSERTIONS PASSED: foresight warned strictly earlier, with real lead time.

Notice what the rate column did: by step 8 it had settled near the true climb
(~2.0/step) even though no single reading is exactly on the true line. The runway
column counts down smoothly. At step 14 the projection drops to ~5 steps of
runway, below our margin of 6, and /foresight fires - six full steps before the
disk is gone. The reactive monitor is still silent at step 14; it won't say a word
until step 19.

## Step 7 - it didn't overreact to a spike

Look at step 3: the raw reading jumped to 68.5 from 61.0, a big spike. The smoothed
estimate only moved to 64.3, and the projected runway (63.4 steps) stayed sane. A
level-watcher with a low threshold would have twitched; foresight absorbed it.

## What just happened

Same readings, same noise, same wall. The reactive monitor watched the level and
got one step of warning - basically the crash itself. /foresight tracked the slope,
smoothed the jitter, projected the line forward, and warned six steps early with a
concrete forecast ("~5 steps to 100%"). That six-step gap is the window a /repair
step gets to act in. See solution.py for the mechanism and the passing assertions.
