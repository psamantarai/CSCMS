#!/usr/bin/env python3
"""
THE BUG: a quality scorer rates items using five surface signals. Four of them
(polish, reviews, popularity, recency-buzz) are all secretly shadows of ONE hidden
thing - how heavily the item was promoted. The fifth (a hard inspection test) is a
genuinely independent signal of real quality.

The scorer adds all five as if they were five independent facts. They are not. The
promotion cause is counted four times, so it stampedes over the one signal that
actually measures quality on its own. Items that were promoted hard but are mediocre
beat items that are genuinely good but quiet. The failure only bites certain inputs,
which is why nobody caught it.

Run this. Watch a heavily-promoted mediocre item beat a quiet excellent one.
Stdlib only.
"""

import random

random.seed(7)

# Two hidden truths per item we wish we could read directly:
#   promo   = how much marketing push it got   (a confound; we should NOT reward it 4x)
#   quality = how good it actually is           (what we care about)
#
# Four surface signals are mostly shadows of promo. The fifth, "inspection", is an
# independent read on quality. True merit we want to rank by = quality + promo
# counted ONCE (promotion is a fine tiebreaker, just not worth 4 votes).

def make_signals(promo, quality):
    def shadow(w_promo):
        return w_promo * promo + 0.25 * quality + random.gauss(0, 0.4)
    return {
        "polish":     shadow(1.4),
        "reviews":    shadow(1.3),
        "popularity": shadow(1.5),
        "buzz":       shadow(1.4),
        # the one genuinely independent signal of quality:
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
        "merit": quality + promo,          # what a fair ranking should track
        "signals": make_signals(promo, quality),
    })


def naive_score(signals):
    # The bug: treat all five signals as independent evidence and add them up.
    # Promotion lives inside four of them, so it gets four votes; quality gets one.
    return sum(signals.values())


print("=== THE NAIVE SCORER: five signals added as if independent ===\n")

ranked = sorted(items, key=lambda it: naive_score(it["signals"]), reverse=True)
print("Top 5 items by naive score:")
print("  rank  id   naive   true_merit   promo   quality")
for rank, it in enumerate(ranked[:5], 1):
    print("   {:>2}   {:>3}   {:>5.2f}     {:>6.2f}    {:>6.2f}   {:>6.2f}".format(
        rank, it["id"], naive_score(it["signals"]), it["merit"], it["promo"], it["quality"]))

# Smoking gun: two items head to head.
quiet_good = {"promo":  0.2, "quality":  1.8}   # genuinely excellent, barely promoted
hyped_meh  = {"promo":  1.9, "quality": -0.4}   # mediocre, heavily promoted

qg_sig = make_signals(quiet_good["promo"], quiet_good["quality"])
hm_sig = make_signals(hyped_meh["promo"],  hyped_meh["quality"])

qg_merit = quiet_good["quality"] + quiet_good["promo"]   # = +0.8
hm_merit = hyped_meh["quality"]  + hyped_meh["promo"]    # = +1.5  ... wait, see below

print("\n=== HEAD TO HEAD ===\n")
print("QUIET-GOOD item: quality = {:+.2f}, promo = {:+.2f}".format(
    quiet_good["quality"], quiet_good["promo"]))
print("HYPED-MEH  item: quality = {:+.2f}, promo = {:+.2f}".format(
    hyped_meh["quality"], hyped_meh["promo"]))

qs = naive_score(qg_sig)
hs = naive_score(hm_sig)
print("\nFair merit (quality + promo counted once):")
print("   QUIET-GOOD: {:+.2f}".format(qg_merit))
print("   HYPED-MEH:  {:+.2f}".format(hm_merit))
print("\nNaive score (promo counted four times):")
print("   QUIET-GOOD: {:+.2f}".format(qs))
print("   HYPED-MEH:  {:+.2f}".format(hs))

winner_fair  = "QUIET-GOOD" if qg_merit > hm_merit else "HYPED-MEH"
winner_naive = "QUIET-GOOD" if qs > hs else "HYPED-MEH"
print("\nFair ranking prefers:  {}".format(winner_fair))
print("Naive ranking prefers: {}".format(winner_naive))

if winner_naive != winner_fair:
    print("\nWRONG. The naive scorer flipped the ranking because promotion was counted")
    print("four times - once inside every shadow signal - and buried the one honest")
    print("read on quality. The four 'independent' signals were one cause in disguise.")
else:
    print("\n(This seed dodged it; the failure mode is still real - the inputs decide.)")

# The tell: how the five signals move together.
def corr(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / n
    sx = (sum((x - mx) ** 2 for x in xs) / n) ** 0.5
    sy = (sum((y - my) ** 2 for y in ys) / n) ** 0.5
    return cov / (sx * sy)

keys = ["polish", "reviews", "popularity", "buzz", "inspection"]
cols = {k: [it["signals"][k] for it in items] for k in keys}
print("\n=== THE TELL: how the five signals move together ===\n")
print("           " + "  ".join("{:>10}".format(k[:10]) for k in keys))
for k1 in keys:
    row = "  ".join("{:>10.2f}".format(corr(cols[k1], cols[k2])) for k2 in keys)
    print("{:>10} {}".format(k1, row))
print("\nFour signals (polish/reviews/popularity/buzz) move together hard - they are")
print("one hidden cause wearing four costumes. 'inspection' stands apart: it is the")
print("one signal carrying something the others do not. The naive sum cannot see this.")
