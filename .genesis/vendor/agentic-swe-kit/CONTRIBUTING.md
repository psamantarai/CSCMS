# Contributing to agentic-swe-kit

Any engineer can add a new domain to this system. Here is the exact protocol.
No deviation needed — follow these 5 steps and your skill integrates cleanly.

---

## What a Contribution Looks Like

A contribution is:
  - One new domain skill (a SKILL.md routing layer)
  - Its wiki concept pages (the deep knowledge the skill points to)
  - One row added to the master skill routing table
  - One line added to the master skill index

That's it. The system is additive. You never need to modify existing skills.

---

## Step-by-Step Protocol

### Step 1: Generate Wiki Concept Pages

Process your source material (a domain, a specification, or a body of research)
into individual concept pages using the book-to-skill-pipeline.

Each concept page lives at:
  wiki/<domain-name>/concepts/<Concept-Name>.md

Naming convention:
  domain-name: lowercase, hyphens (e.g., clean-architecture, release-it)
  Concept-Name: Title-Case-With-Hyphens (e.g., Circuit-Breaker.md)

Rules for concept pages:
  - Never name the source book in the concept page
  - Each page covers exactly one concept
  - Pages are comprehensive — do not summarize or cut information
  - Include: definition, mechanism, when to use, trade-offs, examples

### Step 2: Write the SKILL.md

Copy SKILL_TEMPLATE.md and fill it in.

Key rules:
  - Wiki references must use $AGENTIC_SWE_WIKI_ROOT (never hardcoded paths):
      $AGENTIC_SWE_WIKI_ROOT/<domain>/concepts/<Page>.md
  - Never name source books in the skill body — concepts only
  - All trigger conditions must start with "Use this when"
  - All anti-patterns must have a "Fix:" section
  - Core rules should be 8-12 heuristics grounded in real engineering conflicts
  - Keep the skill under 10,000 characters total

### Step 3: Place Files in Repo

  skills/<category>/<skill-name>/SKILL.md
  wiki/<domain-name>/concepts/*.md

Categories: swe-foundations, mlops, devops, data-science, security

### Step 4: Update the Master Skill

Open skills/orchestrator/agentic-swe-master/SKILL.md and:

  a) Add one row to the Fast Routing Table:
     | Your Problem Scenario | your-skill + related-skill |

  b) Add one line to the Skill Index:
     | your-skill | category/your-skill | One-sentence purpose |

  c) If your domain maps cleanly to a lifecycle phase, note it in the
     relevant Phase section under "Skills:" — open a discussion if unsure.

### Step 5: Open a Pull Request

PR title format: [skill] add <skill-name>

Include in the PR description:
  - What domain this covers
  - Which existing skills it relates to
  - One example scenario where this skill would be loaded

---

## Quality Bar for Acceptance

Before submitting, check:

  [ ] Trigger conditions all start with "Use this when"
  [ ] Anti-patterns all have "Fix:" sections
  [ ] Wiki references use $AGENTIC_SWE_WIKI_ROOT
  [ ] No source book names in skill body
  [ ] Skill is under 10,000 characters
  [ ] Core rules are 8-12, each grounded in a real engineering conflict
  [ ] Concept pages cover their topic comprehensively (no summarization)
  [ ] Routing table has at least one new row
  [ ] Skill index has one new line

---

## What Not to Do

  - Do not hardcode paths like /Users/yourname/... in any SKILL.md
  - Do not put implementation code in skills — skills are routing layers
  - Do not name source books in skill content
  - Do not modify other skills without discussing in the issue first
  - Do not add a skill that is just a summary of an existing skill
  - Do not skip wiki concept pages — the skill is only as useful as its wiki

---

## Questions

Open an issue with the label `[question]` and describe what domain you want
to add. We'll help you map it to the existing phase structure.

Want to propose a new wiki concept without a full skill? Open an issue with
label `[wiki]` — concept-only contributions are welcome. A concept page
without a skill is still useful: it enriches the knowledge graph and
other skills can reference it immediately.
