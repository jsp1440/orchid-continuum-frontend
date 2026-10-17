# Featured Genus Profile — frontend binding of `featured-genus-profile/v1`

Status: implemented on branch `agent/featured-genus-profile-v1`.
Producer: `orchid-calyx-backend` (`app/featured_genus/`, routes under
`/api/featured-genus/v1/`). Backend contract document:
`docs/FEATURED-GENUS-PROFILE-V1.md` in that repository.

## What this is

The Genus Profile page (`/genus/:name`) now carries a **Scientific Profile**
exhibit — the composed, governed record for the genus — in addition to the
curated field-guide content. The exhibit is produced entirely by the Calyx
backend from four governed sources:

| Section | Source |
| --- | --- |
| Taxonomy (accepted genus, recorded species count, representative names) | `public.orchid_taxonomy` |
| Approved media count (one photograph per species, licensed, attributed) | shared `select_approved_genus_media` policy over `public.orchid_images` |
| Habitat (climate tag, collection tag, elevation range) | `oc_widget.v_genus_of_day_cards` |
| Knowledge-graph coverage and per-domain research chips | `oc_graph.kg_nodes/kg_edges` via `runtime.knowledge_graph` |

The frontend **never** composes scientific claims itself. It validates the
payload against the versioned contract and renders exactly what the backend
attests.

## Evidence-state discipline (binding)

Every section and every research domain carries one of three states:

- `known` → **Documented** — a canonical source returned linked evidence.
- `unknown` → **Not yet linked** — the source answered and holds nothing
  linked yet. A knowledge gap. Never biological absence, never rendered as 0.
- `unavailable` → **Unavailable** — the source did not answer. No fallback
  claim is made, and no local content is substituted.

A genus with no approved photographs shows an explicit statement that no
substitute image is shown. A genus the taxonomy backbone does not accept
(`invalid_genus`) renders nothing at all.

## Frontend modules

- `src/lib/featuredGenusProfile.ts` — the only public entry point.
  `fetchFeaturedGenusProfile(genus)` and `fetchFeaturedGenusSelection()` call
  the Calyx endpoints and normalize the payload. Anything off-contract —
  wrong `contract` version, out-of-vocabulary evidence state, negative
  counts, a domain record missing its linkage counters — becomes
  `unavailable`. Caller aborts rethrow; backend timeouts map to
  `unavailable`.
- `src/components/orchid/GenusScientificProfile.tsx` — the exhibit.
  Always-visible summary (recorded species, graph records, approved
  photographs, documented-domain ratio) plus continuation links into Atlas,
  Species dossiers, Matrix identification, and Research (via the existing
  navigation contracts). A toggle expands research details: taxonomy card
  with representative names, habitat/elevation card, knowledge-graph card,
  self-describing domain chips, the knowledge-gap statement, media
  provenance, and composer notes.
- `src/pages/GenusDetail.tsx` — mounts the exhibit in BOTH branches: the
  curated field-guide entry (`genus={entry.genus}`) and the
  no-curated-entry fallback (`genus={name}`), so any accepted genus receives
  its verified scientific record even without a curated page.

## Synonym handling

When the requested name resolves to a different accepted genus, the exhibit
header states `Requested as X — accepted name Y`. Both names come from the
backend payload; the frontend does not perform taxonomic resolution.

## Selection contract

`featured-genus-selection/v1` (`GET /api/featured-genus/v1/selection`)
exposes the reproducible Featured Genus selection: a deterministic 12-hour
UTC rotation over a governed candidate list, overridable by an editorial
policy file (`runtime/requirements/featured_genus_selection_policy.json`)
that preserves reviewer, reason, expiry, and an `evidence_reviewed` gate for
non-candidate genera. `normalizeFeaturedGenusSelection` validates it with
the same fail-closed discipline. No scheduler was added; selection is a pure
function of time plus the versioned policy.

## Tests

- `src/lib/featuredGenusProfile.test.ts` — contract accept/reject, evidence
  vocabulary, negative counts, malformed domain records, fetch mapping
  (ok / HTTP error / `invalid_genus` / off-contract / network failure /
  caller abort), selection normalization.
- `src/components/orchid/GenusScientificProfile.test.tsx` — boundary
  discipline (non-canonical name and backbone-rejected genus render nothing
  and never fetch), summary + continuation links, synonym note, expand
  toggle, knowledge-gap wording, no-substitute-photograph statement,
  unavailable honesty.
- `src/pages/GenusDetail.scientificProfile.test.ts` — source-integrity
  guard that both page branches mount the exhibit.

All 30 tests pass (`vitest run`, jsdom for the component suite).
