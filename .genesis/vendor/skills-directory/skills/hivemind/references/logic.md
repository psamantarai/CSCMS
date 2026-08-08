# Why leaderless coordination through a shared, fading signal works

## The core idea

Coordination usually implies a coordinator: someone who sees the whole picture,
decides, and tells everyone what to do. That central brain is convenient but
costly. It caps throughput at one brain's capacity, it is a single point of
failure, and it gets more loaded as you add workers - the opposite of scaling.

There is another way to get coordinated behavior: don't communicate decisions,
communicate through the environment. Each agent leaves a trace of what it did
and how well it worked. Other agents read those traces and adjust. No agent ever
talks to another agent directly, and no agent has the global picture. Yet the
group behaves as if coordinated. The coordination is real but it lives in the
shared medium, not in any head.

## Why a shared signal produces global order from local acts

Each agent only does something tiny and local: pick a path, score it, leave a
mark proportional to the score, and lean toward stronger marks next time. None
of that requires knowing what the other agents are doing.

But the marks aggregate. A path that many agents found good collects many
deposits. Because agents bias their choices toward stronger marks, a good path
attracts more traffic, which deposits more marks, which attracts still more
traffic. That is a positive feedback loop: success compounds. The strength
distribution in the shared space becomes a live tally of the fleet's collective
experience, even though no single agent ever computed it.

This is how local rules turn into global structure. The "decision" of which path
is best is never made by anyone. It emerges as the place where deposits pile up.
Read the shared space and the consensus is just sitting there.

## Why reinforcement ALONE fails: stale lock-in

Positive feedback has a dark side. If marks only ever accumulate, the first
option to get ahead keeps getting reinforced. Its lead grows. Even if the world
changes and that option becomes terrible, the historical pile of marks still
dominates the choice probabilities, so agents keep picking it, so it keeps
getting reinforced. The loop that found the good answer now defends a bad one.

The system has memory but no forgetting. It cannot track a moving target. The
buggy demo shows exactly this: path A is best early, accumulates a huge lead,
and when path C becomes the genuinely best option the fleet is mathematically
unable to escape A's gravity.

## Why fade fixes it: forgetting is a feature

Add one rule: every mark loses a fixed fraction of its strength each tick. Now a
mark only stays strong if agents keep reinforcing it. The moment a path stops
paying off, agents stop depositing there, and its existing marks decay away. The
fleet drifts off it automatically.

Fade turns the shared signal from a permanent record into a recency-weighted
one. Recent success counts; ancient success evaporates. That is precisely what
you need to follow a moving best answer: the consensus reflects what is working
now, not what worked once.

Reinforcement and fade are a matched pair. Reinforcement concentrates effort on
what works (exploitation). Fade plus a little random sampling keeps the fleet
from getting trapped, so it can find what newly works (exploration). Together
they make a leaderless system that both commits hard to a good answer AND lets
go of it when a better one appears.

## The tradeoff in the fade rate

The fade rate is the single most important knob, and it is a genuine tradeoff:

- Fade too slowly (factor near 1): the system behaves almost like the no-fade
  version. It has long memory and strong consensus, but it is sluggish to adapt
  and prone to locking onto an early winner. Stability at the cost of agility.

- Fade too quickly (factor near 0): marks evaporate before they can accumulate.
  Good paths never build enough signal to attract the fleet, consensus never
  forms, and behavior degrades toward random. Agility at the cost of ever
  deciding anything.

The right fade rate sits between: slow enough that a genuinely good path can
build a clear lead within a few rounds, fast enough that a path which stops
working loses that lead before it does too much damage. It scales with how fast
your world changes - volatile environments want faster fade, stable ones want
slower. Exploration rate and the strength floor are secondary knobs that keep
options alive so the fleet can always rediscover them.

## Why this is resilient and scalable

Because all state lives in the shared space, agents are interchangeable and
disposable. Kill any worker and the marks persist; the rest carry on. Add
workers and you get more sampling and faster convergence with zero extra load on
any coordinator, because there is no coordinator. The shared space is the only
shared dependency, and it does no decision-making - it just holds numbers.

Mental model: lay down trails where things worked, let the trails slowly fade,
and the crowd will always be walking on whatever currently works.
