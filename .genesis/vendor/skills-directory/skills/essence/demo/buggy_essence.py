"""
demo app for /essence - a tiny "customer dashboard" with a PLANTED PROBLEM.

The setup the "user" describes:
    "We collect 10 metrics per customer. Our nearest-neighbor lookup (find the most
     similar customer) feels off, and our insights report just says the same thing
     ten different ways. But more columns should mean more insight, right?"

The truth, hidden in the data: there are only TWO real underlying signals
(call them 'spend appetite' and 'engagement'). The other eight columns are noisy
copies / blends of those two. This script treats all 10 columns as independent and
equally important. Watch what goes wrong.

Run it:   python3 buggy_essence.py
No third-party libraries required.
"""

import random
import math

random.seed(7)

N = 200          # customers
N_COLS = 10      # observed metrics per customer


def make_dataset():
    """Two true signals; ten observed columns are noisy linear blends of them.

    Column recipe (weight_on_signal1, weight_on_signal2):
      most columns lean hard on signal 1 (spend), so the data is heavily
      redundant in that direction. This is deliberate.
    """
    recipes = [
        (1.0, 0.0),   # col0  pure spend
        (0.95, 0.05), # col1  spend echo
        (0.90, 0.10), # col2  spend echo
        (0.92, 0.08), # col3  spend echo
        (0.88, 0.12), # col4  spend echo
        (0.85, 0.05), # col5  spend echo
        (0.10, 0.90), # col6  engagement
        (0.05, 0.95), # col7  engagement echo
        (0.50, 0.50), # col8  blend
        (0.97, 0.03), # col9  spend echo
    ]
    rows = []
    for _ in range(N):
        spend = random.gauss(0, 4.0)        # true signal 1
        engage = random.gauss(0, 1.5)       # true signal 2 (naturally smaller spread)
        row = []
        for (w1, w2) in recipes:
            noise = random.gauss(0, 0.15)
            row.append(w1 * spend + w2 * engage + noise)
        rows.append(row)
    return rows


def euclidean(a, b):
    """Distance treating all 10 columns as independent and equally weighted."""
    return math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(len(a))))


def column_means(rows):
    m = len(rows[0])
    return [sum(r[i] for r in rows) / len(rows) for i in range(m)]


def column_stdevs(rows):
    m = len(rows[0])
    means = column_means(rows)
    out = []
    for i in range(m):
        var = sum((r[i] - means[i]) ** 2 for r in rows) / len(rows)
        out.append(math.sqrt(var))
    return out


if __name__ == "__main__":
    data = make_dataset()

    print("=== THE NAIVE DASHBOARD: all 10 columns treated as independent ===\n")

    # 1) The "insights" report: print every column's spread as if each is its own fact.
    stds = column_stdevs(data)
    print("Per-column spread (the report calls each one a separate 'insight'):")
    for i, s in enumerate(stds):
        print("   col%d spread = %6.3f" % (i, s))
    print()
    print("The report proudly lists 10 insights. But columns 0,1,2,3,4,5,9 all have")
    print("nearly identical spread and all rise/fall together. They are ONE signal")
    print("restated seven times. The dashboard is double-counting and can't see it.\n")

    # 2) Nearest-neighbor lookup over all 10 raw columns.
    target = data[0]
    best_j, best_d = None, float("inf")
    for j in range(1, len(data)):
        d = euclidean(target, data[j])
        if d < best_d:
            best_d, best_j = d, j

    # Show WHY the distance is dominated by the repeated 'spend' direction.
    # Split the squared distance into spend-echo columns vs engagement columns.
    spend_cols = [0, 1, 2, 3, 4, 5, 9]
    engage_cols = [6, 7]
    sq_spend = sum((target[i] - data[best_j][i]) ** 2 for i in spend_cols)
    sq_engage = sum((target[i] - data[best_j][i]) ** 2 for i in engage_cols)
    total_sq = best_d ** 2

    print("=== NEAREST-NEIGHBOR LOOKUP over all 10 raw columns ===\n")
    print("Most similar customer to #0 is #%d (distance %.3f)." % (best_j, best_d))
    print("Where does that distance come from?")
    print("   from the 7 'spend' echo columns: %5.1f%% of the squared distance" %
          (100 * sq_spend / total_sq))
    print("   from the 2 'engagement' columns: %5.1f%% of the squared distance" %
          (100 * sq_engage / total_sq))
    print()
    print("PROBLEM: because one real signal is duplicated across 7 columns, it")
    print("dominates the distance ~7-to-2. 'Similar customer' really means 'similar")
    print("spender' and almost ignores engagement. We measured 10 columns and got a")
    print("biased 2-signal answer, at 10 columns' worth of cost. The redundancy is")
    print("invisible to this code. See walkthrough.md, then solution.py.")
