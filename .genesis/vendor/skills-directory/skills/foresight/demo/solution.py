"""
solution.py - the /foresight monitor.

Same noisy, steadily-climbing disk readings as buggy_foresight.py (same seed,
identical series). The difference is the MECHANISM:

  The reactive monitor watched the LEVEL and waited for it to cross the line.
  /foresight instead keeps a running estimate of two things:
      (a) where usage IS right now (smoothed, not the raw jittery reading), and
      (b) how fast it is CLIMBING (the rate of change).
  Each new reading is blended into the estimate by how much we trust it: we
  predict the next value from the current trend, then nudge that prediction
  toward the new reading. A noisy spike moves us a little; it cannot panic us.
  Then we PROJECT the trend forward: at this climb rate, how many steps until
  we hit 100%? The moment that projected runway drops below a safety margin,
  we WARN -- with real lead time, while there is still time to act.

Run:  python3 solution.py
"""

import random

random.seed(1234)

TRUE_START = 60.0
TRUE_RATE = 2.0
NOISE = 3.0
EXHAUST = 100.0
ALERT_LEVEL = 95.0
N_STEPS = 30

# How much we trust each fresh reading vs. our running prediction.
# Low = smooth hard, ignore jitter. This is a "trust weight", 0..1.
READING_TRUST = 0.4
RATE_TRUST = 0.3
# Warn when the projected runway to exhaustion falls below this many steps.
SAFETY_MARGIN = 6


def true_usage(step):
    return TRUE_START + TRUE_RATE * step


def noisy_reading(step):
    return true_usage(step) + random.uniform(-NOISE, NOISE)


def reactive_monitor(readings):
    for step, r in enumerate(readings):
        if r >= ALERT_LEVEL:
            return step
    return None


def exhaustion_step():
    step = 0
    while true_usage(step) < EXHAUST:
        step += 1
    return step


def foresight_monitor(readings):
    """Estimate level AND climb rate from noisy readings, then project the
    trend forward to find when usage will cross EXHAUST. Warn while there is
    still runway. Returns (warn_step, projected_steps_to_exhaust_at_warn)."""
    est = readings[0]          # smoothed estimate of current usage
    rate = 0.0                 # estimated climb per step (unknown at first)

    for step, reading in enumerate(readings[1:], start=1):
        # 1) predict where we should be, from the trend we believe.
        predicted = est + rate
        # 2) blend prediction with the new reading by how much we trust it.
        #    a wild single reading only tugs the estimate; it can't yank it.
        new_est = predicted + READING_TRUST * (reading - predicted)
        # 3) update our sense of the climb rate from the smoothed change.
        observed_rate = new_est - est
        rate = rate + RATE_TRUST * (observed_rate - rate)
        est = new_est

        # 4) project the line forward. only meaningful once we see a climb.
        if rate > 0.05:
            runway = (EXHAUST - est) / rate   # steps until we hit 100%
            if runway <= SAFETY_MARGIN:
                return step, runway
    return None, None


if __name__ == "__main__":
    readings = [noisy_reading(s) for s in range(N_STEPS)]

    exhausted = exhaustion_step()
    reactive_step = reactive_monitor(readings)
    warn_step, runway = foresight_monitor(readings)

    print("step | true usage | noisy reading | smoothed est | est rate | projected runway")
    # recompute the trace for display
    est = readings[0]
    rate = 0.0
    print(f"{0:4d} | {true_usage(0):9.1f}% | {readings[0]:8.1f}%   |   {est:7.1f}%  |   {rate:5.2f}  |       --")
    for step in range(1, N_STEPS):
        reading = readings[step]
        predicted = est + rate
        new_est = predicted + READING_TRUST * (reading - predicted)
        observed_rate = new_est - est
        rate = rate + RATE_TRUST * (observed_rate - rate)
        est = new_est
        runway_disp = (EXHAUST - est) / rate if rate > 0.05 else float("inf")
        mark = ""
        if step == warn_step:
            mark = "  <-- /foresight WARNS"
        rstr = f"{runway_disp:6.1f}" if runway_disp != float("inf") else "    --"
        print(f"{step:4d} | {true_usage(step):9.1f}% | {reading:8.1f}%   |   {new_est:7.1f}%  |   {rate:5.2f}  |   {rstr}{mark}")

    print()
    print(f"Disk truly EXHAUSTED at step {exhausted}.")
    print(f"Reactive monitor alerts at step {reactive_step} (lead time: {exhausted - reactive_step} step).")
    print(f"/foresight WARNS at step {warn_step}: projected to hit 100% in ~{runway:.0f} steps.")
    lead_gained = reactive_step - warn_step
    print(f"/foresight bought {exhausted - warn_step} steps of lead time before exhaustion,")
    print(f"and fired {lead_gained} steps EARLIER than the reactive monitor.")

    # The whole point: foresight must warn strictly before the reactive alert,
    # and with real runway to spare.
    assert warn_step is not None, "foresight failed to warn at all"
    assert warn_step < reactive_step, "foresight did not warn earlier than reactive"
    assert exhausted - warn_step >= SAFETY_MARGIN - 1, "foresight warned with no real lead time"
    print()
    print("ASSERTIONS PASSED: foresight warned strictly earlier, with real lead time.")
