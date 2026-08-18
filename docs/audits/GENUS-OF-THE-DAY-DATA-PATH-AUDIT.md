# Genus of the Day — end-to-end data path audit

**Status:** audit only. No behaviour was changed to produce this document.
**Base:** `main` @ `e4ae876` (homepage as currently mounted in `src/components/AppLayout.tsx`).
**Question asked:** for every value the homepage renders about the featured genus and species,
where does it actually come from?

---

## 1. Method

Traced outward from the two providers that wrap the homepage — `DailyGenusProvider` and
`HeroSpeciesProvider` in `src/components/AppLayout.tsx:93-94` — through every section mounted
inside them, into `src/lib`, and out to each network origin. Every rendered value is classified
by its true source, not by the comment above it.

### Source classes used below

| Code | Meaning |
| --- | --- |
| `OC-API` | Orchid Continuum public API (`orchid-continuum-public-api.onrender.com`) |
| `CALYX` | Calyx backend (`orchid-calyx-backend.onrender.com`) |
| `HARVESTER` | Image harvester #2 (`orchidcontinuumharvester2.onrender.com`) |
| `LEGACY` | Legacy host (`orchidcontinuum.onrender.com`) |
| `SUPABASE-TABLE` | Direct browser read of a Supabase table/view with the anon key |
| `SUPABASE-FN` | Supabase edge function |
| `INAT` | **Direct third-party request to `api.inaturalist.org` from the browser** |
| `LOCAL-CONST` | Hardcoded in the frontend bundle |
| `LOCAL-DERIVED` | Computed, stitched, or written as prose in the frontend |
| `CROSS-GENUS` | A value taken from a *different* taxon than the one it is displayed under |

---

## 2. There is no single data plane — there are six

The homepage does not talk to one backend. It talks to six independent origins, four of which
can serve overlapping scientific content, with no arbitration between them.

| # | Origin | Declared in | Used for |
| --- | --- | --- | --- |
| 1 | `BACKEND_BASE_URL` | `src/lib/backendConfig.ts:8` | genus photos, species search, daily genus |
| 2 | `OC_BACKEND_BASE` | `src/lib/ocBackend.ts:11` | occurrences, species dossier, mycorrhizal, continuum graph |
| 3 | `CALYX_BACKEND_BASE_URL` | `src/lib/backendConfig.ts:19` | approved media, knowledge graph |
| 4 | `IMAGES_BACKEND_BASE_URL` | `src/lib/backendConfig.ts:213` | trusted genus image library |
| 5 | `LEGACY_ONRENDER_BASE_URL` | `src/lib/backendConfig.ts:219` | legacy species search + per-species images |
| 6 | Supabase project | `src/lib/supabase.ts:5` | atlas occurrences, species, mycorrhizal rows, image view, caches |

Origins 1 and 2 currently resolve to the **same host by default** but are configured by different
environment variables (`VITE_BACKEND_BASE_URL` vs `VITE_ORCHID_CONTINUUM_API_BASE_URL`). A deployment
that sets one and not the other silently splits the featured genus across two backends.

Origin 6 is the one that actually draws the homepage map. `HomeAtlas` does **not** call the Orchid
Continuum API for occurrences at all — `fetchAtlasOccurrencePoints()` (`src/lib/orchidContinuum.ts:773`)
reads the `species`, `atlas_occurrences`, and `species_mycorrhizal` tables straight from Supabase in
the browser. The API route that exists for this (`ocBackend.ATLAS_OCCURRENCES_URL`) is only used by
neighbour-genus discovery.

### Route-prefix discrepancy

`ATLAS_OCCURRENCES_URL` is built as `${OC_BACKEND_BASE}/atlas/occurrences` (`src/lib/ocBackend.ts:18`)
— **no `/api` prefix** — while every sibling call in the same file uses `/api/...`
(`/api/atlas/stats`, `/api/mycorrhizal/stats`, `/api/species/search`). Issue #163 records PR #161 as
an "`/api` prefix repair" for exactly this route. Either the repair did not land on this constant or
the backend serves both; the frontend currently asserts the un-prefixed form.

---

## 3. The provider layer

### `DailyGenusProvider` — `src/lib/dailyGenusContext.tsx`

Carries exactly two values: `{ genus: string, diagnostic: string | null }`.

