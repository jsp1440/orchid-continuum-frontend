# Orchid Continuum — Security Control Plane

A compact, provider-neutral, privacy-preserving **defensive** control plane for
the Continuum's applications, scientific data pipelines, infrastructure, and AI
agents. It is inspired by general industry patterns; it does not depend on or
reproduce any commercial product.

> First release is **observe / explain / warn**, not automatic blocking.
> Enforcement and the admin surface are feature-flagged and default **off**.

## Implementation map

| Layer | Module | Tests |
|-------|--------|-------|
| Event envelope (versioned Zod contract) | `src/lib/security/envelope.ts` | `envelope.test.ts` |
| Sanitization / redaction | `src/lib/security/sanitize.ts` | `sanitize.test.ts` |
| Ingestion (sanitize→validate→quarantine) | `src/lib/security/ingest.ts` | `ingest.test.ts` |
| Deterministic signals | `src/lib/security/signals.ts` | `signals.test.ts` |
| Behavioral baselines | `src/lib/security/baselines.ts` | `baselines.test.ts` |
| Explainable risk score | `src/lib/security/risk.ts` | `risk.test.ts` |
| Correlation + incident model + narrative | `src/lib/security/incident.ts` | `incident.test.ts` |
| Disposition + closed-loop proposals | `src/lib/security/disposition.ts` | `disposition.test.ts` |
| Prompt-injection detection | `src/lib/security/promptInjection.ts` | `promptInjection.test.ts` |
| Adversarial corpus | `src/lib/security/promptInjectionCorpus.ts` | (used above) |
| Mission-scoped tool policy | `src/lib/security/toolPolicy.ts` | `toolPolicy.test.ts` |
| Just-in-time warnings | `src/lib/security/warnings.ts` | `warnings.test.ts` |
| Read-only domain posture | `src/lib/security/domainPosture.ts` | `domainPosture.test.ts` |
| Operational metrics | `src/lib/security/metrics.ts` | `metrics.test.ts` |
| Feature flags | `src/lib/security/featureFlags.ts` | — |
| Fail-closed API client | `src/lib/securityApi.ts` | `securityApi.test.ts` |
| Trust Center UI | `src/components/security/SecurityTrustCenter.tsx` | `SecurityTrustCenter.render.test.tsx` |

Barrel import: `import { ingestSecurityEvent, evaluateSignals } from '@/lib/security'`.

## Documents

- [ADR-0001 — Security Control Plane](./ADR-0001-security-control-plane.md)
- [Threat Model](./THREAT_MODEL.md)
- [Privacy & Retention](./PRIVACY_RETENTION.md)
- [Rule Catalog](./RULE_CATALOG.md)
- [AI-Agent Security Policy](./AI_AGENT_SECURITY_POLICY.md)
- [Incident Response Runbook](./INCIDENT_RESPONSE_RUNBOOK.md)
- [Domain Posture Config](./DOMAIN_POSTURE_CONFIG.md)

## Feature flags

| Flag | Default | Effect |
|------|---------|--------|
| `VITE_SECURITY_TRUST_CENTER` | off | shows the Trust Center surface |
| `VITE_SECURITY_ENFORCE` | off | denials hard-block instead of warn |
| `VITE_SECURITY_DOMAIN_POSTURE` | off | shows the domain-posture panel |

## Backend contract

The producer routes and the machine-readable envelope schema
(`contracts/security-event-v1.schema.json`, backend repo) MUST stay in sync with
`envelope.ts`. See the ADR for the route table.
