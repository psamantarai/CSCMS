# agentic-swe-kit

> A cognitive infrastructure system for production-grade software engineering —
> powered by Hermes Agent.

Not a chatbot wrapper. Not a tutorial collection.
A full operating system for how an AI agent drives you through the real complexity
of building production systems — from the first architectural decision to continuous
learning in production.

---

## What Problem Does This Solve?

Most engineers learn frameworks. Few learn the underlying engineering discipline.

When you build a real system — distributed, secure, observable, AI-native —
you're not just writing code. You're navigating a web of decisions across
multiple domains simultaneously. Mess up the threat model at Phase 0, and no
amount of circuit breakers saves you at Phase 12.

This kit gives your AI agent the structured knowledge to guide that navigation.

---

## The Knowledge Graph

Hundreds of concepts extracted from canonical engineering texts, organized into
seven domains, cross-linked by the master orchestrator:

![Concept Knowledge Graph](assets/concept-graph.png)

Each node in that graph is a standalone concept page. Each cluster is a domain skill.
The master orchestrator knows the connections between clusters.

---

## What's Inside

### 7 Domain Skills

Routing layers over deep engineering knowledge. Each skill knows which concepts
to invoke and when.

| Skill | Domain |
|---|---|
| `engineering-mindset` | Quality decisions, trade-offs, pragmatism, estimating |
| `modular-architecture` | Boundaries, dependency direction, SOLID, clean layers |
| `production-readiness` | Stability patterns, timeouts, circuit breakers, operability |
| `distributed-systems` | Consistency, fault tolerance, naming, coordination |
| `security-engineering` | Threat modeling, crypto, access control, privacy by design |
| `data-systems-engineering` | Storage, replication, partitioning, transactions, streaming |
| `llmops-ai-agents` | Agent architecture, RAG, evaluation, observability, guardrails |

### 1 Master Orchestrator

`agentic-swe-master` — the system that ties everything together:

- **20-phase production lifecycle** from cognitive design through continuous learning
- **Diagnostic protocol** — asks 5 questions and tells you which skills to load
- **Fast routing table** — 17 known cross-domain problem patterns, instant routing
- **9 cross-domain rules** that apply regardless of domain
- **7 anti-patterns** with explicit fixes for each

### Wiki (Concept Pages)

Hundreds of full concept pages across 7 domains. Not summaries. Full extractions —
definition, mechanism, when to use, trade-offs, worked examples. The skill points
you here when you need depth.

---

## Quick Install

**Requirements:** [Hermes Agent](https://hermes-agent.nousresearch.com) installed and configured.

```bash
git clone https://github.com/ayush488-glitch/agentic-swe-kit
cd agentic-swe-kit
chmod +x install.sh
./install.sh
```

Then restart your shell (or run `source ~/.zshrc` / `source ~/.bashrc`).

What `install.sh` does:
- Copies all 8 skills into `~/.hermes/skills/`
- Copies the wiki to `~/.agentic-swe-kit/wiki/`
- Sets `AGENTIC_SWE_WIKI_ROOT=~/.agentic-swe-kit/wiki` in your shell config

After install, start a Hermes session. The skills are live immediately.

---

## How It Works

### Step 1 — Describe your problem

Tell your agent what you're building. Production system, AI agent, data pipeline,
distributed service — describe it naturally.

### Step 2 — Master skill triggers

`agentic-swe-master` trigger conditions match production engineering scenarios.
It loads automatically.

### Step 3 — Diagnostic runs

The master skill asks itself 5 questions to find your entry point:
- New project, existing codebase, or live incident?
- Any AI / LLM components involved?
- Distributed or multi-service?
- Auth or sensitive data in scope?
- Which lifecycle phase is the project in?

### Step 4 — Phase routing begins

The orchestrator maps your project to phases and tells you which domain skills
to load at each one. You work through phases as your project progresses.
Every phase has a gate — conditions that must be true before moving on.

### Step 5 — Domain skills invoke wiki pages

When a phase needs depth on a specific concept, the domain skill tells you
exactly which wiki page to read. Full concept. No summarization.

---

## The 20-Phase Production Lifecycle

```
Phase 0   Cognitive Design         What thinking should the system perform?
Phase 1   System Architecture      Boundaries, style, service graph
Phase 2   Frontend Engineering     Streaming UI, HITL, agent transparency
Phase 3   Backend & API            State machines, service modules
Phase 4   Workflow Orchestration   Topology, checkpointing, span-of-control
Phase 5   LLM & Reasoning          Model routing, structured outputs, context budget
Phase 6   Memory Architecture      Short/long-term, RAG, hybrid retrieval
Phase 7   Tooling & Sandboxing     Tool registry, permissions, isolation
Phase 8   Multi-Agent Systems      Roles, coordination, failure management
Phase 9   Evaluation Systems       Golden datasets, LLM-as-judge, regression gates
Phase 10  Observability            Traces, token cost, alerts, prompt inspection
Phase 11  Security Architecture    Threat model, prompt injection, Zero Trust
Phase 12  Reliability Engineering  Circuit breakers, idempotency, checkpointing
Phase 13  Infrastructure           Containers, queues, model serving, caching
Phase 14  Data Engineering         Pipelines, encoding, schema evolution
Phase 15  Governance & Compliance  Audit trails, explainability, data residency
Phase 16  Economics                Token cost attribution, routing efficiency
Phase 17  Developer Experience     Playgrounds, trace viewers, replay systems
Phase 18  CI/CD for AI             Prompt versioning, eval gates, shadow + canary
Phase 19  Human-in-the-Loop        Approval workflows, escalation, uncertainty
Phase 20  Continuous Learning      Feedback loops, reflection vs learning
```

You don't have to start at Phase 0. For an existing system, the diagnostic
drops you into whichever phase is the active bottleneck.

---

## Project Layout

```
agentic-swe-kit/
  install.sh                   One-command installer
  README.md
  CONTRIBUTING.md              How to add new domains
  SKILL_TEMPLATE.md            Canonical template for new skills
  skills/
    orchestrator/
      agentic-swe-master/      Master orchestrator
    swe-foundations/           6 core domain skills
    mlops/                     LLMOps and agent skills
  wiki/                        Concept pages (hundreds of pages, 7 domains)
  examples/                    Full production walkthroughs
  assets/                      Images and diagrams
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full protocol.

The short version: write a SKILL.md routing layer, drop wiki concept pages
alongside it, add one row to the master routing table, open a PR.

Want to propose a new wiki concept or flag an existing one as incomplete?
Open an issue with label `[wiki]`. Concept pages are the most valuable
contribution — the skill is only as useful as the depth behind it.

---

## License

MIT. Use it, fork it, teach with it, build on it.
