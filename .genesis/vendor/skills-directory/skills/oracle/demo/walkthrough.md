# /oracle in real time - the auto-approval gate that trusts a wish

This is a real session you can replay. The system is in `buggy_oracle.py`: an
auto-approval gate that ships any prediction the model claims it is >= 85% sure
about. Run it, then watch /oracle check the claim against reality.

## Reproduce

    $ python3 buggy_oracle.py
    AUTO-APPROVAL GATE (trusts the model's stated confidence)
      threshold to auto-approve : stated >= 85%
      predictions auto-approved : 1559

      gate BELIEVES reliability : 85.0%  (because every claim was >= 85%)
      ACTUAL reliability        : 58.2%
      gap (false security)      : 26.8 points

      wrong decisions shipped   : 651 of 1559  (41.8%)

    The gate thinks it is shipping ~15% errors. It is actually shipping ~42%.
    It trusted the number the model WISHED were true, not the one reality backs.

The gate feels safe. It only let through >= 85% claims, so it believes at most
15% of approvals are wrong. Reality: 42% are wrong. A junior move is to nudge the
threshold to 0.9 and hope. /oracle won't; it checks the claim instead.

## Step 1 - state the suspicion precisely

    SUSPICION: the model's stated confidence is not a measurement. "85% sure" may
    not mean "right 85% of the time." We are gating real approvals on an unchecked
    claim. We must find out what each stated level ACTUALLY comes true at.

## Step 2 - hypotheses about the gap

    1) the model's stated numbers match reality, the gate is fine (belief: L)
    2) the model is systematically overconfident across levels    (belief: H)
    3) it's just noise / too few samples to tell                  (belief: M)

## Step 3 - measure: collect outcomes, group by claim, count hit rates

Take predictions where we know the outcome, bucket them by the confidence the model
CLAIMED, and count how many in each bucket actually came true. That single table
settles all three hypotheses at once.

    $ python3 solution.py
    WHAT THE MODEL CLAIMS vs WHAT REALITY SHOWS
      stated   reality-backed   gap
       55%        43.6%         +11 pts
       65%        46.9%         +18 pts
       75%        52.0%         +23 pts
       85%        56.3%         +29 pts
       95%        60.2%         +35 pts

The gap sits in the same direction at every level and GROWS with the claim. That is
not noise (kills hypothesis 3) and not honesty (kills hypothesis 1). The model is
systematically overconfident (hypothesis 2 survives), worst exactly where the gate
trusts it most.

## Step 4 - learn the gap and report the reality-backed number

The table IS the correction. At decision time we no longer report the model's claim;
we report what predictions at that level actually hit. Measured across a fresh batch:

    TRUST GAP (avg distance between the number we report and reality)
      BEFORE (trust stated)      : 22.9 points
      AFTER  (report corrected)  : 1.1 points
      shrunk by                  : 21.8 points

Reporting the reality-backed number collapses the gap from 22.9 points to 1.1. The
number leaving the system now matches what happens.

## Step 5 - gate on the corrected number

"Auto-approve at 85% reliability" must mean 85% ACTUAL. Apply the threshold to the
corrected number, not the claim:

    DECISION GATE (auto-approve only if reliability >= 85%)
      RAW gate approved          : 1609 predictions, actually right 60.2%
      CORRECTED gate approved    : 0 predictions
      -> the corrected gate refuses the overconfident batch the raw gate waved through.

The raw gate auto-approved 1609 predictions it believed were 85%+ reliable; they were
actually right 60% of the time. No stated level truly reaches 85%, so the corrected
gate approves none of them, exactly right. It refuses the flood the old gate shipped.

    All assertions passed.

## What just happened

We never argued about whether the model was overconfident. We collected outcomes,
grouped predictions by what the model claimed, and counted how often each group came
true. The count handed us a correction, the correction made the reported number match
reality, and the gate finally meant what it said. We acted on the number reality backs,
not the one the model wished were true. That is the whole skill.
