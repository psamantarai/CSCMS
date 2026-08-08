# /oracle - the logic behind it

This file explains WHY the procedure works. It deliberately does not name the
academic machinery involved. You do not need it. You need the logic.

## The one idea

> A stated confidence is a claim about the world. A claim is worthless until you
> check it against what actually happened.

When a model says "90%", that number was produced by the model's own internals.
Nothing outside the model has confirmed it. Treating it as "right 90% of the time"
is trusting a witness who has never been cross-examined. /oracle cross-examines it.

## Why a stated probability is not a measurement

A measurement is a comparison against reality: you held the thing up to a ruler.
A stated confidence skipped that step. It is the model reporting how the inputs felt
to its own decision surface, which is a fact about the model, not about the outcome.
Two very different things share the label "90%":

- the model's internal feeling of certainty (what it emits)
- the fraction of "90%" predictions that actually come true (what reality shows)

They only coincide if the model happens to be honest about itself. Most are not.
The whole skill is refusing to confuse the first number with the second.

## Why grouping and counting exposes the skew

You cannot judge one prediction's confidence in isolation. A single "90% sure"
that turned out wrong proves nothing; even an honest 90% is wrong one time in ten.
The signal only appears in aggregate. Take every prediction the model called 90%
and count how many came true. If it is 600 out of 1000, the model's "90%" MEANS 60%,
full stop. That is not an opinion about the model, it is arithmetic on outcomes.

Grouping by stated level and counting the real hit rate per group turns a vague
"the model seems overconfident" into a precise, per-level correction table. A gap
that sits in the same direction across every level (claim high, reality lower) is
systematic, not luck. Systematic gaps are exactly the ones you can correct, because
they will repeat on the next batch the same way they repeated on this one.

## Why the corrected number is the one safe to act on

A decision gate is a bet. "Auto-approve at 85%" is a promise that no more than 15%
of approvals are wrong. If you feed that gate the raw claim, the promise is fiction:
the model's "85%" approvals are actually right 58% of the time, so you are shipping
42% errors while reporting 15%. The harm is not the bad predictions; it is the FALSE
SECURITY. You stopped checking because a number told you it was safe.

Feed the gate the reality-backed number instead and the promise becomes real. A claim
that truly hits 60% never clears an 85% bar, so it gets refused, exactly the outcome
you wanted when you set the bar. The corrected number is safe to act on because it was
defined by the very thing the action cares about: how often it is actually right.

## Why this is a measurement, not an opinion

Nobody argues about the table. You did not decide the model is overconfident; you
counted outcomes and the count said so. Anyone with the same labeled data gets the
same correction. That is what makes it trustworthy: it removes the human (and the
model) from the loop of self-assessment and replaces "how sure do we feel" with
"how often were we right." Feelings are inputs. The hit rate is the verdict.

## Why you must keep re-checking

The correction is a photograph of one batch of reality. Reality moves. A new model
version, a shift in the incoming data, a changed environment can all move the real
hit rates without changing the numbers the model emits. So a correction learned once
and trusted forever quietly rots back into a wish. Re-measure on fresh outcomes; the
verdict is only current as long as the evidence behind it is.

## The mental model in one line

    Don't trust how sure it feels. Count how often it was right, and report that.
