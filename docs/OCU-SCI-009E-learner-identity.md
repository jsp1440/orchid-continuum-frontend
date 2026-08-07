# OCU-SCI-009E — Frontend learner identity integration

## Purpose

Bind the durable University learner notebook to the Orchid Continuum account system that already exists in `AuthContext` / Supabase Auth.

No second University login or account database is introduced.

## Release contract

The frontend consumes backend `OCU-RELEASE-003` and treats durable mode as valid only when both `/release-readiness` and `/capabilities` independently agree that:

- University is enabled;
- learner session writes are enabled;
- backend-verifiable learner auth is enabled;
- Postgres durable persistence is active;
- the durable release-evidence gate is fully satisfied;
- publication is disabled;
- Candidate Knowledge writes are disabled;
- Calyx model calls are disabled;
- human review remains required.

A durable release cannot be inferred when learner authentication is absent.

## Learner bearer identity

The notebook reads the existing Supabase session from `useAuth()`.

For learner-owned session operations only, the current `session.access_token` is sent as:

`Authorization: Bearer <access token>`

Affected operations:

- create investigation;
- resume investigation;
- append learner event;
- submit investigation.

Public release, capability, catalog, chapter, and laboratory requests do not receive the learner bearer token.

The frontend does not persist a second copy of the token in University state or local storage; Supabase Auth remains responsible for session persistence.

## Signed-out behavior

A signed-out visitor may still access approved read-only University content.

The durable learner notebook shows a sign-in-required boundary rather than anonymous create/resume controls. The existing `/account` route is used for sign-in/account management.

Signing in as a learner does not grant instructor or scientific-review authority.

## Reviewer separation

No instructor decision controls are added by this build.

Scientific review remains governed by the backend Mission Control principal and qualification system. Learner authentication and reviewer qualification are separate identity domains.

## Error behavior

Expired or invalid learner sessions are surfaced as a sign-in-again message. Unsaved scientific text remains in the browser component after failed save requests so authentication or concurrency failure does not silently discard learner work.

## Runtime boundary

This frontend integration does not:

- enable the backend learner-auth flag;
- enable durable session writes in production;
- apply a database migration;
- publish learner work;
- write or promote Candidate Knowledge;
- enable Calyx model calls.
