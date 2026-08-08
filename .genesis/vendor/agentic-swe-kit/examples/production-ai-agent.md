# Example: Production AI Agent (SDR Operating System)

This walkthrough shows how agentic-swe-master routes a real project from idea
to production-ready architecture. Follow along as the orchestrator drives phase
by phase.

---

## The Project

Build an autonomous AI outbound sales platform that:
  1. Finds ICP leads
  2. Enriches and researches them
  3. Generates personalized outreach
  4. Handles replies and qualifies leads
  5. Books meetings
  6. Learns from successful conversations

---

## Step 1: agentic-swe-master Triggers

You say to your agent:
  "I want to build a production AI SDR agent that finds and outreaches leads."

Master skill trigger condition matches:
  "Use this when building a production AI agent that must be secure, observable,
   and fault-tolerant"

Master skill loads. Diagnostic runs.

---

## Step 2: Diagnostic Protocol

Q1: New project -> yes
Q2: AI/LLM components -> yes (research agent, personalization agent, reply agent)
Q3: Distributed -> yes (lead pipeline, multi-step async workflow)
Q4: Trust boundary -> yes (CRM access, email sending, external scraping)
Q5: Current phase -> 0 (starting from scratch)

Decision: Walk all 20 phases. Start at Phase 0.

---

## Phase 0: Cognitive Design
Skills loaded: engineering-mindset

Cognitive jobs defined:
  - Lead Intelligence Agent: identify ICP, infer pain points, detect trigger events
  - Research Agent: scrape, analyze, infer priorities
  - Personalization Agent: generate highly contextual messaging
  - Conversation Agent: classify reply intent, decide next action
  - Qualification Agent: determine buying readiness

Autonomy levels set:
  - Fully autonomous: scraping, enrichment, ranking, classification
  - Human approval required: first outbound message, pricing conversations
  - Semi-autonomous: draft replies, suggest meeting times

Failure modes listed:
  - Hallucination: agent invents company info -> Fix: structured output validation
  - Compliance risk: illegal outreach -> Fix: jurisdiction-aware routing
  - Prompt injection: malicious webpage -> Fix: sandboxed browser agents
  - Financial risk: bad lead scoring wastes spend -> Fix: scoring calibration

Gate passed: cognitive job written, autonomy levels explicit, failure modes listed.

---

## Phase 1: System Architecture Design
Skills loaded: modular-architecture + distributed-systems

Architecture style: Modular monolith (for MVP speed, debuggability, cost).
Planned migration path: microservices when individual agents need independent scaling.

Service modules:
  auth-service | lead-service | agent-runtime | memory-service
  tool-service | campaign-service | evaluation-service

Communication: event-driven via Redis Streams.
  Lead Added -> Research Event -> Enrichment Event -> Scoring Event
  -> Personalization Event -> Approval Event -> Outreach Event

Component dependency rule enforced:
  Domain logic (lead scoring, personalization) has zero imports from framework
  or HTTP types. Framework is a plugin on the outside.

Gate passed: architecture style chosen with justification. Service graph exists.
No cycles in dependency graph. Event bus defined.

---

## Phase 4: Workflow Orchestration
Skills loaded: llmops-ai-agents + distributed-systems

Orchestration topology: Sequential pipeline for lead lifecycle.
  NEW -> RESEARCHED -> ENRICHED -> SCORED -> MESSAGE_GENERATED
  -> APPROVED -> SENT -> RESPONDED -> QUALIFIED -> BOOKED

State machine is explicit. Every state transition is an event.

Workflow engine: Temporal (durable execution, built-in retry, checkpoint).
Span-of-control: orchestrator manages 6 specialist agents (within the 7 limit).

Gate passed: explicit state machine drawn. Orchestration topology matches task
structure. Checkpointing via Temporal. Span-of-control verified.

---

## Phase 6: Memory Architecture
Skills loaded: llmops-ai-agents + data-systems-engineering

