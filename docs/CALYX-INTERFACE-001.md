# CALYX-INTERFACE-001 — Governed Calyx Interface

## Purpose

Provide an owner-authenticated interface to the merged Calyx Brain, canonical Knowledge Graph, deterministic inference engine, and Reasoning Ledger bridge.

## Routes

- `/calyx`
- `/speak-with-calyx`
- `/mission-control/calyx`

## Implemented workflow

1. Search canonical graph nodes by canonical key and optional node type.
2. Select a canonical subject and inspect outgoing relationship types.
3. Run one of the 13 deterministic inference families exposed by the backend Brain.
4. Review candidate confidence, canonical object identity, evidence edges, source records, and deterministic rule trace.
5. Submit a selected inference to an existing Reasoning Ledger using the exact ledger UUID, Research Station project UUID, and expected version.

## Governance boundaries

- Uses the existing owner-session authentication transport.
- Does not create a second graph or reasoning store.
- Does not accept or persist private chain-of-thought.
- Does not approve a ledger conclusion.
- Does not publish to the canonical Knowledge Graph.
- The backend recomputes the inference and verifies its content hash before ledger submission.
- Existing Reasoning Ledger and BUILD-088 publication gates remain authoritative.

## Backend dependencies

- `POST /brain/query`
- `GET /brain/node/{node_id}`
- `GET /brain/relationships/{node_id}`
- `POST /brain/infer`
- `POST /brain/inferences/{subject_node_id}/submit-to-ledger`

## Known limitations

- This first interface is a governed scientific workspace, not an unconstrained conversational LLM.
- Canonical graph search currently uses exact canonical-key and node-type filters supported by the backend.
- Ledger and project selection require their canonical UUIDs until a project/ledger browser endpoint is connected.
- Human review, conclusion editing, approval, and controlled publication remain in their existing governed APIs and are not duplicated here.

## Validation

The dedicated GitHub Actions workflow runs repository lint and production build. No deployment is performed by this PR.
