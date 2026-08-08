#!/usr/bin/env python3
"""
THE FIX: stop pretending the five signals are five independent facts. Four of them
move together because one unseen cause (promotion) is leaking into all four. /lens
posits that hidden cause, infers a single shared score per item plus how strongly each
signal reflects it, and then scores with the hidden cause counted ONCE instead of four
times. The one signal that stood apart (inspection) keeps its own vote.

We never observe promotion or quality directly. We only see five signals. The
correlation structure alone is enough to reconstruct the shared cause: alternate
between (1) guessing each item's shared score and (2) re-estimating how strongly each
signal loads on it, until both stop moving. Signals that turn out not to load on the
shared cause are exactly the ones carrying independent information.

Stdlib only. Same generator and seed as buggy_lens.py so the comparison is fair.
"""

import random

random.seed(7)


def make_signals(promo, quality):
    def shadow(w_promo):
        return w_promo * promo + 0.25 * quality + random.gauss(0, 0.4)
    return {
        "polish":     shadow(1.4),
        "reviews":    shadow(1.3),
        "popularity": shadow(1.5),
        "buzz":       shadow(1.4),
        "inspection": 1.5 * quality + random.gauss(0, 0.4),
    }


items = []
for i in range(200):
    promo = random.gauss(0, 1)
    quality = random.gauss(0, 1)
    items.append({
        "id": i,
        "promo": promo,
        "quality": quality,
        "merit": quality + promo,
        "signals": make_signals(promo, quality),
    })

KEYS = ["polish", "reviews", "popularity", "buzz", "inspection"]


def mean(xs):
    return sum(xs) / len(xs)


def std(xs):
    m = mean(xs)
    return (sum((x - m) ** 2 for x in xs) / len(xs)) ** 0.5


def corr(xs, ys):
    mx, my = mean(xs), mean(ys)
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / len(xs)
    sx, sy = std(xs), std(ys)
    if sx == 0 or sy == 0:
        return 0.0
    return cov / (sx * sy)


def naive_score(signals):
    return sum(signals.values())


def infer_hidden_cause(rows, keys, iters=200):
    """
    Posit ONE hidden cause behind the signals and reconstruct it from how the
    signals move together. We do not know the shared score for any row, nor how
    strongly each signal reflects the cause, so we alternate:

      - given loadings, the best shared score for a row is the loading-weighted
        blend of its (standardized) signals - signals that reflect the cause
        strongly get more say,
      - given shared scores, the best loading for a signal is how strongly that
        signal tracks the shared score across all rows.

    Repeat until stable. Signals that end up with a near-zero loading are the ones
    carrying information the hidden cause does NOT explain - keep those separate.

    Returns: shared score per row, loading per signal, the per-row z-scores, and the
    column means/spreads (so new rows can be projected through the same structure).
    """
    n = len(rows)

    # Common footing: center and scale, else a loud signal impersonates the cause.
    raw = {k: [r["signals"][k] for r in rows] for k in keys}
    mu = {k: mean(raw[k]) for k in keys}
    sd = {k: std(raw[k]) or 1.0 for k in keys}
    z = [[(rows[i]["signals"][k] - mu[k]) / sd[k] for k in keys] for i in range(n)]

    shared = [mean(z[i]) for i in range(n)]   # first guess: row average
    loadings = [1.0 for _ in keys]

    for _ in range(iters):
        s_var = sum(s * s for s in shared) or 1.0
        loadings = [sum(z[i][j] * shared[i] for i in range(n)) / s_var
                    for j in range(len(keys))]

        l_sq = sum(l * l for l in loadings) or 1.0
        new_shared = [sum(loadings[j] * z[i][j] for j in range(len(keys))) / l_sq
                      for i in range(n)]
        s_sd = std(new_shared) or 1.0
        shared = [s / s_sd for s in new_shared]   # keep unit spread, stop drift

    return shared, loadings, z, mu, sd


def lens_score(zrow, loadings, keys, load_cutoff=0.5):
    """
    Score one row's standardized signals with the hidden cause counted ONCE.
    Signals that load on the shared cause (loading >= cutoff) are collapsed into a
    single shared reading. Signals that do NOT load on it are kept as their own
    independent votes. That kills the double-counting without throwing away the one
    honest signal.
    """
    shared_idx = [j for j in range(len(keys)) if abs(loadings[j]) >= load_cutoff]
    indep_idx = [j for j in range(len(keys)) if abs(loadings[j]) < load_cutoff]

    # one collapsed reading of the shared cause (average of its shadows)
    shared_reading = mean([zrow[j] for j in shared_idx]) if shared_idx else 0.0
    # plus each independent signal, on its own
    indep_sum = sum(zrow[j] for j in indep_idx)
    return shared_reading + indep_sum, shared_idx, indep_idx