| Value | Source | Class |
| --- | --- | --- |
| Initial genus | `FEATURED_GENERA[floor(now / 12h) % 8]` — an 8-name array literal at `src/lib/featuredGenus.ts:41` | `LOCAL-CONST` |
| Override | `daily_genus_snapshot` row for today | `SUPABASE-TABLE` |
| `diagnostic` | Curator-facing string, console only | `LOCAL-DERIVED` |

**The provider never consults the Orchid Continuum API.** Two functions exist to ask the backend
which genus is featured — `ocBackend.fetchGenusOfDay()` (`/api/genus/daily`) and
`genusData.fetchDailyGenus()` (same route) — and **neither is called by the provider or by any
mounted homepage section.** The public "Genus of the Day" is a client-side clock function over a
hardcoded list of eight names, optionally overridden by a Supabase table.

The rotation is also a closed set: `FEATURED_GENERA` names 8 genera, `GENERA` in `genusData.ts`
curates 7. `Phalaenopsis` is in the rotation with **no curated record** — see finding F1.

### `HeroSpeciesProvider` — `src/lib/heroSpeciesContext.tsx`

Declares `{ species, genus, image, habitat, pollinator, fungi, region }`.

**It has no producer and no consumer anywhere in `src/`.** `grep -rn "useHeroSpecies\|setHeroSpecies"`
returns only the definition file. The provider is mounted, holds `null` for the life of the page, and
carries nothing. Any cross-section species continuity the homepage appears to have is coincidence —
each section resolves the taxon independently.

---

## 4. Field-by-field inventory

### 4.1 `DailyGenusFeature` → `DailyGenusFeatureV5` (`src/components/orchid/DailyGenusFeatureV5.tsx`)

Genus entry resolved at line 143: `lookupGenus(contextGenus) ?? featuredGenusEntry()`.

| Rendered value | Actual source | Class |
| --- | --- | --- |
| Genus name, family, tribe | `GENERA` literal, `src/lib/genusData.ts:57` | `LOCAL-CONST` |
| "Genus estimate" species count | `GenusEntry.speciesCount`, or `SPECIES_COUNT_FALLBACK` (`featuredGenus.ts:53`) | `LOCAL-CONST` |
| Discovery trail — Habitat / Pollination / Fungi | `entry.ecology.{habitat,pollinatorGuild,mycorrhizal}` | `LOCAL-CONST` |
| Discovery trail — "Care" body | Fixed sentence, `DailyGenusFeatureV5.tsx:82` | `LOCAL-CONST` |
| Summary cards: Habitat, Climate band, Range | `entry.ecology.*`, `entry.regions.join(', ')` | `LOCAL-CONST` |
| Summary card sub-captions | Fixed strings | `LOCAL-CONST` |
| Evidence: "Taxonomic scope" | `entry.family / entry.tribe` | `LOCAL-CONST` |
| Evidence: "Species represented" | Count of Calyx media items, else curated plate count | `LOCAL-DERIVED` |
| Evidence: "Provenance state" | Fixed string | `LOCAL-CONST` |
| **Flowering-through-time chart** | `FLOWERING_WINDOWS` literal (`DailyGenusFeatureV5.tsx:47`), **default `[2,3,4,5,8,9]` for any genus not listed** | `LOCAL-CONST` |
| Species Gallery images, names, attribution | `CALYX /api/media/genus/{genus}` | `CALYX` ✅ |
| Species Gallery offline cards | `entry.plates[].{species,conservation,distribution}` | `LOCAL-CONST` |
| Ecology cards: Pollinators, Mycorrhizae | `entry.ecology.*` | `LOCAL-CONST` |
| Atlas preview tiles ("Observations", "Herbarium and GBIF", "Interpreted range") | Fixed labels + one fixed caption; **no records are shown and no GBIF/herbarium data is fetched** | `LOCAL-CONST` |
| Conservation & Evidence prose | Fixed strings | `LOCAL-CONST` |
| Relationship chips | Built from `entry.*`; the chip builder is literally passed `sourceView="featuredGenusEntry"` | `LOCAL-CONST` |
| Graph evidence panel | `CALYX /api/knowledge-graph/genus/{genus}` — **gated behind `KNOWLEDGE_GRAPH_ENABLED`, which is `false` unless `VITE_ENABLE_KNOWLEDGE_GRAPH=true`** | `CALYX`, off by default |

Only two values in this entire section are backend science: the media gallery, and a graph panel
that is disabled by default.

