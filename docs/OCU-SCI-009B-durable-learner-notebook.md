# OCU-SCI-009B — Durable Learner Notebook

## Purpose

Prepare a learner-facing scientific notebook that can use the OCU-SCI-009A durable session API only after the backend proves the cryptographically gated Postgres durable release mode.

## Release-contract correction

This build first fixes an existing frontend/backend contract mismatch.

The frontend previously expected synthetic `release_mode` and `blockers` fields that the backend release-readiness endpoint does not return. The frontend now consumes the actual OCU-RELEASE-002 payload and derives display mode/blockers locally from authoritative backend facts.

Recognized modes are:

- disabled
- read-only
- verified durable
- blocked/inconsistent

Scientific content loads only when safety flags are coherent and publication, Candidate Knowledge writes, and Calyx model calls remain disabled with human review required.

## Durable workspace gate

The learner notebook renders only when both release-readiness and capability responses agree on:

- University enabled;
- session writes enabled;
- `durable_sessions_enabled = true`;
- `persistence = postgres_durable`;
- the durable evidence gate open;
- publication disabled;
- Candidate Knowledge writes disabled;
- Calyx model calls disabled;
- human review required.

A mismatched capability/release state fails closed.

## Learner workflow

The notebook supports:

- create investigation;
- resume by session ID;
- save learner-authored stage records;
- exact expected-revision mutations;
- record hypothesis/evidence separately during Investigate;
- record conclusion/uncertainty separately during Communicate;
- advance exactly one inquiry stage;
- submit for human review.

Learner drafts remain in the text area when an API save fails or a revision conflict occurs.

## Scientific exit gates

The UI mirrors the OCU-SCI-009C backend rules:

- Observe requires an observation;
- Question requires a question;
- Investigate requires hypothesis + examined evidence;
- Analyze requires analysis;
- Interpret requires interpretation;
- Communicate requires conclusion + uncertainty.

The backend is authoritative. Direct API callers cannot bypass these requirements.

After `changes_requested`, the backend requires new post-review conclusion and uncertainty records before resubmission.

## Authentication boundary

This build does **not** claim a public multi-user learner identity system.

The notebook uses the existing Calyx authenticated session/cookie contract. If no accepted authenticated identity exists, write calls return an authentication error.

A dedicated learner identity/enrollment system remains separate work and must preserve session ownership isolation.

## Instructor review boundary

This build deliberately does not expose instructor approval controls.

OCU-SCI-009A requires a governed Mission Control reviewer principal with an active scientific-review qualification. A frontend instructor workflow should be added only when the qualified-principal identity path is explicitly available to the UI.

## Production boundary

No frontend code in this build can open durable mode by itself. Rendering the notebook depends entirely on the backend's verified durable capability state.

The production migration and activation flags remain outside this build and remain blocked by the OCU-SCI-007 production cutover/evidence sequence.
