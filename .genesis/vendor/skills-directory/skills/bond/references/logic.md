# Why learning links from co-success converges to a useful trust map

Start with the honest position: you do not know which collaborators work well
together. Equal trust is the only fair prior. The question is how to move off
that prior using nothing but observed outcomes, and end up with a map that
reflects reality.

## Each outcome is a vote, and the weight is the running tally

Think of a link weight as accumulated evidence. Every time a pair collaborates
and wins, that is one vote that the pairing is good, so you nudge the weight up.
Every time they collaborate and fail, that is a vote against, so you nudge it
down. Do this thousands of times and the weight stops being noise. It settles
near a level that reflects how often that pair actually succeeds together.

This is just statistics done incrementally. A pair with a true 90% success rate
gets pushed up about nine times for every one push down, so its weight rides
high near the ceiling. A pair that clashes at 10% gets pushed down nine times for
every push up, so it sinks toward the floor. The mediocre middle settles in the
middle. You never had to know the true rates - the weights estimate them from
experience, one collaboration at a time.

## Why decay matters: forgetting keeps the map honest

If weights only ever went up on success and down on failure, the map would be a
lifetime ledger. That is a problem, because the world changes: a tool gets
upgraded, an agent's strengths shift, a once-great pairing goes stale. A frozen
ledger keeps trusting partnerships that no longer earn it.

Decay fixes this by gently pulling every link back toward neutral each round. A
partnership that keeps winning keeps getting reinforced faster than it decays, so
it stays high. A partnership that stops being used, or starts failing, is no
longer topped up - so decay slowly erases its old reputation and the map returns
to "I would need fresh evidence to trust this." The map tracks current reality
instead of ancient history. Decay is controlled forgetting, and forgetting is
what lets the system adapt.

## Why the cap matters: no link is allowed to run away

Reinforcement without a ceiling is dangerous. A pair on a hot streak could pile
up an enormous weight that dwarfs every other link, and then routing would send
all work to that one pair forever, even after it stops deserving it. Capping the
weight at a fixed ceiling keeps every link on the same comparable scale. A
floor does the same on the downside so a bad streak cannot drive a weight to
negative infinity and permanently blacklist a pair that might recover. The cap
and floor keep the map readable and bounded.

## Why exploration matters: breaking the feedback loop

Here is the trap. Routing favors high-weight links. High-weight links get used
more. Getting used more means more chances to gain weight. That is a feedback
loop, and left unchecked it locks everything onto whichever pair got lucky first.
The genuinely strong pairs that started slow never get enough trials to prove
themselves, so they stay invisible. The rich get richer and the map is wrong.

Two guards break the loop. First, always spend a slice of work on random pairs,
so every partnership keeps getting sampled and can be discovered no matter how
the early rounds went. Second, route softly - favor strong links in proportion
to their trust rather than always picking the single top one. Soft routing means
several strong pairs all get a healthy share of the work, so the map can surface
all of them instead of collapsing onto one. (You can watch this exact failure in
the demo: hard "always pick the max" routing locks onto one winner and misses the
other strong pairs; soft proportional routing finds all three.)

## What you end up with

After enough rounds, the weights are a learned trust map: genuinely strong pairs
ride near the ceiling, clashing pairs sink to the floor, the rest sit in the
middle. Routing reads that map and sends most work to proven partnerships while
still probing the unknown. No one drew the team chart. The outcomes drew it.

Mental model: trust is a running tally of who has won together lately - reward what works, forget what is stale, and never bet the whole pot on one name.
