# OCU-SCI-009G — Governed University reviewer workspace

## Purpose

Provide a separately governed human-review surface for submitted Orchid Continuum University investigations without conflating learner identity, administrator identity, scientific-review qualification, Candidate Knowledge consideration, or publication authority.

## Route

`/university/review`

The reviewer workspace is deliberately separate from `/university/lab`.

## Identity boundary

Reviewer API calls use the existing Mission Control owner-session transport. Authentication alone is not sufficient. The backend must resolve a current scientific-review qualification and effective capability.

- Administrator without scientific qualification: no decision controls.
- `review.science`: request changes and approve for learning.
- `review.expert`: additionally permits Candidate Knowledge consideration.
- Candidate Knowledge consideration is not promotion.
- No action in this workspace performs publication.

## Backend authority

The frontend never infers reviewer authority from role names. It consumes `/api/learning/reviewer/context` and renders decision controls only from `science_review_allowed` and `expert_review_allowed` returned by the backend.

Submitted-session queue and detail endpoints are server-authorized. Reviewer detail omits learner actor IDs, event actor IDs, and reviewer actor IDs while retaining the learner-authored scientific record and prior decision history needed for review.

## Qualification governance

OCU-SCI-009G backend introduced `MISSION_CONTROL_REVIEWER_QUALIFICATIONS_JSON` with zero default grants. This frontend build does not assign a reviewer qualification. Assigning a real subject to a scientific-review qualification is a separate governance/operator action.

## Validation requirements

Frontend CI must pass:

1. Vitest regression suite.
2. Production Vite build.
3. Lint.

Regression coverage verifies:

- administrator-only context yields no review decisions;
- science authority yields learning decisions only;
- expert authority is required for Candidate Knowledge consideration;
- exact reviewed revision is sent with the decision;
- Candidate Knowledge promotion and publication remain false in the response contract;
- reviewer session identifiers are URL-encoded.

## Production boundary

This implementation does not:

- grant a real reviewer qualification;
- enable durable University flags;
- apply the University migration;
- publish learner work;
- promote Candidate Knowledge;
- enable Calyx model calls.
