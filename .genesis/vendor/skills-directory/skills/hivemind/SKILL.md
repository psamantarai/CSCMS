---
name: hivemind
description: Use when coordinating many workers without a central dispatcher, removing an orchestrator bottleneck or single point of failure, letting a fleet self-organize onto whatever is currently working, load-balancing or path-finding across agents with no boss, or building resilience so the system keeps running even if the coordinator dies. Agents leave and read signals in a shared space so good paths get reinforced and stale ones fade, with nobody in charge.
title: Hivemind - leaderless self-organizing coordination
one_liner: Coordinate a fleet of agents with no boss by leaving fading signals in a shared space.
outcome: A fleet of agents that self-organizes onto the best current path and adapts when conditions change, with no central orchestrator to bottleneck or fail.
tags: [coordination, decentralized, self-organizing, resilience, load-balancing, multi-agent]
works_with: [claude, cursor, windsurf, hermes, codex, any-agent]
composable: true
inputs:
  - A set of agents/workers that can each attempt the task independently
  - A shared, readable/writable space (file, KV store, table) all agents can see
  - A way to score how good a result/path was (lower cost = better)
outputs:
  - A consensus path/strategy revealed by where the strongest signals concentrate
  - Continuous adaptation as the best option shifts over time
---

# /hivemind

A central orchestrator that hands work to every agent is a bottleneck. Every
decision routes through one brain, so throughput caps at what that brain can
process. Worse, it is a single point of failure: kill the orchestrator and the
whole fleet goes dark. And it scales badly - more workers means more load on the
one coordinator, not more parallelism.

/hivemind removes the boss. Agents coordinate indirectly. When an agent finds
something good - a working path, a useful result - it leaves a mark in a shared
space. Other agents read those marks and are drawn toward the stronger ones.
Marks fade over time unless something keeps reinforcing them. So effort
naturally concentrates on what is working right now, and quietly abandons what
stopped paying off. No one is in charge, yet the fleet acts coordinated.

The trick is that all the intelligence lives in the shared environment, not in
any single agent. That makes it scale (add workers, no extra coordinator load)
and makes it resilient (any agent can die and the marks persist).

## When to use this

Reach for /hivemind when:
- You have many workers and a single dispatcher is the throughput ceiling.
- You need the system to survive the coordinator crashing.
- The "best" option drifts over time and you want the fleet to follow it.
- You are load-balancing or path-finding and want emergent consensus, not a
  hand-tuned routing table.
- Agents come and go and you cannot rely on a fixed roster.

Do NOT use it when:
- You genuinely need strict global ordering (e.g. a serialized ledger).
- One authoritative decision must be made once, correctly, by a known owner.
- Correctness depends on every agent seeing the exact same state instantly.
- The task is tiny or single-threaded; the coordination overhead is not worth it.

## The procedure

1. Define the shared space and what a mark means. Pick a medium every agent can
   read and write (a file, a row in a table, a KV entry per path). Decide what a
   mark represents: "this path/result was good." Higher strength = more agents
   found it worthwhile.

2. Let agents act and score their result. Each agent independently attempts the
   task, picks a path, and measures how good the outcome was (cheaper/faster/
   higher-quality = better).

3. Deposit a mark proportional to quality. The agent adds strength to the path
   it used, scaled to how good the result was. A great result deposits a lot; a
   poor one deposits little. (A clean rule: deposit proportional to 1/cost.)

4. Bias new choices toward stronger marks. When an agent picks its next path, it
   chooses with probability proportional to current mark strength. Strong paths
   attract more traffic, which deposits more marks - a reinforcing loop.

5. Fade every mark each tick. Multiply all mark strengths by a fade factor below
   1 (e.g. 0.85) on every round. Marks that stop getting reinforced decay. This
   is what lets stale information die instead of ruling forever.

6. Keep a little exploration. Have a small fraction of choices (e.g. 10%) ignore
   the marks and pick at random. This keeps the fleet sampling alternatives so it
   can discover a newly-better path instead of tunneling on the current winner.

7. Floor the strengths. Never let a path's strength hit zero, or it can never be
   rediscovered. Keep a small minimum so every option stays barely alive.

8. Read the consensus from concentration. The "answer" is wherever marks have
   piled up. The fleet's collective choice emerges from the strength
   distribution - no one declared it.

9. Repeat. Each round reinforces good paths and fades the rest, so the consensus
   tracks the best current option as the world changes.

## Output format

- A shared strength value per path/option (a dict, table, or set of files).
- The consensus = the path with the highest strength.
- A running history of which path the fleet favored each round, so you can see
  it converge and re-converge when conditions shift.

## Composition (loops)

- Wrap steps 2-7 in a loop; one pass = one "tick." Run until strengths stabilize
  or for a fixed budget.
- Compose with a scoring skill: any skill that returns a quality/cost number can
  feed the deposit step.
- Stack hiveminds: one fleet's consensus output can be the input space another
  fleet self-organizes over.
- Pair with a watchdog that only reads the shared space (never dispatches) to
  report the current consensus without becoming a bottleneck.

## Pitfalls

- Too-slow fade locks in a bad early path. If marks barely decay, whatever
  looked good first accumulates an insurmountable lead and the fleet never lets
  go even after it stops being best. This is the classic stale-lock-in failure -
  see the buggy demo.
- Too-fast fade loses memory. If marks decay too aggressively, good paths cannot
  build up any signal before it evaporates, and the fleet wanders randomly with
  no consensus ever forming.
- No exploration = tunnel vision. Without random sampling the fleet only ever
  reinforces paths it already uses and stays blind to new, better options.
- Zero floor = dead paths. If strength can reach zero a path becomes
  unreachable forever; keep a minimum.
- Mistaking it for consensus on facts. This finds what is currently working, not
  what is globally, permanently true. Do not use it where you need one correct
  authoritative answer.

See references/logic.md for why this works.
