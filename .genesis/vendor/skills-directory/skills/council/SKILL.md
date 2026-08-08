---
name: council
description: Use when a single agent's confident answer should be stress-tested before you commit - design decisions with real tradeoffs, risky or irreversible choices (migrations, schema changes, vendor lock-in, pricing, architecture), plans that look too good to be true, or any call where being wrong is expensive. Stages a structured fight between opposing positions and returns the choice that survives the strongest attack against it.
title: Council - decide by structured disagreement
one_liner: Pick the position that holds up best against its strongest opponent, not the one that sounds best unopposed.
outcome: A stable decision that neither side can improve by switching - the choice hardest to overturn.
tags: [decision-making, stress-test, adversarial-review, robustness, tradeoffs]
works_with: [claude, cursor, windsurf, hermes, codex, any-agent]
composable: true
inputs: A decision with two or more real options and stakes high enough that being wrong costs something.
outputs: The chosen option, the worst attack it survives, the runner-up and why it loses, and a stability note.
---

# /council

One confident answer is fragile. It was built in a room with no opponent, so
it only has to beat the questions its own author thought to ask. The first
smart objection that arrives from outside can flip it.

A stress-tested answer is robust. It has already lost the easy fights in
private. What survives is the position that still stands after the other side
pushed as hard as it could. That is the one worth shipping.

/council does not ask one agent for the answer and trust it. It stages a fight.
It assigns opposing roles, makes each side attack the other at full strength,
and selects the position with the best worst case - the choice that is hardest
to overturn, where neither side can do better by changing its move.

## When to use this

Trigger phrases:
- "Should we do X or Y?" where both have real downsides.
- "This plan looks great" / "this looks too good to be true."
- Irreversible or expensive calls: migrations, schema changes, vendor lock-in,
  pricing, public commitments, architecture you will live with for years.
- "I'm confident, but check me."
- Any time a single agent's answer would be trusted without a fight.

Do NOT use it when: the choice is trivial and cheap to reverse. If you can undo
it in five minutes with no blast radius, just pick one and move on. The fight
costs more than the mistake.

## The procedure

1. State the decision and list the real options. Two minimum. Vague options
   produce vague fights - make each one concrete enough to attack.

2. Assign opposing roles. One side is the PROPOSER (argues for an option). The
   other is the strongest CRITIC you can build - not a strawman, the sharpest
   real opponent. If the critic is weak, the result is worthless.

3. Each side pushes hardest. Proposer makes the best case for the option.
   Critic mounts the most damaging attack that option actually faces - the
   response a smart adversary or a bad-luck world would really choose.

4. For every option, find its worst case: assume the critic plays the move
   that hurts that option most. Write down the outcome under that attack, not
   the outcome if everything goes right.

5. Compare options by their worst case, not their best case. The optimistic
   ceiling is a fantasy if a real opponent gets a vote. Rank by the floor each
   option guarantees.

6. Pick the option whose worst case is the least bad. This is the choice that
   holds up when the other side is smart and the world is unkind.

7. Check stability. At the chosen option paired with its strongest counter,
   ask both questions: can the proposer get more by switching options while the
   attack stays fixed? Can the critic do more damage by switching attacks while
   the option stays fixed? If both answers are no, the decision is settled -
   nobody wants to deviate. If either is yes, you mislabeled an option or a
   counter; redo steps 3 to 6.

8. Report the winner, the worst attack it survives, and the runner-up with the
   reason it loses. Keep the disagreement visible. Do not launder it into
   consensus.

## Output format

```
DECISION: <the question>
OPTIONS: <list>

WORST-CASE PER OPTION:
  <option A>  floor = <value/outcome>  (under attack: <the worst counter>)
  <option B>  floor = <value/outcome>  (under attack: <the worst counter>)
  ...

CHOICE: <option with best worst-case>
  survives: <the strongest attack against it and what the outcome is>
  runner-up: <option> loses because <its worst case is worse>
STABILITY: settled / not settled
  proposer cannot improve by switching: yes/no
  critic cannot do more damage by switching: yes/no
```

## Composition (loops)

- Run /council on the loser too. If both options have ugly worst cases, that is
  a signal to generate a third option rather than pick the least-bad of two.
- Feed the surviving choice into a planning or build step, then re-run /council
  when new information changes the payoffs.
- Chain it: use a divergent idea-generation skill to produce options first,
  then /council to select. Generation widens, council prunes.
- Nest it: inside a larger decision, sub-decisions can each get their own
  council before they roll up.

## Pitfalls

- Weak critic. A council with a strawman opponent is theater. The whole value
  is the strength of the strongest attack. Build the critic to win.
- Selling by best case. The moment someone quotes the upside number to justify
  the choice, stop them. The upside is not what you get when opposed.
- Skipping the stability check. A choice that looks robust but where the critic
  still has an unplayed stronger attack is not settled. Verify nobody can
  improve by deviating.
- Forcing consensus. The goal is the position that survives, not a blended
  compromise that no side actually defends. Compromise can be the weakest point
  on the board.
- Fighting over trivia. If reversal is cheap, you are wasting the mechanism.

See references/logic.md for why the best worst-case beats the best best-case,
and what "stable" really means.
