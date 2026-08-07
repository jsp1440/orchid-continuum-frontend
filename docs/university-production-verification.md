# OCU-SCI-007 — University Production Verification

## Purpose

Provide one reproducible end-to-end check that proves the deployed Orchid Continuum University is being served by the canonical React frontend and that the Calyx backend is in the approved read-only release state.

This replaces informal browser inspection with a versioned JSON evidence artifact.

## Local command

```bash
npm run verify:university-production -- \
  https://<frontend-origin> \
  https://<calyx-origin>/api \
  university-production-evidence.json
```

## GitHub Actions

Run **OCU University Production Verification** manually and provide:

- `frontend_url`: the canonical frontend origin
- `api_url`: the Calyx API base including `/api`

The workflow uploads `university-production-evidence.json` whether verification passes or fails.

## Frontend checks

The verifier requires `/university/lab` to:

- return HTTP success;
- return HTML;
- contain the canonical React `#root` application shell;
- not render a generic “Page not found” response; and
- not contain the Famous.ai deployment badge.

## Backend checks

The verifier requires:

- `GET /learning/release-readiness` to report the approved read-only state;
- University enabled;
- session writes disabled;
- publication disabled;
- Candidate Knowledge writes disabled;
- Calyx model calls disabled;
- human review required;
- the expected chapter and laboratory in the catalog;
- a nonempty evidence-backed chapter;
- the seven-stage inquiry sequence; and
- a nonempty laboratory evidence catalog.

## Evidence artifact

A passing artifact records:

- verification schema and build identifier;
- timestamps;
- frontend and API origins;
- route status;
- release-readiness response;
- capability response;
- chapter and laboratory identifiers;
- chapter section count; and
- laboratory evidence count.

The artifact contains no credentials, cookies, learner records, or private scientific data.

## Release boundary

A passing artifact proves the read-only University release only. It does not authorize:

- durable learner persistence;
- instructor accounts;
- live Calyx tutoring;
- publication;
- Candidate Knowledge promotion; or
- replacement of human review.

Those require later reviewed builds and explicit governance gates.
