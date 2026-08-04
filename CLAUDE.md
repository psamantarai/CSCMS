# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
# figma-make-app

React + Vite + Tailwind CSS project running inside Figma Make.

## Development Server

A Vite development server is **already running** on `$PORT` (default 8443). You don't need to start it manually.

- Preview URL: The user can access the running app through the preview panel
- Hot reload: Changes to source files are reflected immediately

## Project Structure

This is the canonical project structure. Start with task-relevant files below. Only follow imports or inspect other files when required, when a documented path is missing, or when the repository contradicts this guide.

- `src/main.tsx` - React entrypoint; imports `src/index.css` and mounts `src/App.tsx` into the `#root` element
- `src/App.tsx` - Primary application component and the usual starting point for UI work
- `src/index.css` - Global CSS entrypoint and Tailwind CSS v4 import
- `index.html` - Vite HTML shell containing the `#root` element and loading `src/main.tsx`
- `package.json` - Project dependencies and the Vite build, development, preview, and formatting scripts
- `vite.config.ts` - Vite configuration with React, Tailwind CSS v4, and Figma Make plugins plus the `@` alias for `src`
- `.mise.toml` - Toolchain versions for Node.js and pnpm

## Dependencies

- Runtime: React 19 and React DOM 19
- Styling: Tailwind CSS v4 with the `@tailwindcss/vite` plugin
- Build tooling: Vite 8, TypeScript 5.7, and `@vitejs/plugin-react`
- Formatting: oxfmt

## Styling

This project uses **Tailwind CSS v4** through the `@tailwindcss/vite` plugin configured in `vite.config.ts`. `src/index.css` imports Tailwind with `@import 'tailwindcss';`. Use Tailwind utility classes directly in JSX and put global CSS or Tailwind v4 theme customization in `src/index.css`. This scaffold does not need a Tailwind config file or PostCSS config.

`src/main.tsx` imports `src/index.css`, so global font wiring belongs in `src/index.css`. Keep CSS `@import` statements first, then add any `@font-face` rules and font-family defaults there.

## Code quality

- Use double quotes for strings containing apostrophes (`"We're here to help"`), or escape them in single-quoted strings. An unescaped apostrophe in a single-quoted string breaks the build.
- Ensure JSX tags are closed and braces are balanced.
- Export components as default exports.

## Installed Skills

Installed under `.agents/skills/` (tracked in `skills-lock.json`). Invoke via the Skill tool when applicable:

- `frontend-design` - use when building or reshaping UI that needs a distinctive, non-templated visual identity (palette, type, layout decisions).
- `shadcn` - use for any shadcn/ui component work: adding, searching, or composing components; check the registry before writing custom UI.
- `vercel-react-best-practices` - use when writing or reviewing React/Next.js code, to check for performance issues (waterfalls, bundle size, re-renders).

## Project Skills

Custom skill under `.claude/skills/` (not part of `skills-lock.json`):

- `progress-tracker` - use to update or check `docs/progress-tracker.html`, the work progress tracker. Keeps the in-progress task shown first, everything else after, with status filters.

## Project Agents

Custom subagent under `.claude/agents/` (Haiku model, not tracked by git - `.claude/` is gitignored):

- `git-commit` - stages and commits current work with a concise message. Use when asked to commit changes.

## Installed Plugins

Enabled in `.claude/settings.local.json` (not tracked by git - `.claude/` is gitignored):

- `ponytail` - lazy-first coding persona, active every session via a SessionStart hook. Favors the smallest thing that works (reuse existing code > stdlib > native platform feature > already-installed dependency > one-liner > new code) over speculative abstraction. It's why backend tests are plain `assert`-based scripts in `backend/tests/` rather than a pytest suite with fixtures - see `docs/ARCHITECTURE.md` §8.

## Plan Execution Workflow

Work on one plan step at a time. After finishing a step:
1. Test it - unit, integration, and/or e2e, whichever tiers the step actually touches (see `docs/ARCHITECTURE.md` §8 for the tiers and existing conventions). Confirm the step's `docs/PLAN.md` *Verify* line genuinely passes before moving on.
2. Update `docs/progress-tracker.html` using the `progress-tracker` skill. Record the same completion summary given to the user, as short bullet points (what was built, the verify result, any deviations) - not a one-line paragraph.
3. Stop there and end the session - wait for the user to start the next step.

Don't chain automatically into the next plan step.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

A PreToolUse hook in `.claude/settings.json` (not tracked by git - `.claude/` is gitignored) enforces this: it runs `graphify hook-guard search` before Bash/Grep calls and `graphify hook-guard read` before Read/Glob calls, so prefer the `graphify` commands below over raw search/read when the graph exists.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
