# /lens in real time - the scorer that counted one cause four times

This is a real session you can replay. The bug lives in `buggy_lens.py`: a quality
scorer that sums five signals as if they were five independent facts. Run it, then
watch /lens find the one hidden cause behind four of them. Do NOT read the solution
ahead.

## The surface pattern

A scorer rates items using five signals: polish, reviews, popularity, buzz, and a
hard inspection test. The intent was "more evidence is better, so add it all up."

    $ python3 buggy_lens.py
    === THE NAIVE SCORER: five signals added as if independent ===

    Top 5 items by naive score:
      rank  id   naive   true_merit   promo   quality
        1    75   15.23       2.66      2.34     0.32
        2   179   13.53       2.25      2.39    -0.15
        3    81   12.85       2.29      2.28     0.00
        4   130   11.48       2.23      2.15     0.08
        5    64   11.12       2.34      1.83     0.52

Look at the top 5: every one of them is high on `promo` and near zero on `quality`.
The scorer is ranking by how heavily an item was promoted, not how good it is. The
head-to-head makes it undeniable:

    === HEAD TO HEAD ===

    QUIET-GOOD item: quality = +1.80, promo = +0.20
    HYPED-MEH  item: quality = -0.40, promo = +1.90

    Fair merit (quality + promo counted once):
       QUIET-GOOD: +2.00
       HYPED-MEH:  +1.50

    Naive score (promo counted four times):
       QUIET-GOOD: +6.89
       HYPED-MEH:  +10.26

    Fair ranking prefers:  QUIET-GOOD
    Naive ranking prefers: HYPED-MEH

    WRONG. The naive scorer flipped the ranking because promotion was counted
    four times - once inside every shadow signal - and buried the one honest
    read on quality. The four 'independent' signals were one cause in disguise.

The genuinely better item loses to a heavily promoted mediocre one. The scorer cannot
see why.

## The hypothesis: one hidden cause is behind several signals

If the four signals were independent, they would not move together. So we look at how
they actually move:

    === THE TELL: how the five signals move together ===

               polish     reviews  popularity        buzz  inspection
    polish       1.00        0.91        0.91        0.91        0.15
   reviews       0.91        1.00        0.92        0.91        0.14
popularity       0.91        0.92        1.00        0.91        0.12
      buzz       0.91        0.91        0.91        1.00        0.15
inspection       0.15        0.14        0.12        0.15        1.00

There it is. Polish, reviews, popularity, and buzz all agree at ~0.91 - far more than
independent signals ever would. Inspection stands apart at ~0.15. The hypothesis: one
unseen cause (promotion) generates the four agreeing signals, and inspection is the one
signal carrying something else (real quality). The naive sum gave that one cause four
votes.

## The check: reconstruct the cause and confirm it

`solution.py` posits a single hidden cause and recovers it from the agreement alone -
alternating between guessing each item's cause strength and re-estimating how strongly
each signal reflects it, until both settle.

    $ python3 solution.py
    === /lens: inferring the one hidden cause behind the correlated signals ===

    Inferred loadings (how strongly each signal reflects the hidden cause):
           polish: +0.96  <- shadow of the hidden cause
          reviews: +0.97  <- shadow of the hidden cause
       popularity: +0.97  <- shadow of the hidden cause
             buzz: +0.97  <- shadow of the hidden cause
       inspection: +0.20  <- stands apart (independent)

    The inferred hidden cause vs the ground-truth knobs:
       corr(inferred cause, promotion) = 0.96
       -> the loud shared shadow IS the promotion confound, as suspected.

The recovered cause lines up with promotion at r = 0.96 - and we never told the code
what promotion was. Four signals load hard on it; inspection does not. The hypothesis
holds.

## The corrected scoring

Collapse the four shadows into one reading of the cause, count it once, and keep
inspection as its own vote:

    Which score tracks fair merit (quality + promo counted once)?
       corr(naive sum, merit) = 0.92
       corr(/lens,     merit) = 0.97

    === HEAD TO HEAD, re-scored with the hidden cause counted once ===

    QUIET-GOOD merit = +2.00: naive = +6.89, /lens = +2.57
    HYPED-MEH  merit = +1.50: naive = +10.26, /lens = +1.43

    === PASS ===
    - Hidden cause reconstructed from correlations alone (r = 0.96 with promotion).
    - The four shadows were collapsed into one vote; 'inspection' kept its own.
    - /lens tracks fair merit far better than the naive sum (0.97 vs 0.92).
    - The head-to-head the naive scorer flipped is now correct: QUIET-GOOD beats HYPED-MEH.
    - The naive bug is confirmed still present in the raw sum, so the fix is the only change.

The flip is fixed. QUIET-GOOD (+2.57) now beats HYPED-MEH (+1.43), matching fair merit.
The naive sum still prefers HYPED-MEH, which proves /lens is the only thing that changed.

## What to carry away

The bug was not in any one signal. It was in the assumption that five signals meant five
independent facts. Four of them were one unseen cause wearing four costumes. /lens did not
drop columns - it posited the cause that would generate the agreement, recovered it from
the correlations alone, and then counted it once. The signal that stood apart kept its
vote. That is the whole move: when signals agree too much, stop trusting the signals and
ask what is making them agree.
