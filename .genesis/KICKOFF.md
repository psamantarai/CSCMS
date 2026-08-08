# KICKOFF — paste this to start or resume a CSCMS session cold

> Works in any agent. Replace the skill-invocation syntax per `AGENT-ADAPTERS.md`
> (Hermes `skill_view(name=…)` · Claude Code `Skill`/`/x` · Codex `$x`). The rest is identical.

```
Load skills (skill canon — always, per CLAUDE.md, not the generic swe-kit names):
- ponytail                    (lazy-first coding persona — active every session)
- progress-tracker            (update docs/progress-tracker.html after each step)
- per-milestone: shadcn / frontend-design / vercel-react-best-practices (frontend
  milestones) or edge-case-audit (M8 clean-machine acceptance) — see DONE.html §4.

Read in order:
- AGENTS.md / CLAUDE.md                       (repo governance)
- .genesis/DONE.html                          (locked spec + definition of done + plan)
- .genesis/PLAN.md                            (milestones being executed)
- .genesis/wiki/index.md                      (then drill into pages matching the milestone's nouns)
- .genesis/implementation-notes.html          (search for the milestone's nouns — what's LIVE now)
- .genesis/LOOPS.md                           (how the work gets done)
- .genesis/checkpoints/CURRENT.md             (where we are, if it exists)

Then:
1. Pick the next unstarted milestone (or resume from CURRENT.md).
2. Run G0 EXISTENCE PRE-FLIGHT first. Verdict UNBUILT → continue. PARTIAL → revise scope.
   BUILT → halt and surface the existing artifact.
3. Run L1 BUILD per LOOPS.md exactly. Enforce G0 + all 5 gates (G1 Skill, G2 Progress,
   G3 Cost, G4 Quality, G5 Verify). Gates are COMPUTED (run the command, paste exit code), not narrated.
4. Checkpoint every iteration to .genesis/checkpoints/<milestone-id>.md.
5. Spawn L2 DEBUG / L3 RESEARCH as needed. Exit through L4 VERIFY (separate model, fresh context).
   If EXPLAIN_DIFF is on: after APPROVE, run explain-diff-html (.genesis/explanations/) then quiz-me.
6. On milestone done: update CURRENT.md, append a row to implementation-notes.html "what's live",
   append progress to PLAN.md, update docs/progress-tracker.html.
7. STOP. Report the same completion summary given to the user (what was built, the verify result,
   any deviations) as short bullets. Do NOT start the next milestone automatically.

Stop rules: if any gate fails 3 times, stop, write what you tried to CURRENT.md, surface to the user.
CLAUDE.md's "Plan Execution Workflow" (one step at a time, stop and wait for the user) overrides
genesis's default full-autonomy looping — L1 BUILD/L4 VERIFY may iterate un-prompted *inside* one
milestone, but the loop always halts at a milestone boundary, never chains into the next one on its own.
Never mark a milestone done without L4 VERIFY APPROVE. Never edit DONE.html / PLAN.md without being asked.
```
