# Walkthrough: /bond catching the problem in real time

This narrates the demo. Both scripts are stdlib-only Python3, seeded for
reproducibility. The output below is pasted verbatim from real runs.

## The hidden truth

The world has a secret affinity map the orchestrator cannot see. Among six
agents (A-F), three pairs genuinely work well together and two genuinely clash:

```
A+C = 0.90   (strong)
B+E = 0.85   (strong)
D+F = 0.80   (strong)
A+B = 0.10   (clash)
C+E = 0.12   (clash)
everything else = 0.35  (mediocre)
```

The number is the probability that the pair produces a good outcome when they
collaborate. The whole job is to find the strong pairs and route work to them -
without ever being told which they are.

## Step 1: the naive baseline fails

`buggy_bond.py` trusts everyone equally and never learns. It picks two agents at
random every round and just hopes. Real output:

```
============================================================
NAIVE ORCHESTRATOR: equal trust, no learning
============================================================
rounds run            : 4000
avg success rate      : 0.413
best pair's true rate : 0.900  (the ceiling)
gap left on the table : 0.487

The hidden strong partnerships were:
  A+C = 0.90,  B+E = 0.85,  D+F = 0.80
The orchestrator never found them. It kept rolling dice,
re-forming clashing teams (A+B=0.10, C+E=0.12) just as often
as winning ones. Equal trust = throwing away free success.
```

0.413 success. The ceiling was 0.90. Almost half the available success thrown
away, every single round, forever. Equal trust never improves because it never
looks at what happened.

## Step 2: learn the trust network

`solution.py` keeps a weight per pair, starts them all equal, then after each
collaboration reinforces the link on a good outcome, weakens it on a bad one,
and decays every link a little each round. Routing favors strong links softly
and keeps a slice of exploration. Real output:

```
============================================================
LEARNED TRUST NETWORK vs NAIVE EQUAL TRUST
============================================================
naive   avg success rate : 0.413
learned avg success rate : 0.699
improvement              : +0.286

Trust weights climbing/fading over rounds:
round | A+C | B+E | D+F | A+B | C+E
-----------------------------------
   50 | 0.99  | 0.76  | 0.66  | 0.50  | 0.49 
  200 | 0.99  | 0.87  | 0.66  | 0.40  | 0.47 
 1000 | 0.99  | 0.98  | 0.73  | 0.46  | 0.44 
 4000 | 0.99  | 0.73  | 0.66  | 0.37  | 0.44 

(A+C, B+E, D+F are the genuinely strong pairs -> climb)
(A+B, C+E genuinely clash -> fade toward floor)

Top 3 learned links : [('A', 'C'), ('B', 'E'), ('D', 'F')]
Top 3 true-affinity : [('A', 'C'), ('B', 'E'), ('D', 'F')]

PASS: learned trust beats naive by a wide margin AND
PASS: the top learned links match the true strong partnerships.
```

Read the table left to right. The strong pairs (A+C, B+E, D+F) climb above
neutral and stay high. The clashing pairs (A+B, C+E) fade below 0.5 toward the
floor. By the end the top three learned links are exactly the three genuinely
strong partnerships - and success jumps from 0.413 to 0.699.

## Step 3: the lock-in trap we had to avoid

The first version of the solution routed purely to the single highest-weight
link (hard exploit). It locked onto A+C in the first 50 rounds, kept feeding it
all the work, and never gathered enough evidence on B+E. Its learned top three
came out as `[A+C, D+F, B+F]` - it missed a genuinely strong pair and surfaced a
mediocre one. That is the rich-get-richer failure the skill warns about, caught
live.

The fix was soft routing: sample pairs in proportion to their trust weight
instead of always grabbing the max. That gives every strong pair enough trials
to prove itself, so all three rose to the top. Same reinforce/weaken/decay
mechanism - just routing that does not bet the whole pot on the first winner.

## Takeaway

Equal trust is a flat 0.413 forever. Learned trust reads the outcomes, builds the
map nobody drew, and routes to the partnerships that actually pay off. Reward
what works, forget what is stale, and keep exploring so you find every winner.
