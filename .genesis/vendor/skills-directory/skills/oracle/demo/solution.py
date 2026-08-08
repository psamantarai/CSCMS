"""
solution.py - /oracle applied.

Same overconfident model as buggy_oracle.py. But before trusting any stated
confidence, /oracle MEASURES how often each stated level actually comes true on
a labeled validation set, then learns a stated->actual remap. At decision time
it reports the reality-backed number and gates on THAT.

Shows:
  - overall gap between stated and actual BEFORE the remap (large)
  - overall gap AFTER the remap (small)
  - a gate on CORRECTED confidence correctly refuses the overconfident-but-
    actually-60% predictions that the raw gate wrongly auto-approved.

Run:  python3 solution.py
"""

import random

random.seed(7)

# Reality: how often the model is truly right at each stated level.
TRUE_HIT_RATE = {
    0.55: 0.42,
    0.65: 0.47,
    0.75: 0.52,
    0.85: 0.58,
    0.95: 0.62,
}
STATED_LEVELS = list(TRUE_HIT_RATE.keys())
APPROVE_THRESHOLD = 0.85


def make_predictions(n):
    rows = []
    for _ in range(n):
        stated = random.choice(STATED_LEVELS)
        was_correct = random.random() < TRUE_HIT_RATE[stated]
        rows.append((stated, was_correct))
    return rows


def learn_remap(validation_rows):
    """Group predictions by the confidence the model CLAIMED, then measure the
    real hit rate in each group. Returns stated_level -> reality-backed rate.
    """
    buckets = {}
    for stated, ok in validation_rows:
        slot = buckets.setdefault(stated, [0, 0])  # [hits, total]
        slot[1] += 1
        if ok:
            slot[0] += 1
    return {stated: hits / total for stated, (hits, total) in buckets.items()}


def avg_gap(rows, remap=None):
    """Average |claimed - reality| across predictions. If remap is given, the
    'claimed' number is replaced by the reality-backed one first.
    """
    total = 0.0
    for stated, ok in rows:
        reported = stated if remap is None else remap[stated]
        # reality for this prediction's level is the measured true rate
        truth = TRUE_HIT_RATE[stated]
        total += abs(reported - truth)
    return total / len(rows)


if __name__ == "__main__":
    # 1. Collect a labeled validation set (predictions WITH outcomes).
    validation = make_predictions(4000)

    # 2-4. Group by claimed confidence, measure real hit rate, learn the gap.
    remap = learn_remap(validation)

    print("WHAT THE MODEL CLAIMS vs WHAT REALITY SHOWS")
    print("  stated   reality-backed   gap")
    for s in sorted(STATED_LEVELS):
        print("   {:.0%}        {:.1%}         {:+.0f} pts".format(
            s, remap[s], (s - remap[s]) * 100))
    print()

    # Fresh batch of live predictions to act on.
    live = make_predictions(4000)

    before_gap = avg_gap(live)              # trusting raw stated numbers
    after_gap = avg_gap(live, remap=remap)  # trusting reality-backed numbers

    print("TRUST GAP (avg distance between the number we report and reality)")
    print("  BEFORE (trust stated)      : {:.1f} points".format(before_gap * 100))
    print("  AFTER  (report corrected)  : {:.1f} points".format(after_gap * 100))
    print("  shrunk by                  : {:.1f} points".format((before_gap - after_gap) * 100))
    print()

    # 6. Gate on the CORRECTED number: only auto-approve when the reality-backed
    #    reliability is >= 85%.
    raw_approved = [(s, ok) for (s, ok) in live if s >= APPROVE_THRESHOLD]
    corrected_approved = [(s, ok) for (s, ok) in live if remap[s] >= APPROVE_THRESHOLD]

    raw_actual = (sum(1 for _s, ok in raw_approved if ok) / len(raw_approved)) if raw_approved else 0.0

    print("DECISION GATE (auto-approve only if reliability >= 85%)")
    print("  RAW gate approved          : {} predictions, actually right {:.1%}".format(
        len(raw_approved), raw_actual))
    print("  CORRECTED gate approved    : {} predictions".format(len(corrected_approved)))
    print("  -> the corrected gate refuses the overconfident batch the raw gate waved through.")
    print()

    # ---- assertions: must pass ----
    # After remap the reported number sits on top of reality, so gap collapses.
    assert after_gap < before_gap - 0.10, (before_gap, after_gap)
    # The raw gate let through a batch whose true rate is far under 85%.
    assert raw_actual < 0.85, raw_actual
    assert len(raw_approved) > 0
    # No stated level actually reaches 85% reality, so the corrected gate approves nothing.
    assert len(corrected_approved) == 0, len(corrected_approved)
    # Every level the raw gate trusted is in fact below the bar.
    for s in STATED_LEVELS:
        if s >= APPROVE_THRESHOLD:
            assert remap[s] < APPROVE_THRESHOLD

    print("All assertions passed.")