### 4.2 `DailyGenusFeatureV3` (`src/components/orchid/DailyGenusFeatureV3.tsx`) — the visible hero panel

| Rendered value | Actual source | Class |
| --- | --- | --- |
| **Which genus** | `featuredGenusEntry()` at line 413 — **does not call `useDailyGenus()`** | `LOCAL-CONST`, desynced (F2) |
| Genus narrative / "field note" | `SUPABASE-FN genus-narrative` (AI-written), falling back to `buildLocalNarrative()` (`genusData.ts:281`) which composes prose from the `LOCAL-CONST` ecology block | `SUPABASE-FN` / `LOCAL-DERIVED` |
| Species name list | `CURATED_SPECIES_BY_GENUS` literal (~100 binomials, `DailyGenusFeatureV3.tsx:50`) **merged in front of** `OC-API /api/species/search` results | `LOCAL-CONST` + `OC-API` |
| Species photographs | Cascade: `localStorage` → `SUPABASE-FN genus-images` → `HARVESTER /images/genus/{g}` → **`INAT`** | mixed, ends in `INAT` |
| Additional species photographs | `fetchInaturalistSpeciesBatch(curated)` at line 464 — fired **unconditionally** for every curated genus, in parallel with the trusted path | `INAT` |
| Per-species habitat, elevation, pollinators, conservation, distribution | `SpeciesPlate` literals in `GENERA` | `LOCAL-CONST` |
| Hero caption paragraph | `speciesCaption()` (`DailyGenusFeatureV3.tsx:276`) — **frontend-authored prose** stitching genus-level and species-level fields into sentences such as *"Seedling establishment is connected to orchid mycorrhizal fungi, including …"* | `LOCAL-DERIVED` |
| Live species ecology | `fetchSpeciesEcology()` → `OC-API /api/species/search` + `/api/species/{id}` | `OC-API` ✅ |

