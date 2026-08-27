# Privacy & Retention Policy — Security Control Plane

This subsystem is a **defensive control plane**, not employee monitoring. It
never performs keystroke monitoring, generalized personal profiling, or training
on protected personal characteristics, and it never ingests private email,
Slack, Teams, or Zoom content.

## What is collected

Only sanitized, allowlisted security telemetry conforming to the
`security-event/1` envelope:

- authentication/authorization outcomes (pseudonymous actor refs only);
- admin actions, privilege/role changes;
- API-rate anomalies, repeated failed requests;
- model-provider and tool-call outcomes;
- agent mission lifecycle + attempted scope expansion;
- prompt-injection detections;
- ingestion provenance failures;
- bulk/read-only-write DB anomalies (row counts, not row contents);
- CI/deploy/migration state (approved metadata only);
- webhook verification failures;
- domain posture check results.

## What is NEVER collected or stored

- Raw API keys, tokens, passwords, connection strings, session cookies, or
  complete authorization headers (schema has no field for them; the sanitizer
  redacts anything that slips in; a final scan quarantines survivors).
- Private communication content (email/Slack/Teams/Zoom).
- Raw prompts/responses (not retained by this subsystem unless separately
  authorized and redacted).
- Precise sensitive-locality coordinates (redacted per existing policy).
- Personal identifiers not required for a security investigation. Actor
  identity is pseudonymous (opaque salted ref), never a raw email/name/IP.

## Redaction guarantees (`src/lib/security/sanitize.ts`)

- Recursive redaction by secret-looking **key** and by secret-looking **value**
  (JWTs, provider key prefixes, PEM keys, DB URIs with credentials, high-entropy
  blobs).
- Oversized strings truncated; arrays/objects capped; over-deep branches dropped
  — so full request/response bodies cannot be captured wholesale.
- Redaction markers contain no fragment of the original value.
- Proven by canary-string tests (`sanitize.test.ts`, `ingest.test.ts`): known
  credential-shaped strings never appear in stored events, responses, logs, or
  snapshots.

## Retention (configurable; recommended starting policy)

| Data class | Recommended retention |
|------------|----------------------|
| Raw sanitized events | short (e.g. 30 days) |
| Correlated incident metadata | longer (e.g. 1 year) |
| Security audit records | per existing governance needs |
| Baseline aggregates | rolling window (default 14 days) |
| Secrets | **never retained** |
| Raw prompts/responses | not retained by this subsystem |
| Personal communication content | never collected |

Retention cleanup is a scheduled backend job keyed on `occurred_at`/`received_at`
indexes. Baselines self-trim to their rolling window (`baselines.ts`).

## Access

Security data is authorization-gated. The Trust Center fails closed on
unauthorized (401/403) and never renders fabricated data. No public
"repeat-offender" rankings; assets (services/resources) — not people — are the
unit of repeat-incident analytics.

## Deletion

Deleting an actor's pseudonymous ref mapping (held outside this subsystem)
renders historical events non-attributable. Baseline aggregates carry no
personal content and expire with their window.
