# FeaturedTaxonContinuum — the canonical featured-taxon contract

**Type definition:** `src/types/featuredTaxonContinuum.ts`
**Audit that motivated it:** `docs/audits/GENUS-OF-THE-DAY-DATA-PATH-AUDIT.md`
**Status:** contract defined. No section has been migrated to it yet.

One document, assembled by the Orchid Continuum backend, carrying everything the public
homepage is permitted to say about the taxon currently in focus.

---

## 1. Endpoints

```
GET /api/featured-taxon/current
GET /api/featured-taxon/genus/{genus}
```

`current` is authoritative for **which** taxon is featured. The window, the rotation, and any
curator override are all resolved server-side and reported in `focus.selection`. The frontend
stops owning that decision entirely — no clock arithmetic, no genus list in the bundle, no
direct read of `daily_genus_snapshot`.

`genus/{genus}` returns the same document for an explicitly requested genus, for deeper pages
and for previewing an override.

Both return `FeaturedTaxonResult`.

---

## 2. The four invariants

**I1 — The backend chooses the taxon.**
`focus.selection.decidedBy` names the service that decided. A client that computes the featured
genus is out of contract.

**I2 — Every scientific value is evidenced.**
Values reach the UI only inside `Evidenced<T>`, which requires `scope`, `scopeTaxon`, and at
least one `Provenance`. A genus-level statement therefore cannot be rendered as a species-level
claim: the scope travels with the value and the UI is obliged to show it.

**I3 — Absence is representable, and typed.**
`Field<T>` is `present | absent | restricted | unavailable`. There is no `undefined` for a
default to fill, and no way to render an outage as an empty archive.

| State | Means | Renders as |
| --- | --- | --- |
| `present` | The Continuum holds records | The records, with scope and provenance |
| `absent` | Searched, and nothing is held | A named knowledge gap, with `reason` (and `gap` where known) |
| `restricted` | Held, deliberately withheld | "Withheld", with `reason` — e.g. sensitive locality |
| `unavailable` | This sub-service failed for this request | "We could not load this", explicitly **not** a statement about the orchid |

**I4 — Disagreement survives.**
`records` is a list. Two sources that conflict are both carried; the frontend does not pick a
winner, and `confidence: 'contested'` marks the conflict.

---

## 3. What a consuming section may and may not do

**May:** format, translate, order, lay out, truncate with a visible affordance, and choose not to
show a section.

**May not:**
- compose a scientific claim by joining two fields into a sentence;
- substitute another taxon's record when the focus taxon has none;
- supply a default, placeholder, or "typical" value for a missing field;
- call any third party to fill a gap;
- render a value without the scope and provenance that came with it;
- treat `absent` and `unavailable` as the same state.

A `Field` that is not `present` is rendered as the gap it is. That is the deliverable, not the
failure case.

---

## 4. Consumer migration map

Each row states what a currently-mounted section must read from the contract, and what it must
stop doing. Referenced findings are from the audit.

| Section | Reads from contract | Must stop |
| --- | --- | --- |
| `DailyGenusProvider` | `focus` (whole) | Computing the genus from `FEATURED_GENERA` and the clock; reading `daily_genus_snapshot` directly (F1) |
| `HeroSpeciesProvider` | `focus.species` | Existing as an unwired provider — either carry `focus` or be deleted (F9) |
| `DailyGenusFeatureV3` | `focus`, `media`, `taxonomy`, `habitat`, `elevation` | Calling `featuredGenusEntry()` (F2); `CURATED_SPECIES_BY_GENUS`; all four iNaturalist paths (F4); `speciesCaption()` prose composition (F5); `buildLocalNarrative()` / the `genus-narrative` edge function |
| `DailyGenusFeatureV5` | `taxonomy`, `media`, `habitat`, `elevation`, `phenology`, `pollinators`, `mycorrhizae`, `conservation`, `coverage` | `GENERA` ecology literals; `FLOWERING_WINDOWS` and its generic default (F7); the fixed "Observations / Herbarium and GBIF / Interpreted range" tiles; fixed provenance strings |
| `HomeAtlas` | `focus`, `occurrences`, `geography`, `coverage` | Reading `atlas_occurrences` / `species` / `species_mycorrhizal` from Supabase in the browser; `MYCORRHIZAL_FALLBACK_COUNT` (462) and `GENERA_FALLBACK_COUNT` (744) (F6) |
| `ContinuumWeb` | `pollinators`, `mycorrhizae`, `geography`, `conservation`, `literature`, `coverage` | `CATTLEYA_FALLBACK` (F3); the hardcoded genus description; presenting taxon-independent `NODES` prose as if it described the focus taxon |
| `TheKnowledgeGraph` | `coverage`, `literature` | Advertising GBIF / iNaturalist / EOL / World Plants / BHL as sources the homepage demonstrates when it queries none of them |
| `OrchidGallery` | `media` | Reading `api.v_frontend_orchid_images` directly; synthesising `habitatDescription` from a country name |
| Neighbour-genera path | *(not in this contract — needs its own evidenced relationship contract)* | `fetchInatPollinatorGuild()` regex over Wikipedia prose; `buildRelationshipSentence()`; persisting either into `genus_photo_cache` (F5) |

