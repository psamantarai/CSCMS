# Example: Secure Data Pipeline

Scenario: Building a healthcare data pipeline that ingests patient records,
enriches with clinical signals, feeds an AI risk-scoring agent, and writes
results to an audit-compliant data warehouse.

Security-sensitive + data-intensive + AI components = 3 domains intersect.

---

## Routing Table Match

Problem: "Security-sensitive data pipeline with AI scoring"
Routing table entry: data-systems-engineering + security-engineering + production-readiness

Skills load in this order:
  1. data-systems-engineering (storage, replication, encoding, schema evolution)
  2. security-engineering (threat model, access control, PHI handling, audit)
  3. production-readiness (stability, timeouts, circuit breakers, observability)

---

## What Each Domain Skill Contributes

### data-systems-engineering

Storage decision:
  - OLTP (patient demographics, appointments): PostgreSQL with leader-follower replication
  - Clinical signals (lab results, vitals time series): TimescaleDB (column-oriented for range queries)
  - Risk scores + audit log: append-only table with immutable rows
  - Embeddings for similar-patient retrieval: pgvector on Postgres (keeps PHI in one system)

Encoding: Avro with schema registry. All PHI crossing service boundaries uses
forward and backward compatible schemas. No schema change ships without migration
that old code can read new data and new code can read old data.

Replication lag: monotonic reads enforced on all clinical data reads. A read
that follows a write must never return stale data. Routed to leader or
to replica with read-your-writes guarantee.

Partitioning: patient_id hash partitioning. Avoid monotonic keys (admission_date
would create hot spots on the most recent partition).

### security-engineering

Threat model:
  - Adversary: insider threat (nurse accessing records outside their patients),
    external attacker (API credential theft), regulatory auditor
  - PHI is highest-sensitivity data class (HIPAA)

Controls:
  - Access control: RBAC at row level (nurse sees only their assigned patients).
    MAC for multi-level access (attending physician > nurse > administrative staff).
  - Encryption: AES-256 at rest, TLS 1.3 in transit. Key management via HSM.
    Key rotation on 90-day schedule. Old keys kept for decryption only.
  - Audit trail: every read, write, and inference logged immutably.
    Append-only. Signed with timestamp. Cannot be modified post-write.
  - Privacy: differential privacy applied to aggregate statistical queries.
    Re-identification risk assessed before any data export.
  - Human factors: access review UI shows "you are accessing records outside
    your assigned patient list" — friction that makes unusual access visible.

### production-readiness

Every pipeline stage has:
  - Timeout on all external calls (EHR API, lab system, imaging system)
  - Circuit breaker: if EHR API fails > 3 times in 60s, pipeline pauses and
    queues work rather than cascading failures downstream
  - Bulkhead: EHR API pool is isolated from lab system pool. One system's
    degradation cannot exhaust connections for the other
  - Steady state: log retention automated (90-day rolling window with archive
    to cold storage). Pipeline manages its own disk lifecycle.
  - Observability: every pipeline run logged with patient_id_hash (not PHI),
    stage name, duration, record count, error type. Alerts on p99 > 2s.

---

## Cross-Domain Conflicts Resolved

Conflict 1: Strong consistency vs availability for risk scores
  data-systems-engineering says: linearizability prevents split-brain but kills
  availability during network partitions.
  security-engineering says: audit trail must be consistent — no gaps.
  Resolution: audit log uses linearizable writes (single leader, synchronous).
  Risk scores use eventual consistency (replicas, reads allowed to be slightly stale).
  Two different consistency models in the same system, each chosen deliberately.

Conflict 2: Schema evolution vs audit immutability
  data-systems-engineering says: schema changes must be backward/forward compatible.
  security-engineering says: audit logs must be immutable.
  Resolution: audit log schema is additive-only (new fields, never removed or renamed).
  New code can read old audit records. Old code ignores new fields. Immutability preserved.

Conflict 3: Retry logic vs HIPAA idempotency
  production-readiness says: retry on failure.
  security-engineering says: duplicate writes to PHI systems create duplicate audit entries.
  Resolution: all PHI writes use patient_id + event_id as idempotency key.
  Duplicate detection at the write layer prevents duplicates from entering the audit trail.

---

## Gate Summary

Phase 14 (Data Engineering): storage chosen per access pattern, encoding with
schema evolution, partitioning avoids hot spots, pipelines idempotent. PASSED.

Phase 11 (Security): threat model names insider + external adversary, PHI
controls in place, audit trail immutable, differential privacy on aggregate queries. PASSED.

Phase 12 (Reliability): circuit breakers on all EHR/lab calls, bulkheads isolate
pools, all writes idempotent, steady state manages log retention. PASSED.
