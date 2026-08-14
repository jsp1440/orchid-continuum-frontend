# HOMEPAGE-RECOVERY-008 — Integrated validation and convergence

Parent: #163  
Validation issue: #171  
Implementation record: #177  
Candidate base: PR #176 / `homepage-recovery-006-contextual-calyx`

## Purpose

Validate the homepage recovery as one public experience rather than treating individually green components as sufficient evidence of readiness.

## Candidate lineage

The integrated candidate contains the converged work from:

- #161 — frontend/backend contract recovery;
- #172 — reduced story flow, language, and hero;
- #173 — shared Featured Genus/species/media context;
- #174 — thematic homepage Atlas;
- #175 — relationship / Knowledge Graph convergence;
- #176 — contextual Public Calyx.

This branch does not create another homepage design or feature lineage.

## Automated integration guardrails

`src/lib/homepageIntegratedValidation.test.ts` verifies the assembled source contract:

1. the public homepage remains reduced to the seven intended major content sections;
2. retired duplicate full-page blocks are not remounted;
3. Featured Genus, Relationships, Atlas, and Calyx use the converged shared context chain;
4. known grant/operator/governance phrases do not leak into the public homepage surfaces;
5. `wonder` is not used as a prescribed stage/section label;
6. Atlas and relationship surfaces preserve no-data-versus-biological-absence semantics;
7. advanced Atlas, graph, relationship explorer, and Calyx destinations remain available deeper in the product;
8. primary surfaces retain responsive breakpoint behavior.

These tests are regression guardrails. They are **not** a substitute for browser/device review.

## Required browser review matrix

The final release candidate must still be reviewed at minimum on:

| Target | Required checks | Status on this branch |
|---|---|---|
| Desktop | narrative flow, spacing, images, Atlas interaction, relationship selection, Calyx entry, keyboard focus | PENDING DEPLOYED CANDIDATE |
| iPad | primary review target; one-idea-per-viewport intent, typography, map sizing, controls, rotation, touch targets | PENDING DEPLOYED CANDIDATE |
| iPhone/mobile | no horizontal overflow, readable text, compact controls, map interaction, Calyx control | PENDING DEPLOYED CANDIDATE |

## Live-data checks still required

A deployed candidate must demonstrate, in the browser:

- approved Featured Genus media loads and attribution/license are visible;
- a species change remains synchronized across Featured Genus, relationships, Atlas, and contextual Calyx;
- `/api/atlas/occurrences` returns real geographic evidence and service failure remains distinct from a successful empty response;
- unavailable thematic layers remain unavailable rather than rendering invented content;
- relationship cards never silently promote genus-level/local-profile context to species-level evidence;
- Public Calyx receives the verified page context and reports authentication/backend failure honestly;
- full Atlas / graph / relationship / Calyx workspaces remain reachable.

## Publication gate

Issue #171 and parent #163 must remain open until a deployed candidate passes the desktop, iPad, and iPhone review above.

This branch **does not authorize deployment**. Deployment remains an explicit owner-governed action.

## Completion states

- `CODE_INTEGRATION_VALIDATED`: tests/build/lint and source-level integration guardrails pass.
- `DEPLOYED_BROWSER_VALIDATED`: desktop + iPad + iPhone and live-data checks pass on an owner-authorized deployed candidate.
- `READY_FOR_OWNER_RELEASE_DECISION`: both states above are satisfied and no blocker remains.

Only the last state is sufficient to recommend merging/releasing the recovered homepage.
