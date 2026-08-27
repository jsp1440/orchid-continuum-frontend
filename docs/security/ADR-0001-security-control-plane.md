# ADR-0001 — Orchid Continuum Security Control Plane

- **Status:** Accepted (Phase 1–4 foundation implemented; enforcement flagged off by default)
- **Date:** 2026-08-27
- **Scope:** `orchid-continuum-frontend` (control-plane library + Trust Center consumer), `orchid-continuum-backend` (event/incident contract)

## Context

Orchid Continuum runs public/scientific applications, autonomous AI agents
(Calyx, Research Station), literature/occurrence/trait ingestion pipelines, and
deployment automation across Render, Neon PostgreSQL, GitHub Actions, and
configured model providers. It needs a **proportionate, privacy-preserving
defensive control plane** — not an enterprise surveillance system.

This ADR records the architecture for a compact security subsystem inspired by
general industry patterns (normalized events, correlation, behavioral baselines,
AI-agent safeguards, risk-based alerts, closed-loop improvement, domain posture,
human-readable incidents, just-in-time warnings). It deliberately does **not**
depend on, copy, or reproduce any commercial product.

## Decision

1. **Provider-neutral event envelope** (`src/lib/security/envelope.ts`).
   A versioned (`security-event/1`), strictly-validated Zod contract. No
   secret-bearing fields exist in the schema. Security risk is kept distinct
   from scientific evidence quality.

2. **Sanitize-before-anything ingestion** (`sanitize.ts` → `ingest.ts`).
   Recursive redaction of secret keys/values, size caps, and a final
   belt-and-braces secret scan. Malformed or secret-bearing events are
   **quarantined**, never stored. Canary-string tests prove secrets never
   survive.

3. **Deterministic-first signal engine** (`signals.ts`).
   Transparent rules only in the first release — no opaque ML. Each signal is an
   independently testable pure function carrying id, reason, evidence,
   confidence, severity contribution, recommended response, and false-positive
   notes.

4. **Bounded behavioral baselines** (`baselines.ts`).
   Rolling mean/stddev with minimum sample sizes and cold-start mode. Deviations
   are investigative signals, never conclusions; no personal profiling.

5. **Explainable bounded risk** (`risk.ts`).
   A saturating [0,100] score where every contribution is visible; confidence
   and severity stay separate; deterministic policy violations gate actions
   independently of the anomaly score.

6. **Cross-system correlation + incident model** (`incident.ts`).
   Union-find over strong keys (trace/request/mission/commit) and time-bounded
   weak keys (actor). Narratives separate observed facts, deterministic results,
   statistical deviations, model-assisted interpretation, and human conclusions.
   Temporal association is never presented as causation.

7. **AI-agent safeguards** (`promptInjection.ts`, `toolPolicy.ts`,
   `warnings.ts`). All retrieved content is untrusted data. Deterministic
   injection detection runs before/after model calls; mission-scoped tool
   policy validates arguments, denies secrets by default, gates consequential
   actions, and caps recursion/retries/fan-out. **The model is never the
   enforcement boundary.**

8. **Read-only domain posture** (`domainPosture.ts`).
   Pure assessment of supplied SPF/DKIM/DMARC/cert/DNS records. Never mutates
   DNS. Unknown DKIM selectors are reported as "configuration required", never
   guessed.

9. **Closed-loop feedback** (`disposition.ts`).
   Reviewer dispositions drive **proposals only** — versioned, reviewable rule
   changes. The system never silently retrains or alters enforcement.

10. **Fail-closed frontend** (`src/lib/securityApi.ts`,
    `src/components/security/SecurityTrustCenter.tsx`). The Trust Center renders
    only governed backend data; on unconfigured/unauthorized/unavailable it
    shows explicit safe states, never fabricated incidents. Surface + enforcement
    are feature-flagged (`featureFlags.ts`), default **off/observe**.

## Backend contract (producer)

Routes (authenticated, rate-limited; no public arbitrary-event endpoint):

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/security/events` | ingest one sanitized internal event |
| GET | `/api/security/incidents` | list authorized incidents |
| GET | `/api/security/incidents/:id` | incident + timeline |
| POST | `/api/security/incidents/:id/disposition` | submit disposition |
| GET | `/api/security/rules/health` | rule health |
| GET | `/api/security/metrics` | summary metrics |
| GET | `/api/security/domain-posture` | latest read-only posture |
| GET | `/api/security/agent-decisions` | recent agent-policy decisions |

The machine-readable envelope schema lives in the backend repo at
`contracts/security-event-v1.schema.json` and MUST stay in sync with
`src/lib/security/envelope.ts`.

## Data model (suggested tables)

`security_events`, `security_signals`, `security_incidents`,
`security_incident_events`, `security_dispositions`, `security_rule_versions`,
`security_baselines`, `domain_posture_checks`, `agent_policy_decisions`.
Index timestamps, correlation ids, incident ids, service, event type, and
retention cleanup columns.

## Consequences

- The library is fully unit/integration tested and framework-neutral, so the
  same logic can run in a Neon-backed worker or a Vitest fixture.
- First release is observe-and-warn; enabling enforcement is a governed,
  flag-gated decision.
- Persisting events/incidents/baselines requires the backend routes above; until
  they exist, the Trust Center correctly fails closed.

## Non-goals

Employee/keystroke monitoring, personal profiling, automatic destructive
remediation, credential rotation, or any action through owner-review,
sensitive-locality, or evidence gates.
