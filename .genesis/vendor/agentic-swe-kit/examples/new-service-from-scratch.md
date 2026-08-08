# Example: New Service From Scratch

Scenario: You are building a new microservice for a fintech platform. It handles
payment intent validation — takes a payment request, validates against fraud rules,
runs risk scoring, and returns an approval decision. Clean slate.

This is the most common scenario. Here is exactly how the orchestrator routes it.

---

## Routing Table Match

Problem: "New service from scratch"
Routing table entry: modular-architecture -> engineering-mindset -> production-readiness

This is the fast path. No full diagnostic needed. Three skills, in order.

---

## modular-architecture (Load First)

Why first: the single most common mistake in new service development is locking
in a framework or database before domain logic is stable. This skill prevents that.

Before writing a line of code, answer:
  - What is the core domain logic? (payment validation rules, fraud signals, risk model)
  - What are the use cases? (validate_payment, check_fraud_signals, compute_risk_score)
  - What are the external dependencies? (payment processor, fraud API, database)

Dependency rule check:
  [Domain: PaymentValidation] <- [Use Cases: ValidatePayment] <- [Adapters: HTTP handler, DB gateway] <- [Frameworks: FastAPI, SQLAlchemy]

Nothing in PaymentValidation imports FastAPI. Nothing in ValidatePayment imports
SQLAlchemy. The DB gateway is an interface owned by the use case layer.

Package structure revealed:
  payments/
    domain/
      payment.py         # PaymentIntent, ValidationResult (no imports from outside)
    use_cases/
      validate_payment.py  # orchestrates domain + calls interfaces
    adapters/
      fraud_api_client.py  # implements FraudSignalRepository interface
      payment_db_gateway.py  # implements PaymentRepository interface
    entrypoints/
      http_handler.py    # FastAPI routes — calls use cases only

Framework attaches at the entrypoints layer. Domain never sees it.

Gate check: dependency direction is inward. No cycles. Top-level structure
reveals use cases, not framework names.

---

## engineering-mindset (Load Second)

Why second: now that structure is set, the agent faces dozens of small decisions
during implementation. This skill calibrates them.

Questions engineering-mindset resolves during this build:

  1. How much error handling? This is a payment service. Every error must be
     handled explicitly. No silent failures. Fail fast on invalid preconditions.
     Read: Assertive-Programming.md, Dead-Programs-Tell-No-Lies.md

  2. Should we add a feature the product manager "might want later"?
     No. YAGNI. Build exactly what the use case requires. Adding speculative
     features now makes the architecture harder to change when requirements arrive.

  3. The fraud API client is getting complex. Refactor now or ship first?
     Apply broken window theory. If the complexity is structural (wrong abstraction),
     fix it now — it will compound. If it's just long (well-structured but verbose),
     note it as debt and ship.

  4. A dependency fails during integration testing. What do we do?
     Provide options, not excuses. Find the alternative (mock, fallback, degrade
     gracefully). Don't report "the fraud API is down" as an answer.

Gate check: trade-offs are deliberate. Quality regressions flagged. No broken windows left.

---

## production-readiness (Load Third)

Why third: now that domain and structure are stable, harden for production.
This is where integration points, timeouts, and stability patterns live.

Every outbound call in this service:
  - Fraud API: timeout (500ms), circuit breaker (open after 3 failures, 10s reset),
    fallback (approve with flag for manual review when circuit is open)
  - Payment processor: timeout (2s), retry with idempotency key (payment_intent_id),
    circuit breaker (open after 5 failures)
  - Database: connection pool per dependency (fraud_db pool separate from payments_db pool)

Observability:
  - Health endpoint: GET /health returns {db: ok, fraud_api: ok, circuit_state: closed}
  - Metrics: request latency (p50, p99), circuit breaker state, fraud API error rate
  - Logs: structured JSON, every validation decision logged with payment_id and decision

Steady state:
  - Validation logs: 30-day retention, archived to cold storage
  - Connection pools: sized to match actual downstream capacity (not defaulted to 10)

Zero-One-Many:
  - QA runs exactly 1 DB instance (not mocked, not 3-node cluster).
  - Production runs 3-node cluster. QA will not catch split-brain bugs.
  - Fix: QA topology matches production topology.

Gate check:
  - Every outbound call has timeout + circuit breaker. PASSED.
  - Connection pools are per-dependency, not shared. PASSED.
  - Health endpoint exists and reports all dependencies. PASSED.
  - QA topology matches production. PENDING — fix before deploy.

---

## What You Have After These 3 Skills

A new service where:
  - Domain logic has zero framework imports (swap FastAPI for gRPC in 2 hours)
  - Every external call is wrapped with timeout, retry, and circuit breaker
  - Observability is built in from day one, not added after the first incident
  - Test coverage tests behavior, not structure (tests don't break on refactors)
  - Quality decisions were deliberate, not accidental

That's a service that will survive production. Built with 3 skills, in order.