print("=== /lens: inferring the one hidden cause behind the correlated signals ===\n")

shared, loadings, z, mu, sd = infer_hidden_cause(items, KEYS)

print("Inferred loadings (how strongly each signal reflects the hidden cause):")
for k, l in zip(KEYS, loadings):
    tag = "  <- shadow of the hidden cause" if abs(l) >= 0.5 else "  <- stands apart (independent)"
    print("   {:>10}: {:+.2f}{}".format(k, l, tag))

# Ground truth check (we secretly know the knobs in this demo).
true_promo = [it["promo"] for it in items]
true_qual = [it["quality"] for it in items]
c_shared_promo = abs(corr(shared, true_promo))
print("\nThe inferred hidden cause vs the ground-truth knobs:")
print("   corr(inferred cause, promotion) = {:.2f}".format(c_shared_promo))
print("   -> the loud shared shadow IS the promotion confound, as suspected.")

# Score the whole pool both ways and see which tracks fair merit.
merit = [it["merit"] for it in items]
naive_scores = [naive_score(it["signals"]) for it in items]
lens_scores = [lens_score(z[i], loadings, KEYS)[0] for i in range(len(items))]

c_naive = corr(naive_scores, merit)
c_lens = corr(lens_scores, merit)
print("\nWhich score tracks fair merit (quality + promo counted once)?")
print("   corr(naive sum, merit) = {:.2f}".format(c_naive))
print("   corr(/lens,     merit) = {:.2f}".format(c_lens))

# Head-to-head the naive scorer flipped.
quiet_good = {"promo": 0.2, "quality": 1.8}
hyped_meh = {"promo": 1.9, "quality": -0.4}
qg_sig = make_signals(quiet_good["promo"], quiet_good["quality"])
hm_sig = make_signals(hyped_meh["promo"], hyped_meh["quality"])

# Project both through the SAME inferred structure (standardize with learned mu/sd).
def project(signals):
    return [(signals[k] - mu[k]) / sd[k] for k in KEYS]

qg_lens = lens_score(project(qg_sig), loadings, KEYS)[0]
hm_lens = lens_score(project(hm_sig), loadings, KEYS)[0]
qg_merit = quiet_good["quality"] + quiet_good["promo"]
hm_merit = hyped_meh["quality"] + hyped_meh["promo"]

print("\n=== HEAD TO HEAD, re-scored with the hidden cause counted once ===\n")
print("QUIET-GOOD merit = {:+.2f}: naive = {:+.2f}, /lens = {:+.2f}".format(
    qg_merit, naive_score(qg_sig), qg_lens))
print("HYPED-MEH  merit = {:+.2f}: naive = {:+.2f}, /lens = {:+.2f}".format(
    hm_merit, naive_score(hm_sig), hm_lens))

# Regression checks: symptom gone, nothing else regressed.
assert c_shared_promo > 0.85, "inferred cause should recover the promotion confound"
assert c_lens > c_naive, "/lens must track fair merit better than the naive sum"
assert qg_lens > hm_lens, "/lens must now prefer the genuinely better item"
# The naive bug must still exist - proves /lens is the only thing that changed.
assert naive_score(hm_sig) > naive_score(qg_sig), "naive bug should still be present"
# inspection must be detected as the one independent signal.
assert abs(loadings[KEYS.index("inspection")]) < 0.5, "inspection should stand apart"
for shadow in ("polish", "reviews", "popularity", "buzz"):
    assert abs(loadings[KEYS.index(shadow)]) >= 0.5, shadow + " should load on the cause"

print("\n=== PASS ===")
print("- Hidden cause reconstructed from correlations alone (r = {:.2f} with promotion).".format(c_shared_promo))
print("- The four shadows were collapsed into one vote; 'inspection' kept its own.")
print("- /lens tracks fair merit far better than the naive sum ({:.2f} vs {:.2f}).".format(c_lens, c_naive))
print("- The head-to-head the naive scorer flipped is now correct: QUIET-GOOD beats HYPED-MEH.")
print("- The naive bug is confirmed still present in the raw sum, so the fix is the only change.")