Short-term: Redis (session state, current campaign context, agent scratchpad)
Long-term: Postgres (lead history, conversation history, user preferences)
           Vector DB: Pinecone (semantic retrieval of successful messaging patterns)
           Neo4j (company-contact relationship graph)

RAG pipeline:
  - Structure-aware chunking (LinkedIn profile sections, company news paragraphs)
  - Hybrid retrieval: BM25 (keyword match) + dense embeddings + RRF fusion
  - Reranking: cross-encoder on top 20 candidates
  - Citation grounding: every personalized message cites the signal it drew from

Replication: leader-follower for Postgres. Monotonic reads enforced.
Encoding: Protobuf for all cross-service data with explicit schema evolution rules.

Gate passed: memory tiers separated. RAG uses hybrid retrieval. Citations in place.
Freshness strategy: webhook-triggered re-embedding on company news events.

---

## Phase 9: Evaluation Systems
Skills loaded: llmops-ai-agents + engineering-mindset

Golden dataset: 500 lead profiles with ground-truth personalization quality ratings.

Metrics tracked:
  - Personalization accuracy (LLM-as-judge, calibrated)
  - Hallucination rate (fact-checked against retrieved sources)
  - Tool success rate (LinkedIn scraper, email sender)
  - Reply rate (online, from production)
  - Meeting conversion rate (lagging indicator)

LLM-as-judge: GPT-4o as judge with fairness checks (swapped lead order,
rephrased prompts). Judge calibrated against human sales team ratings.

Regression gate: golden dataset must pass before every deploy.
Human eval: sales team reviews 10% of generated messages weekly.

Gate passed: golden dataset exists. 3-level eval plan written. Judge calibrated.

---

## Phase 11: Security Architecture
Skills loaded: security-engineering + distributed-systems

Threat model:
  - Adversary category: opportunist attacker + prompt injection via scraped webpages
  - Threats: data leakage (Company A sees Company B's data), CRM abuse (mass delete),
    jailbreak via lead's LinkedIn bio, compliance violation (GDPR on EU leads)

Controls:
  - Tenant isolation: separate DB schemas per customer, JWT scoped per tenant
  - Prompt injection: instruction hierarchy (system > tool output > user),
    webpage content sanitized before agent sees it
  - Tool permissions: email-sending tool requires explicit campaign-id scope,
    CRM write requires approval gate for bulk operations
  - Zero Trust: every inter-service call authenticated with mTLS

Gate passed: threat model with specific adversary categories. Prompt injection
mitigated with instruction hierarchy. RBAC implemented. Audit trail append-only.

---

## Phase 12: Reliability Engineering
Skills loaded: production-readiness + distributed-systems

Retry systems:
  - LinkedIn scraper: exponential backoff, max 3 retries, fallback to Apollo API
  - OpenAI: retry on rate limit, fallback to Claude on 5xx errors
  - Email sender: idempotent (campaign-id + lead-id as idempotency key)

Circuit breakers:
  - Research agent: circuit opens after 5 consecutive failures, 30s reset
  - Personalization: circuit opens if hallucination rate > 5% in sliding window

Checkpointing: every state transition in Temporal persists full workflow state.
Resume after crash picks up from last committed state.

Gate passed: circuit breakers on all external calls. All retries idempotent.
Checkpointing allows resumption. No duplicate emails on retry.

---

## Production Result

The system behaves as designed in Phase 0:
  Upload lead list -> Research agents activate -> Enrichment pipeline runs
  -> Scoring engine ranks -> Personalization generates outreach
  -> Human approves -> Campaign launches -> Reply agents handle conversations
  -> Qualification evaluates intent -> Calendar booking schedules meeting
  -> Analytics measures outcomes -> Memory learns from successful patterns

Every phase had a gate. Nothing shipped without passing its gate.
The orchestrator drove you through the right domain skills at each phase.
The wiki gave you depth when you needed it.

This is how the agentic-swe-kit works.
