# OC-AUTH-GATING-001 route audit

## Result

Every route declared in `src/App.tsx` is now classified by
`src/lib/routeAccessPolicy.ts` as public, router-authenticated, or
component-authorized. A regression test fails when a route is added without an
access classification or when a router-authenticated route loses its
`ProtectedRoute` wrapper.

## Genuine gaps closed

Operational routes previously mounted before session authentication, including
Mission Control and its aliases, Intelligence Center, science/readiness views,
AI orchestration, and Daily Genus diagnostics. The diagnostics view exposes raw
response samples and endpoint health, so it is not a public field-guide page.
These routes now require a signed-in session before mounting.

This is defense in depth only. General authentication does not grant owner,
scientific-review, taxonomy, runtime, or publication authority. Existing
page/backend owner and capability checks remain authoritative for every action.

## Intentional public routes

The Admin Center and Control Center remain public because their implementation
explicitly defines them as a read-only, homepage-visible shell with no enabled
write controls. Public science, education, Atlas, dossiers, partner
placeholders, and session-local Saved Orchids also remain public.

## Equivalent internal guards

- `/account` is wrapped by `ProtectedRoute` inside `Account.tsx`.
- `/university/review` intentionally renders its sign-in state and requires
  backend-resolved `review.science` (and, where applicable,
  `review.expert`) capability before records or decision controls appear.

No route classification grants new access or authorization.