---

## 5. What the backend cannot supply today

Measured against the endpoints the frontend currently knows about. **Five required relationships
have no backend source at all** — and they are exactly the five the homepage currently fills with
frontend constants.

### Cannot be supplied — no endpoint exists

| Section | What is missing | What the homepage does instead today |
| --- | --- | --- |
| `elevation` | No elevation endpoint of any kind | `GenusEntry.ecology.elevation` string literal |
| `phenology` | No flowering/phenology endpoint of any kind | `FLOWERING_WINDOWS` literal, defaulting to `[2,3,4,5,8,9]` for unlisted genera |
| `literature` | Only an integer count on `nodes.knowledge`. No citations, DOIs, or claim-to-source links | Renders a count; no reference is ever shown |
| `geography` (genus-level) | Derivable from occurrences only. No curated native range, endemism, or unsurveyed-region statement | `GenusEntry.regions` string array literal |
| `pollinators` (identity + evidence) | `nodes.pollinators` gives a count and unlabelled item strings. No taxon identity, interaction type, evidence, or citation | Regex over an iNaturalist Wikipedia summary, then a frontend-written sentence |

### Can be supplied, but not in contract shape

| Section | Endpoint today | What is missing for the contract |
| --- | --- | --- |
| `taxonomy` | `/api/species/search`, `/api/species/{id}` | Species-level only. No genus record, no synonyms, no accepted-species count except `hub.species_count` on the graph route. No `Provenance`. |
| `media` | `CALYX /api/media/genus/{genus}` | **Closest to compliant** — already carries license, attribution, source record URL, and four explicit states. Needs `retrievedAt` and a per-species variant. |
| `occurrences` | `{OC_API}/atlas/occurrences` | Exists but the homepage bypasses it for Supabase. No `basisOfRecord`, `eventDate`, `coordinatePrecision`, or `sensitiveWithheldCount`. Route prefix disagrees with sibling `/api/...` routes — see audit §2. |
| `habitat` | `/api/species/{id}.habitat` | Free text, species-level only. No genus-level statement, no controlled vocabulary, no substrate, no provenance. |
| `mycorrhizae` | `/api/mycorrhizal/{taxonomy_id}` | Species-level, keyed by taxonomy id. No genus rollup, no `detectionMethod`, no `associationType`, no citation. |
| `conservation` | `conservation_status` / `iucn_code` on the species dossier | A bare code. No authority, criteria, assessment year, or scope. |
| `coverage` | *nothing* | No endpoint reports its own limits. This is what makes honest gap rendering impossible today. |

### The structural gap

**No endpoint returns the featured taxon as one document.** Assembling the current homepage takes
at minimum nine requests across six origins, with the joins performed in the browser. Until
`/api/featured-taxon/current` exists, every consumer must keep its own resolution logic — which is
the condition that produced every finding in the audit.

---

## 6. Suggested build order

1. **`/api/featured-taxon/current` returning `focus` + `taxonomy` + `media` + `coverage` only.**
   Every other section reports `notImplemented`. This alone removes F1, F2, and F9, and makes the
   remaining gaps visible and honest rather than papered over.
2. **`occurrences` + `geography`**, moving the homepage map off direct Supabase reads.
3. **`mycorrhizae` + `conservation`** in contract shape, since partial sources already exist.
4. **`pollinators` with `interaction` and citations** — this is what retires the Wikipedia regex.
5. **`literature`**, which then lets every other section cite itself.
6. **`elevation` + `phenology`**, the two fields that are pure invention today.
