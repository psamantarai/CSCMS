---
name: your-skill-name
description: "Use when <specific situation that triggers this skill — 1-2 sentences>."
version: 1.0.0
author: Your Name
license: MIT
platforms: [macos, linux]
metadata:
  hermes:
    tags: [tag1, tag2, swe-foundations]
    category: swe-foundations
    related_skills: [engineering-mindset, production-readiness]
---

# Your Skill Title

## When to Load

<!-- 8-12 triggers. All must start exactly with "Use this when" -->

- Use this when ...
- Use this when ...
- Use this when ...
- Use this when ...
- Use this when ...
- Use this when ...
- Use this when ...
- Use this when ...

## Core Rules

<!-- 8-12 load-bearing heuristics. Use blockquote format.
     Each rule must be grounded in a real engineering conflict,
     not generic advice. The rule should resolve tension. -->

> Rule 1: ...

> Rule 2: ...

> Rule 3: ...

> Rule 4: ...

> Rule 5: ...

> Rule 6: ...

> Rule 7: ...

> Rule 8: ...

## Concept Map

<!-- Table pointing to wiki pages. Use $AGENTIC_SWE_WIKI_ROOT.
     Never hardcode machine paths. -->

Wiki root: $AGENTIC_SWE_WIKI_ROOT/<domain-name>/concepts/

| Concept | When to read |
|---------|-------------|
| Concept-One.md | When X is happening |
| Concept-Two.md | When Y needs to be decided |
| Concept-Three.md | When debugging Z |

## AI-Native Application

<!-- Optional but recommended: 2-3 specific ways LLM coding agents
     fail on work in this domain, and what to do instead. -->

LLM coding agents reliably fail on this domain in these ways:

1. ...
2. ...
3. ...

## Common Pitfalls

<!-- 5-7 pitfalls. Each must have a "Fix:" section. -->

- **Pitfall Name**: Description of the bad pattern and why it's bad.
  Fix — what to do instead, specifically.

- **Pitfall Name**: Description.
  Fix — ...

- **Pitfall Name**: Description.
  Fix — ...

- **Pitfall Name**: Description.
  Fix — ...

- **Pitfall Name**: Description.
  Fix — ...

## Verification Checklist

<!-- Concrete checklist an agent or engineer runs before finishing work
     in this domain. Binary yes/no items. -->

- [ ] ...
- [ ] ...
- [ ] ...
- [ ] ...
- [ ] ...

---

<!-- AFTER WRITING YOUR SKILL:
     1. Add one row to the routing table in agentic-swe-master/SKILL.md
     2. Add one line to the skill index in agentic-swe-master/SKILL.md
     3. Verify all wiki paths use $AGENTIC_SWE_WIKI_ROOT
     4. Run the quality checklist in CONTRIBUTING.md
-->
