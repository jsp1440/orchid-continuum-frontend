# OCU-SCI-009F — My Investigations frontend

The durable University notebook now discovers the signed-in learner's own recent investigations through the ownership-filtered backend endpoint merged in `orchid-calyx-backend`.

## Behavior

- `My investigations` loads ten learner-owned summaries at a time.
- Resume fetches the selected full session only after the learner chooses it.
- Additional pages use the backend opaque keyset cursor.
- Manual session-ID resume remains available as a support/debug fallback.
- The list shows stage, status, update time, and revision only; it does not display actor IDs, event payloads, review notes, or reviewer identity.

## Identity and cache isolation

Requests use the existing Supabase bearer session. React Query discovery caches are partitioned by the JWT `sub` UUID, not by a shared key and not by the bearer token. If a stable learner subject cannot be decoded locally, discovery fails closed and asks the learner to sign in again. Backend authorization remains authoritative; local JWT decoding is used only for cache partitioning.

## Governance

No reviewer authority is derived from learner login. Publication, Candidate Knowledge writes/promotion, and Calyx model calls remain unavailable. This frontend build does not activate production flags or run database migrations.
