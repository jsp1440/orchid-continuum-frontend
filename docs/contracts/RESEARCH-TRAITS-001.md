# Research Station Trait Explorer — #525

Classification: CONTINUE. Governing intent: canonical Brain #96 and
`05_OPERATIONS/Completion_Portfolio/BLUEPRINT.md` (trait integration and Research
Station). This is a read-only frontend consumer, not a scientific publication path.

## Current boundary

The static Trait Explorer card on `/research` is replaced by an explicit retrieval
form. The arriving genus or exact species is prefilled as navigation context. No
request happens until the researcher submits the form. Changing the subject or
leaving the route aborts and discards the old result, including late responses
from transports that ignore abort.

Canonical backend integration `565a752c29da440055f7c6415234fab305c6e8b0` has no
`GET /api/research/traits` route. The existing trait-genomics discovery/archive
routes are not a distribution-read contract and are not called as a substitute.
Per #525, a missing route renders **not yet available**. There are no production
fixture values, provider calls, database writes, or invented source receipts.

## Read contract for backend convergence

Use the existing Calyx backend base URL and Research Workspace request adapter
(session cookies, JSON accept header, canonical auth/error classification).

- `GET /api/research/traits?genus=Cattleya`
- `GET /api/research/traits?species=Cattleya+purpurata`

Exactly one genus or species binomial is sent. Project identity, locality, route
metadata and claims are not forwarded. The server must resolve taxonomy and read
canonical persisted records under its existing permissions; the client does not
resolve, verify or alter authoritative taxonomy.

Required response fields:

| Field | Contract |
| --- | --- |
| `contract_version` | `oc-research-traits-v1` |
| `subject` | `{rank: "genus" or "species", name: string}`; must exactly match the request |
| `state` | Source-reported availability/evidence state |
| `generated_at` | Snapshot timestamp or null; missing remains not supplied |
| `distributions` | Array of at most 100 distinct trait records |

Each distribution has `trait_id`, `label`, nullable `unit`, `evidence_state`,
nullable `confidence` (0–1), nullable `sample_size`, `buckets`, and `receipts`.
Buckets have a string/finite-number/null `value` and a nonnegative integer/null
`count`. Counts and sample sizes must be safe integers. Missing counts become
UNKNOWN, while an explicitly supplied zero stays zero. No percentage or total
is calculated from partial counts. Units and source states are never inferred.

Receipts preserve nullable `source_id`, `source_name`, `record_id`, `source_url`,
`retrieved_at`, and `license`. Links must be HTTP(S), without embedded credentials.
VERIFIED trait records require source and record identity. Missing provenance is
explicitly labelled; a frontend render cannot establish scientific verification.

Recognized states remain distinct: AVAILABLE, PROVISIONAL, VERIFIED,
CONTRADICTORY, UNKNOWN, UNAVAILABLE, WITHHELD, ABSENT, REJECTED, SUPERSEDED.
UNKNOWN/UNAVAILABLE/WITHHELD/ABSENT envelopes cannot carry distributions, and
individual records with those states cannot carry values or source receipts.
ABSENT means no records were returned, never biological absence. Malformed
contracts, unsafe links, duplicate trait identities and wrong-subject responses
fail closed. Unknown extra fields are not projected into the user interface.

## Validation and limits

`src/lib/researchTraits.test.ts` exercises request scope, real zero versus missing,
state preservation, provenance validation, missing routes, auth, network errors,
cancellation and malformed/mismatched responses. The component test mounts the
real client with only HTTP mocked, verifies source inspection and accessible
controls, and exercises subject changes and out-of-order responses. Fixtures are
transport tests, not evidence of real trait holdings.

Completion graph scores only this frontend consumer. Backend availability,
browser retrieval of real persisted records, integration and deployment are not
claimed from local tests. No separate tracker duplicates #525 for that remaining
backend convergence work.
