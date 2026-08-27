# Domain & Email-Authentication Posture — Configuration Guide

The domain-posture monitor (`src/lib/security/domainPosture.ts`) is **read-only**.
It never changes DNS. It assesses records supplied by an authorized backend
collector and produces an explainable report the Trust Center renders.

## Required configuration

These values are **not guessed**. Provide them explicitly (env or backend
config); unknown values are reported as "configuration required".

| Config | Example | Notes |
|--------|---------|-------|
| `SECURITY_DOMAINS` | `orchidcontinuum.org` | apex domain(s) to assess |
| `SECURITY_DKIM_SELECTORS` | `google,selector1` | DKIM selectors — **cannot be discovered safely**; must be supplied |
| feature flag `VITE_SECURITY_DOMAIN_POSTURE` | `true` | enables the Trust Center panel |

If the confirmed domain or DKIM selectors are not safely discoverable from
existing configuration, the monitor still runs and reports exactly which values
are missing — it does not invent them.

## What is checked

- **SPF** — presence; fails on `+all`; warns without an explicit `all`.
- **DMARC** — presence; policy (`p=none` warns, `p=quarantine`/`p=reject`
  passes when an `rua` is configured); reporting guidance.
- **DKIM** — for each configured selector: key present / missing / revoked.
- **HTTPS certificate** — expiry window (warns ≤ 14 days, fails if expired).
- **Domain registration** — expiry when reliably obtainable.
- **Dangling DNS** — subdomain CNAME to a decommissioned target (takeover risk).

## Collector contract

The backend collector fetches DNS TXT (`@`, `_dmarc`, `<selector>._domainkey`),
certificate metadata, registration expiry (where obtainable), and subdomain
CNAMEs, then passes a `DomainRecords` object to `assessDomainPosture`. The
frontend performs **no** network calls for this feature.

## Output

A `DomainPostureReport` with per-check `pass`/`warn`/`fail`/`unknown`, actionable
guidance (never an automatic change), an overall = worst-finding status, and
`read_only: true`. Guidance describes what an operator should change manually.
