# /kingmaker walkthrough: who really deserves the crown

Senior-engineer narration. Watch the metric get gamed, then watch flow
fix it. Real output from both demo scripts is pasted below.

## The endorsement graph

Two worlds in one network.

The honest world:
- Eight honest voters (a1..a8) endorse two heavyweights, HUB_A and HUB_B.
- HUB_A and HUB_B both endorse TRUST.
- TRUST endorses HUB_A and HUB_B back. A tight, genuinely trusted inner
  circle fed by lots of real voters.

The gamed world:
- C1, C2, C3 form a closed ring: C1 to C2 to C3 to C1. Nobody of
  substance points into it.
- Six sock puppets m1..m6 all dump an endorsement on C1 to pump its
  count.

TRUST receives only two endorsements - but from the two most trusted
hubs in the network. C1 receives seven - all from nobodies.

## Step 1: the naive count crowns the wrong agent

Rank by raw endorsement count. One vote, one vote. Here is what that
gives:

```
Naive ranking by endorsement count:
  C1     7 endorsements
  HUB_A  5 endorsements
  HUB_B  5 endorsements
  TRUST  2 endorsements
  C2     1 endorsements
  C3     1 endorsements

Naive winner: C1
TRUST endorsement count: 2

WRONG: a self-endorsing clique inflated C1 above the
genuinely trusted agent TRUST. Raw counting got gamed.
```

C1 wins with seven nods, all manufactured. TRUST, endorsed by the two
real heavyweights, sits in fourth on a count of two. The clique bought
the crown for the price of six throwaway accounts. This is the failure
mode: counting cannot tell a heavyweight's nod from a puppet's.

## Step 2: spread authority through the network

Now stop counting. Everyone starts equal. Each round, every node hands a
share of its standing to whoever it endorses, split evenly, with a small
uniform leak mixed in so the numbers stay well-behaved and settle. Repeat
until nothing moves.

Watch TRUST, C1, and HUB_A settle round by round. Note how TRUST
overshoots early (round 2), wobbles as influence propagates hop by hop,
and locks in by the end. C1 never climbs back - it has no real inflow to
recirculate.

```
Authority spread converged in 172 rounds.

Watch a few key agents settle, round by round:
  round     TRUST        C1     HUB_A
      1   0.09250   0.30500   0.19875
      2   0.34537   0.08825   0.07231
      3   0.13043   0.08825   0.17978
      5   0.15784   0.11174   0.16608
     10   0.26085   0.18523   0.11458
     20   0.23542   0.14586   0.12729
    172   0.22919   0.14913   0.13041
```

## Step 3: the corrected ranking

After it settles, sort by standing:

```
Final authority ranking (flow-based), top 6:
  TRUST  0.22919
  C1     0.14913
  C2     0.13426
  HUB_A  0.13041
  HUB_B  0.13041
  C3     0.12162

Leader: TRUST
TRUST rank: 1   C1 rank: 2

PASS: flow-based authority crowns the genuinely trusted agent.
PASS: the self-endorsing clique could not inflate C1 past TRUST.
```

TRUST is now first by a clear margin. C1 fell from the crown to second,
and crucially its standing (0.149) cannot climb past TRUST (0.229) no
matter how many more puppets the clique adds - puppets carry almost no
standing to give. The clique can only reshuffle the tiny seed it caught;
it cannot manufacture authority.

## The takeaway

Counting asks "how many point at you." Flow asks "how much standing
reaches you when trusted agents keep passing their trust along." The
first is bought with cheap accounts. The second has to be earned from
agents who are themselves trusted - which is exactly what we wanted to
measure.

See ../references/logic.md for why the iteration always settles and why
it resists gaming.
