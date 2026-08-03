# CALYX-WORKSPACE-002 — Governed Calyx Workspace Reconciliation

## Purpose

Rebuild the useful owner-facing Calyx workspace from Draft PR #67 on top of current `main`, preserving the newly merged homepage, Relationship Matrix, Orchid Identification, and University routes.

## Routes

- `/calyx`
- `/speak-with-calyx`
- `/mission-control/calyx`

All three routes resolve to one governed workspace and require the existing owner-authentication transport for protected operations.

## Workspace panels

1. **Ask Calyx** — sends bounded requests to the canonical Brain/agent APIs and displays deterministic fallback or external-synthesis provenance.
2. **Graph Explorer** — searches canonical subjects and displays typed relationship categories without client-side graph inference.
3. **Relationship Matrix** — links selected subjects into `/relationship-matrix` and displays backend-provided scores, coverage, uncertainty, and evidence.
4. **Identification** — sends selected observation context to `/orchid-identification`; suggestions remain unverified.
5. **Reasoning Review** — displays candidate evidence, confidence, contradictions, rule identity/version, and publication blockers.
6. **Design and Education** — presents governed website, accessibility, curriculum, lesson, assessment, and virtual-lab recommendations.
7. **Autonomy and Taxonomy** — presents durable-orchestrator and taxonomy-readiness status through authenticated backend calls.

## Reuse from PR #67

- typed Brain client patterns;
- graph subject search;
- deterministic inference presentation;
- evidence/rule/provenance display;
- Reasoning Ledger submission contract;
- owner-authenticated routing.

## Required changes from PR #67

- rebuild from current `main` rather than merge the stale branch;
- preserve `/continuum-next`, `/relationship-matrix`, `/orchid-identification`, and `/university`;
- consume `oc-parallel-v1` contracts;
- add taxonomy, education/design, and orchestrator status;
- avoid duplicate App route registrations;
- use truthful degraded and unavailable states;
- keep all scientific scoring and identity authority on the backend.

## Safety

The browser cannot approve or publish scientific knowledge, verify an orchid identity, calculate canonical relationship scores, merge code, deploy, alter taxonomy, or start autonomous workers without authenticated owner-governed backend operations.

## Validation

Dedicated CI must run lint, TypeScript checks, tests, and production build, plus the existing frontend and BUILD-092R regression suites.