# Incident Response Runbook

For governed administrators using the Security/Trust Center.

## 1. Triage

- Open the **Trust Center** (`/security`, when `VITE_SECURITY_TRUST_CENTER=true`).
- Incidents are correlated event clusters with an explainable risk band.
- **Simulated/test incidents are labeled `SIMULATED`** — never act on them as
  real.
- Sort by risk band and `deterministicPolicyViolation` first: a policy violation
  gates action regardless of anomaly score.

## 2. Read the narrative correctly

Each incident narrative separates:

- **Observed facts** — directly recorded events.
- **Deterministic rule results** — a rule fired; verifiable.
- **Statistical deviations** — σ-over-baseline; investigative, not conclusive.
- **Model-assisted interpretation** — inference; treat as a hypothesis.
- **Human conclusions** — added by reviewers via disposition.

Correlation cites the keys that grouped events (trace/mission/commit/actor).
"Grouped by temporal proximity only" = weak association; verify before acting.
**Temporal order is not causation.**

## 3. Investigate

- Follow evidence links — they reference sanitized **event ids**, never raw
  payloads or secrets.
- Check affected assets (services/resources) and the timeline order.
- For agent incidents, review the `agent-decisions` feed: which tool, which
  mission, allow/deny/require_approval, and the reason code.

## 4. Respond (human-in-the-loop; no automatic destructive remediation)

The subsystem never revokes credentials, disables accounts, deletes records,
stops services, or rolls back deployments. Use existing **authorized** workflows:

| Situation | Action |
|-----------|--------|
| Repeated auth failures | confirm with account owner; consider IdP-side lock via existing workflow |
| Unapproved tool / scope expansion | do NOT widen the mission automatically; escalate for governed approval |
| Secret-access attempt | confirm legitimate need; grant via governed policy only |
| Prompt injection in retrieved content | quarantine the source; keep content as evidence only |
| Non-governed deploy branch | verify authorization; use the governed promotion process |
| Missing provenance | hold behind the evidence gate — this is integrity, not "the science is wrong" |
| Sensitive-locality disclosure attempt | existing redaction policy blocks it; verify no leak occurred |
| Bulk export | confirm an authorized job; correlate actor + mission |

## 5. Disposition

Assign one of: `confirmed_incident`, `benign_expected`, `false_positive`,
`policy_violation_no_compromise`, `needs_investigation`, `test_simulation`.

- A reviewer name is **required**.
- `false_positive` **requires a reason**.
- Disposition sets incident status and records a human conclusion.

## 6. Closed loop

- Verified dispositions feed rule health (precision) and produce **reviewable
  proposals** (`review_noisy_rule`, `add_fixture`).
- Proposals are never auto-applied. Capture confirmed incidents as regression
  fixtures; land threshold changes through the normal PR process
  (`security_rule_versions`).

## 7. Escalation

- Unresolved owner/deployment gates are reported honestly and never bypassed.
- If the Trust Center shows **unavailable/unauthorized**, that is fail-closed by
  design — restore the backend contract or grant authorization; do not infer
  "all clear".
