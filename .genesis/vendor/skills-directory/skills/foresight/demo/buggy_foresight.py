"""
demo app for /foresight - a REACTIVE disk monitor with a PLANTED FLAW.

Symptom the "ops team" reports:
    "The disk alert always fires too late. By the time it pages us, the disk
     is already full and the service has crashed. And sometimes it pages us
     for nothing."

What this monitor does (the flaw): it only looks at the CURRENT reading and
shouts when that single reading crosses 95%. Disk usage climbs steadily, but
the readings are NOISY (sampling jitter, temp files, compaction). So:
  - a single noisy spike can fire a false alarm, AND
  - because it waits for the level itself to cross the line, the warning comes
    with essentially zero lead time. You learn you're on fire while burning.

Run it:   python3 buggy_foresight.py
Seeded so it reproduces exactly. Follow walkthrough.md.
"""

import random

random.seed(1234)

# Disk usage climbs ~2.0% per step from a base of 60%, with noisy readings.
# True trend is steady; the sensor is jittery.
TRUE_START = 60.0
TRUE_RATE = 2.0
NOISE = 3.0          # +/- noise on each reading
EXHAUST = 100.0      # disk full -> service dies
ALERT_LEVEL = 95.0   # reactive monitor's only rule
N_STEPS = 30


def true_usage(step):
    return TRUE_START + TRUE_RATE * step


def noisy_reading(step):
    return true_usage(step) + random.uniform(-NOISE, NOISE)


def reactive_monitor(readings):
    """Fires the first time a single reading exceeds ALERT_LEVEL.
    No memory, no trend, no smoothing. Just: is the number big right now?"""
    for step, r in enumerate(readings):
        if r >= ALERT_LEVEL:
            return step
    return None


def exhaustion_step():
    """First step at which TRUE usage hits/exceeds 100%."""
    step = 0
    while true_usage(step) < EXHAUST:
        step += 1
    return step


if __name__ == "__main__":
    readings = [noisy_reading(s) for s in range(N_STEPS)]

    print("step | true usage | noisy reading")
    for s in range(N_STEPS):
        flag = "  <-- ALERT_LEVEL crossed" if readings[s] >= ALERT_LEVEL else ""
        print(f"{s:4d} | {true_usage(s):9.1f}% | {readings[s]:8.1f}%{flag}")

    exhausted = exhaustion_step()
    alert_step = reactive_monitor(readings)

    print()
    print(f"Disk is actually EXHAUSTED (true usage >= 100%) at step {exhausted}.")
    if alert_step is None:
        print("Reactive monitor NEVER fired (missed it entirely).")
    else:
        lead = exhausted - alert_step
        print(f"Reactive monitor first ALERTS at step {alert_step}.")
        print(f"That gives only {lead} step(s) of warning before exhaustion. Too late.")

    # Show the false-alarm hazard: a noisy reading can poke above the line and
    # back down, or the alert can land the step before the wall with no runway.
    print()
    print("Problem: it waits for the LEVEL itself to cross the line. By then")
    print("there is no time to act, and a single noisy spike can mislead it.")