**Contract mismatch:** V3's `RichEcology` type declares `habitat, distribution, elevation,
pollinators, mycorrhizal, region`. `fetchSpeciesEcology()` (`genusData.ts:2168`) only ever returns
`{ confirmed, habitat, region }`. `elevation`, `pollinators`, and `mycorrhizal` from the backend are
therefore **always `undefined`**, and `speciesCaption()` silently falls through to the `LOCAL-CONST`
plate values — so the caption reads as species-level ecology while carrying curated genus-level text.

### 4.3 `HomeAtlas` (`src/components/orchid/HomeAtlas.tsx`)

| Rendered value | Actual source | Class |
| --- | --- | --- |
| Genus filter seed | `useDailyGenus()` | provider ✅ |
| Occurrence points | `SUPABASE-TABLE species.occurrences` + `atlas_occurrences` | `SUPABASE-TABLE` |
| Per-point mycorrhizal partner | `SUPABASE-TABLE species_mycorrhizal` | `SUPABASE-TABLE` |
| **"Mycorrhizal linked" stat** | `OC-API /api/mycorrhizal/stats`, **else the literal `462`** (`ocBackend.ts:107`) | `LOCAL-CONST` on failure |
| **Genera count stat** | `OC-API /api/atlas/stats`, **else the literal `744`** (`ocBackend.ts:113`) | `LOCAL-CONST` on failure |
| Genus marker colours | `GENUS_COLOR` literal | `LOCAL-CONST` (cosmetic) |

Both statistics fall back to a hardcoded number with no visual distinction from a live value. A
visitor cannot tell `462` measured from `462` compiled in.

### 4.4 `ContinuumWeb` (`src/components/orchid/ContinuumWeb.tsx`)

| Rendered value | Actual source | Class |
| --- | --- | --- |
| Genus | `useDailyGenus()` | provider ✅ |
| Node counts and item lists (fungi, pollinators, climate, geography, conservation, cultivation, knowledge) | `OC-API /api/continuum/graph?genus=` | `OC-API` ✅ |
| Node relationship lines and detail paragraphs | `NODES` literal (`ContinuumWeb.tsx:40`) — taxon-independent, identical for every genus | `LOCAL-CONST` |
| Genus description line | Fixed string inside `fetchContinuumGraph` (`ocBackend.ts:181`) | `LOCAL-CONST` |
| **Empty-genus response** | `CATTLEYA_FALLBACK` (`ocBackend.ts:131`) — a complete invented payload: 14 fungal partnerships, 8 pollinator links, "21 countries · 1,202 records", "12 EN · 8 VU · 34 LC", "156 literature records", "OREP extractions" | `LOCAL-CONST`, fabricated (F3) |

### 4.5 `TheKnowledgeGraph`, `HabitatCards`

100% `LOCAL-CONST` and taxon-independent. `TheKnowledgeGraph` renders 9 nodes, 24 edges, and a
`DATA_SOURCES` panel advertising GBIF, iNaturalist, EOL, World Plants, BHL and "Literature"
(`TheKnowledgeGraph.tsx:167`). None of those sources is queried by the homepage, and none of the
24 edges corresponds to a record in the knowledge graph.

### 4.6 `OrchidGallery`

`SUPABASE-TABLE api.v_frontend_orchid_images`, limit 120, **not filtered to the featured genus**.
`habitatDescription` is composed in the frontend from the country field
(`"Documented orchid image record from {country}."`) — `LOCAL-DERIVED`.

### 4.7 Neighbour genera and pollinator guilds (`genusData.ts:1128-1511`)

Reached from Species-in-Focus lineage. This is the most severe path in the audit:

- `fetchInatPollinatorGuild()` requests `api.inaturalist.org/v1/taxa?q={genus}&rank=genus`, reads
  `wikipedia_summary`, and **regex-matches a pollinator guild out of the Wikipedia prose**
  (`POLLINATOR_PATTERNS`, `genusData.ts:1092`).
- `buildRelationshipSentence()` (`genusData.ts:1181`) then **writes an ecological claim in the
  frontend** from those two regex results, e.g.
  *"Where Catasetum courts euglossine bees, Gongora instead draws carrion & fruit flies —
  partitioning the pollinators they share in this habitat."*
- The sentence is then **written back into the shared Supabase `genus_photo_cache` table** as
  `ecological_relationship` (`genusData.ts:1495`), where it is re-served to every subsequent visitor
  on any device as if it were a stored record.

A regex over a Wikipedia summary is being promoted into a persisted, cross-device ecological
statement about a named pair of genera.

---

## 5. Findings, most severe first

**F1 — Cross-genus contamination.** `featuredGenusEntry()` (`featuredGenus.ts:85`) builds an entry for
any genus outside the curated set as `{ ...genusForToday(), genus: name }`. `genusForToday()` returns
`GENERA[new Date().getDay()]`. The resulting object carries **another genus's `ecology`, `regions`,
`description`, and `plates`** under the requested genus's name — and which genus is borrowed depends
on the day of the week. `fetchDailyGenus()` (`genusData.ts:2199`) has the identical defect.
`Phalaenopsis` is in the live 8-genus rotation and has no curated record, so this fires in production
every 8th window. `DailyGenusFeatureV5` compounds it: `lookupGenus(contextGenus) ?? featuredGenusEntry()`
falls back to an entry keyed off the **clock**, not off `contextGenus`, so a curator override to an
uncurated genus can display a third genus's ecology entirely.

**F2 — The curator override does not reach the visible panel.** `DailyGenusFeatureV3` — the component
that renders the hero image, the species grid, and the caption — calls `featuredGenusEntry()` directly
and never consumes `useDailyGenus()`. `HomeAtlas`, `ContinuumWeb`, and `DailyGenusFeatureV5` do consume
it. Setting a `daily_genus_snapshot` row therefore moves the map, the web, and the V5 wrapper to the new
genus while the hero panel keeps showing the clock genus.

**F3 — A fabricated graph payload ships in the bundle.** `CATTLEYA_FALLBACK` (`ocBackend.ts:131`) contains
invented counts, invented country totals, invented IUCN breakdowns, and invented literature counts. It is
returned whenever `fetchContinuumGraph` is called with an empty genus. `isFallback: true` is set, but no
caller renders that flag differently.

**F4 — Direct third-party requests, contradicting the stated architecture.** `genusData.ts:313-317` states
"the frontend NEVER talks to iNaturalist, GBIF, or any other external API directly". Seven call sites do
exactly that (`genusData.ts` ×3 paths, `DailyGenusFeatureV3.tsx:194`). Two of them are not fallbacks:
`fetchInaturalistSpeciesBatch` and `fetchInatPollinatorGuild` run on the normal path.

**F5 — Frontend-authored science.** Three functions compose scientific prose in the browser:
`buildLocalNarrative()`, `speciesCaption()`, and `buildRelationshipSentence()`. Their output is
indistinguishable in the UI from backend-supplied text, and `buildRelationshipSentence()`'s output is
persisted for other users.

**F6 — Hardcoded statistics presented as measurements.** `462` mycorrhizal associations and `744` genera
render identically whether measured or compiled in. `580,000+` occurrence records and `all 30,000 species`
in `CapabilityGrid` have no data source at all.

**F7 — Phenology is entirely fictional.** The flowering-through-time chart is a literal per-genus month
array with a generic `[2,3,4,5,8,9]` default. There is no phenology endpoint anywhere in the codebase.

**F8 — Error, empty, and fallback collapse into one state.** Only `genusMediaResolver`
(`ok | no_approved_media | invalid_genus | service_error`) and `knowledgeGraph`
(`ok | not_found | unavailable | invalid`) distinguish them. Every other path returns `[]`, `null`, or a
constant on failure, so "the service is down" and "we have no record" look the same to a visitor.

**F9 — Dead continuity provider.** `HeroSpeciesProvider` has no producer and no consumer.

**F10 — Provenance is not carried.** Only `GenusMediaItem` carries `license`, `attribution`,
`source_record_url`. Every other scientific value on the page — ecology, occurrences, mycorrhizal
partners, conservation status, counts — arrives with no source, no scope label, and no date.

**F11 — Six origins, no arbitration.** Media can come from Calyx, the harvester, a Supabase view, a
Supabase edge cache, localStorage, or iNaturalist, and the resulting mix is never reconciled or labelled
beyond a single `ImageSource` tag that the public UI does not surface.

---

## 6. What the backend cannot supply today

Required relationship coverage vs. the endpoints the frontend actually knows about.

| Required | Endpoint that exists | Verdict |
| --- | --- | --- |
| **Taxonomy** — accepted name, authority, family, tribe | `OC-API /api/species/search`, `/api/species/{id}` | **Partial.** Species-level only. No genus-level record, no synonyms, no accepted-species count except `hub.species_count` on the graph route. |
| **Media + provenance** | `CALYX /api/media/genus/{genus}` | **Available.** The only endpoint carrying license, attribution, and source record URL. Genus-scoped only; no per-species media call with provenance. |
| **Occurrences** | `OC-API {base}/atlas/occurrences` | **Available but unused by the homepage,** which reads Supabase directly. Prefix disagreement with sibling routes (see §2). |
| **Geography** — countries, range statement | derivable from occurrences | **Gap.** No curated range or endemism statement; `regions` is a frontend literal. |
| **Habitat** | `OC-API /api/species/{id}.habitat` (free text) | **Partial.** Species-level free text only. No genus-level habitat, no controlled vocabulary. |
| **Elevation** | *none* | **Gap.** No endpoint anywhere in the codebase. 100% `LOCAL-CONST`. |
| **Phenology / flowering** | *none* | **Gap.** No endpoint anywhere. 100% `LOCAL-CONST` with a generic default. |
| **Pollinators** | `OC-API /api/continuum/graph` → `nodes.pollinators` | **Insufficient.** Count and unlabelled item strings only. No taxon identity, no evidence, no citation, no scope. Current pollinator text on the page is a Wikipedia regex. |
| **Mycorrhizae** | `OC-API /api/mycorrhizal/{taxonomy_id}`, `/api/mycorrhizal/stats` | **Partial.** Species-level, keyed by taxonomy id; returns `fungal_taxon`, `family`, `type`, `note`. No genus-level rollup, no citation field, no method. |
| **Literature / evidence** | `OC-API /api/continuum/graph` → `nodes.knowledge` (count) | **Gap.** No citations, no DOIs, no claim-to-source links. Nothing to render a reference from. |
| **Conservation** | `conservation_status` / `iucn_code` on the species dossier | **Partial.** A code with no assessment date, authority, criteria, or scope. |
| **Explicit unknown states** | `genusMediaResolver`, `knowledgeGraph` only | **Gap.** No shared convention. Everything else collapses error into empty. |

**Cannot be sourced from the backend at all today: elevation, phenology, literature/evidence,
genus-level geography, and pollinator identity with evidence.** Those five are exactly the fields the
homepage currently fills with frontend constants.

Also absent: any endpoint that returns the featured taxon as **one document**. Assembling the current
homepage requires at minimum 9 requests across 6 origins, and the frontend performs the joins.
