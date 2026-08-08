# /lens - the logic behind it

This file explains WHY the procedure works. It deliberately does not name the
academic machinery involved. You do not need the names. You need the logic.

## The one idea

> If signals agree more than independent things should, something you cannot see is making them agree.

You measure surfaces. The real causes are usually hidden. A candidate's interview
score, take-home score, and referral strength are not three separate truths; they
are three windows onto a smaller set of unseen things, like real skill and how much
the candidate was coached. When you treat the windows as if they were the things,
you count one hidden cause as many, and your decisions tilt toward whatever cause
happens to cast the most shadows.

## Why agreement is evidence of a hidden cause

Two genuinely independent signals have no reason to move together. If you flip two
fair coins, knowing one tells you nothing about the other. So when signals DO move
together - reliably, across many items - that coordination has to come from somewhere.
Either one signal drives the other, or, far more often, both are driven by a common
thing sitting behind them. Strong, broad agreement among many signals is the
fingerprint of a shared cause they all reflect. The cause is invisible; its
fingerprint is not.

## Why a few causes can generate many signals

The world that produces your data usually has few real knobs. Promotion budget,
underlying quality, temperature, mood, demand: a handful of these turn, and dozens of
downstream measurements move in response. Each measurement is mostly one or two causes
plus a little noise of its own. That is why you so often see many columns that boil
down to a couple of stories. The signals are plural; the sources are few. /lens is
built on taking that seriously and asking for the sources directly.

## Why you can recover a cause you never measured

Here is the part that feels like magic but is not. You never observe the hidden cause.
You only observe the signals. Yet the pattern of agreement among the signals pins the
cause down. Suppose every signal is roughly "weight times the hidden cause, plus its own
noise." You do not know the weights and you do not know the cause's value for any item.
But you can bootstrap:

- If you had the weights, you could estimate the cause for each item: blend that item's
  signals, letting the signals that reflect the cause most strongly carry the most say.
- If you had the cause's value for every item, you could estimate each weight: see how
  strongly that signal tracks the cause across all items.

You have neither, so you guess one and compute the other, then use that to recompute the
first, and go back and forth. Each pass makes both more consistent with the agreement you
actually observed. The loop settles on the cause and weights that, together, best
reproduce the pattern in the data. You have reconstructed an unobserved thing purely from
the shadows it left.

## Why this is generative, not just compression

A compression move asks "which columns repeat, so I can drop them?" It stays inside the
table. /lens asks a different question: "what unseen thing, if it existed, would have
produced these columns?" It steps outside the table and posits a source that was never
measured, then explains the surface as something that source generated. The output is not
a smaller table. It is a claim about a cause in the world plus a map of how each visible
signal reflects it. That claim is testable: subtract what the cause explains and see if
the leftover agreement really is gone.

## Why the weights tell you shared from unique

Once the loop settles, each signal has a weight saying how strongly it reflects the cause.
A big weight means that signal is mostly a shadow of the cause - it tells you little the
cause does not already. A near-zero weight means the cause does not explain that signal at
all, so whatever that signal measures is its own, independent information. This split is
the practical prize. It tells you which signals to collapse into one vote and which to keep
separate. Lose it, and you either double-count the cause or throw away your one honest,
non-redundant measurement.

## Why you check for a second cause

One cause rarely explains everything. After you subtract what the first cause accounts for,
look at the leftovers. If they still agree, a second hidden cause is hiding in the
residue, and you repeat the whole move on what remains. You keep going until the leftovers
stop agreeing - at that point the coordination is used up and what is left is genuine
per-signal noise. Stopping too early blends two causes into one and corrupts both. Going
too far invents causes out of noise. The leftover agreement is your stopping rule.

## Why interpretation is still your job

The loop will always hand you a cause, even when the signals are pure noise and there is no
cause to find. The math does not know whether the thing it reconstructed corresponds to
anything real. That judgment stays with you. A recovered cause earns trust when it lines up
with something you can name and when removing it actually flattens the leftover agreement.
A cause you cannot interpret and cannot verify is a number, not an insight.

## The mental model in one line

    When many signals agree, stop trusting the signals and ask what unseen thing is making them agree.
