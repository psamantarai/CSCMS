# /foresight - the logic behind it

This file explains WHY the procedure works. It deliberately does not name the
academic methods involved. You do not need them. You need the logic.

## The one idea

> The level tells you where you are. The rate tells you where you'll be. Only one
> of those can warn you in time.

A reactive monitor asks "is the number bad right now?" By the time the answer is
yes, the bad thing is happening. /foresight asks a different question: "given how
this is moving, when does it become bad?" That question has an answer BEFORE the
event, and that head start is the entire value of the skill.

## Why tracking the rate beats tracking the level

Two disks both read 88% right now. One has been flat for a week. The other has
climbed 2% per hour. The level says they're identical. They are not remotely
identical - one is fine, the other hits the wall in six hours. The information you
need to act lives in the rate of change, not the current value. A monitor that
only stores the latest number has thrown away the one thing that predicts the
future. Keeping a running estimate of the slope is what turns a thermometer into a
forecast.

## Why you blend prediction with measurement instead of believing each reading

Real sensors lie a little on every sample. Sampling jitter, a temp file, a
compaction job - the reading wobbles around the truth. If you believe each raw
number, two failures follow:

- a lone high sample fires a false alarm (the spike falls back next tick), and
- a lone low sample masks a real climb (you relax right before the wall).

So you don't believe the reading outright, and you don't ignore it either. You
already have a prediction - where your trend says the next value should land. You
take a weighted reconciliation of the two: start from the prediction, then move it
toward the new reading by an amount that reflects how much you trust the sensor. A
jittery sensor earns a small weight, so a wild reading only tugs your estimate;
the trend holds it steady. A clean sensor earns a large weight, so you track it
closely. You are merging two noisy opinions into one estimate that is steadier
than either - that is why the smoothed line is calmer than the raw readings and
still follows the real climb.

The same logic applies to the rate: you estimate the slope from the SMOOTHED
changes, not the raw jumps, so a single spike doesn't make you think the metric
suddenly accelerated.

## Why projecting forward buys lead time

Once you hold a steady estimate of the level and a steady estimate of the rate,
the future is a straight line you can read off:

    steps until the wall = (limit - where you are now) / how fast you're climbing

That single division is the warning. It fires the moment the projected runway
drops below the margin you need to act - which is necessarily EARLIER than the
level itself reaching the limit, because you're acting on the forecast instead of
the arrival. The gap between "projected to breach" and "actually breached" is the
window in which a fix can still work. A reactive monitor has no such window; its
warning and its incident are the same moment.

## The danger of trusting noisy single readings

The deepest trap is treating one bad sample as truth. Noise is symmetric: for
every false spike there's a false dip, and reacting to either is a mistake. The
discipline is to let evidence accumulate into the estimate gradually. A reading
that's real and sustained will keep pushing the estimate the same direction and
the trend will register it. A reading that's just noise will be contradicted by
the next one and wash out. You earn robustness by being slightly slow to believe
any single number - and you keep your lead time by tracking the trend, which sees
the climb long before the level crosses any line.

## Knowing how hard to smooth

There's a tension. Smooth too little and you track the noise: the estimate flaps,
the projected runway jumps around, you flap with it. Smooth too much and you lag
reality: by the time your estimate catches up to a real climb you've spent the
lead time you were trying to win. The trust weight is the dial. Set it against the
sensor's jitter: noisier sensor, smooth harder; cleaner sensor, react faster.
There is no universal value - there is only the value that matches your noise.

## The mental model in one line

    Don't watch the level cross the line. Estimate the slope and read off when it will.
