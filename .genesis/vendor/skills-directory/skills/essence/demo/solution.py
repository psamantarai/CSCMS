"""
solution.py - buggy_essence.py with /essence applied.

The naive code treated all 10 columns as independent and equally important, so a
single duplicated signal hijacked every distance and every "insight". /essence
finds the few directions the data actually moves along, shows that just TWO of them
carry ~95%+ of all the variation, collapses the 10 columns to those 2 axes, and runs
the nearest-neighbor lookup there instead. Same information, no double-counting,
cheaper.

Mechanism (pure python, std lib only):
  - center every column (subtract its mean)
  - build the table of how the columns move together
  - find the direction of largest spread by repeatedly nudging a guess vector
    through that table and renormalizing until it stops moving (it converges to the
    direction the data is most spread along)
  - remove that direction and repeat for the next
  - measure each direction's share of total spread; keep the few that matter

Run:  python3 solution.py
"""

import random
import math

random.seed(7)

N = 200
N_COLS = 10


# ---- same dataset generator as buggy_essence.py (two true signals, ten echoes) ----
def make_dataset():
    recipes = [
        (1.0, 0.0), (0.95, 0.05), (0.90, 0.10), (0.92, 0.08), (0.88, 0.12),
        (0.85, 0.05), (0.10, 0.90), (0.05, 0.95), (0.50, 0.50), (0.97, 0.03),
    ]
    rows = []
    for _ in range(N):
        spend = random.gauss(0, 4.0)
        engage = random.gauss(0, 1.5)
        row = []
        for (w1, w2) in recipes:
            noise = random.gauss(0, 0.15)
            row.append(w1 * spend + w2 * engage + noise)
        rows.append(row)
    return rows


# ---------------- linear-algebra helpers (pure python) ----------------
def col_means(rows):
    m = len(rows[0])
    return [sum(r[i] for r in rows) / len(rows) for i in range(m)]


def center(rows):
    means = col_means(rows)
    return [[r[i] - means[i] for i in range(len(r))] for r in rows], means


def move_together_matrix(centered):
    """How the columns move together: entry (i,j) is the average product of column i
    and column j across rows. Large positive means they rise and fall in lockstep."""
    n = len(centered)
    m = len(centered[0])
    M = [[0.0] * m for _ in range(m)]
    for i in range(m):
        for j in range(i, m):
            s = sum(centered[r][i] * centered[r][j] for r in range(n)) / n
            M[i][j] = s
            M[j][i] = s
    return M


def mat_vec(M, v):
    return [sum(M[i][j] * v[j] for j in range(len(v))) for i in range(len(M))]


def norm(v):
    return math.sqrt(sum(x * x for x in v))


def normalize(v):
    nrm = norm(v)
    return [x / nrm for x in v] if nrm > 0 else v


def dot(a, b):
    return sum(a[i] * b[i] for i in range(len(a)))


def largest_spread_direction(M, iters=500):
    """Find the direction of largest spread by repeatedly nudging a random guess
    through the move-together table and renormalizing. It converges to the axis the
    data is most spread along; the matching spread amount comes out as the scale."""
    m = len(M)
    v = normalize([random.gauss(0, 1) for _ in range(m)])
    for _ in range(iters):
        w = mat_vec(M, v)
        nw = norm(w)
        if nw == 0:
            break
        v_new = [x / nw for x in w]
        # stop early once the direction settles
        if abs(abs(dot(v_new, v)) - 1.0) < 1e-12:
            v = v_new
            break
        v = v_new
    spread = dot(v, mat_vec(M, v))   # how much spread lies along this direction
    return v, spread


def remove_direction(M, v, spread):
    """Strip out everything the found direction explains, so the next search finds a
    genuinely new direction instead of re-telling us this one."""
    m = len(M)
    return [[M[i][j] - spread * v[i] * v[j] for j in range(m)] for i in range(m)]


def top_directions(M, k):
    dirs, spreads = [], []
    work = [row[:] for row in M]
    for _ in range(k):
        v, s = largest_spread_direction(work)
        dirs.append(v)
        spreads.append(s)
        work = remove_direction(work, v, s)
    return dirs, spreads


def project(row, means, dirs):
    centered = [row[i] - means[i] for i in range(len(row))]
    return [dot(centered, d) for d in dirs]


def euclidean(a, b):
    return math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(len(a))))


# ------------------------------ run /essence ------------------------------
if __name__ == "__main__":
    data = make_dataset()
    centered, means = center(data)
    M = move_together_matrix(centered)

    # total variation = sum of spread along every column (the diagonal of M)
    total_spread = sum(M[i][i] for i in range(len(M)))

    # find ALL 10 directions so we can see the variation curve flatten
    all_dirs, all_spreads = top_directions(M, N_COLS)

    print("=== /essence: find the directions the data actually moves along ===\n")
    print("Variation captured by each direction (largest spread first):")
    running = 0.0
    fractions = []
    for idx, s in enumerate(all_spreads):
        frac = s / total_spread
        fractions.append(frac)
        running += frac
        print("   direction %d: %6.2f%% of variation   (running total %6.2f%%)" %
              (idx + 1, 100 * frac, 100 * running))
    print()

    top2_fraction = fractions[0] + fractions[1]
    print("Top 2 directions capture %.2f%% of ALL the variation." % (100 * top2_fraction))
    print("The other 8 directions together hold %.2f%% - that's the noise/repeats.\n"
          % (100 * (1 - top2_fraction)))

    # the asserted claim: a handful (2) explains almost everything
    assert top2_fraction > 0.9, "expected top-2 directions to capture >90%% of variation, got %.3f" % top2_fraction
    print("ASSERT PASSED: top-2 captured fraction %.4f > 0.90\n" % top2_fraction)

    # collapse the 10 columns to the 2 meaningful axes
    dirs2 = all_dirs[:2]
    coords = [project(row, means, dirs2) for row in data]
    print("Collapsed 10 columns -> 2 axes. Customer #0 is now just:",
          "[%.3f, %.3f]" % (coords[0][0], coords[0][1]), "\n")

    # nearest-neighbor lookup now runs on the 2 honest axes
    target = coords[0]
    best_j, best_d = None, float("inf")
    for j in range(1, len(coords)):
        d = euclidean(target, coords[j])
        if d < best_d:
            best_d, best_j = d, j

    print("=== NEAREST-NEIGHBOR LOOKUP on the 2 axes ===")
    print("Most similar customer to #0 is #%d (distance %.3f on 2 axes)." % (best_j, best_d))
    print()
    print("Now both real signals get a fair say instead of one being counted 7 times.")
    print("Distance compares 2 numbers, not 10. Same information, no double-counting,")
    print("and roughly 5x less arithmetic per comparison. That is the essence kept.")
