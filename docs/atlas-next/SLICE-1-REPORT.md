# Living Atlas — Slice 1 reconciliation report

**Status: candidate for owner review. Nothing is deployed. `/atlas` is untouched.**

---

## 1. Branch

`feat/atlas-next-living-atlas`, cut clean from `origin/main` at `e4ae876`.

## 2. Commit

Head at the time of writing: `SHA_PLACEHOLDER`.

| commit | what it does |
|---|---|
| `c0321ed` | Evidence vocabulary, locality protection, scale ladder, contract extension |
| `00ace0e` | The candidate Atlas at `/atlas-next` |
| `86389bf` | CI evidence capture |
| `5f8ed42` | Camera centring and real-time easing fixes |
| `baf1430` | Interaction fixes — stale handlers, drag detection, iPad card |
| `36cc43c` | Conservation-status linkage (safety fix) |

## 3. Candidate route

`/atlas-next`. Registered in `src/App.tsx` as a lazy route, so three.js is code-split
and never enters the main bundle. `/atlas`, `/atlas/:species` and `/atlas/ecuador`
are unchanged and still resolve to the existing `Atlas` page.

---

## 4. What was reused from the Orchid Bloom Globe

| Taken | Where it lives now | Why it was worth keeping |
|---|---|---|
| Rotate-the-globe camera model (`rotY`/`rotX`/`distance` on the globe, camera fixed on +Z) | `AtlasGlobe.tsx` | Simple, stable, and it makes the planet feel like an object you turn rather than a viewport you pan |
| Eased focus targets with shortest-path longitude wrap | `AtlasGlobe.tsx` | This is the single most valuable thing in the prototype. It is what makes descending a scale read as one continuous move instead of a cut, and it is exactly what a scale ladder needs |
| Drag-suppresses-click | `AtlasGlobe.tsx` | Without it every drag ends in an accidental selection |
| Star field and atmosphere | `AtlasGlobe.tsx` | Gives a fixed frame that makes rotation legible, and stops the globe reading as a flat disc |
| `three` + `three-globe` as the rendering base | `package.json` | See §12 |
| The instinct that the Atlas is a place, not a panel | Whole shell | The prototype's full-screen dark shell is right. It was the *contents* of the panel that were wrong |

## 5. What was reused from the canonical Atlas

Nothing was reimplemented. The candidate is a new presentation over the existing contracts.

| Contract | Used for |
|---|---|
| `fetchAtlasOccurrencePoints()` | The **only** source of marks. There is no second path |
| `AtlasOccurrencePoint` | Every field the record card shows |
| `didAtlasLoadFail()` | Distinguishing "unavailable" from "empty" |
| `canonicalSlug()` | The link from a record to its species page |
| `MycorrhizalRecord`, `PollinatorRecord` | Relationship evidence states |
| `species_mycorrhizal` linkage (by `species_id`, else exact binomial) | Fungal partner evidence, unchanged in rule |
| Supabase transport, caching, retry/backoff | Untouched |

**Additive changes to `orchidContinuum.ts`** — no existing consumer changes behaviour:

- `AtlasOccurrencePoint` gains `coordinateUncertaintyM`, `biome`, `acceptedName`,
  `sourceRecordId`. All four columns were already being selected by `ATLAS_COLUMNS`
  and then dropped. Locality protection needs the uncertainty figure.
- Conservation status now also resolves by exact canonical binomial (see §15).

## 6. What was rejected from the prototype

This is the part that mattered most, so it is itemised.

| Rejected | What it actually was | Why |
|---|---|---|
| `fetchGbif()` → `api.gbif.org` from the browser | Live third-party fetch as the canonical source | GBIF is upstream of the Continuum, not a substitute for it. Records must arrive through the graph that carries provenance, verification, and linkage |
| `PROXY = "https://corsproxy.io/?"` | A public CORS proxy in the data path | An anonymous third party between a scientific instrument and its data |
| `FALLBACK_OCCURRENCES` — 49 points labelled `"Orchidaceae sp."` | Hand-typed capital-city coordinates shown when GBIF failed | Presents a network failure as an orchid distribution |
| `CURATED_HOTSPOTS` — 80 points labelled `"Orchid biodiversity hotspot"` | Hand-typed coordinates **merged into live results on every render** (`[...CURATED_HOTSPOTS, ...liveOccurrences]`) and counted in the statistics bar | Not a fallback at all. These were always on screen and always in the counts. A visitor could not tell an invented point from a real record |
| `TOUR_STOPS` narration | Eight stops carrying figures — "over 4,000 species in Colombia alone", "29,000 species", "90% found nowhere else", "over 2,800 orchid species" | Unsourced quantitative claims presented as Continuum findings |
| `continentForCoords()` | Continent guessed from longitude bands and a hard-coded country-code set | Invents geography. The graph carries `country` and `region`; where it does not, the honest answer is that the scale is unavailable (§13) |
| `globeImageUrl` / `bumpImageUrl` → `unpkg.com` | Earth textures fetched from a public CDN at runtime | A third-party CDN in the render path of a scientific instrument |
| Raycasting into three-globe internals + `setTimeout(…, 50)` tagging via `__pointsObjs` | Picking that depended on undocumented internals and on points staying unmerged | Replaced with direct screen-space projection (§12) |
| The control panel — continent dropdown, elevation slider, month slider, dot toggle, rotate toggle | Five orthogonal switches with no question behind them | This is the GIS-dashboard shape the mission rules out |
| The species card's omit-what-is-missing layout | A record with four facts looked as complete as one with twelve | Replaced (§ record card) |
| The committed `.env` in the prototype archive | Supabase project id and publishable key in the zip | Not carried across in any form |

---

## 7–9. Screenshots

`SCREENSHOTS_PLACEHOLDER`

---

## 10. Mapbox — recommendation

**No Mapbox credential exists anywhere in this repository.** `.env.example` declares
only `VITE_CALYX_API_URL` and `VITE_RELEASE_SHA`; a repository-wide search for
`MAPBOX` finds two mentions in a control-panel spec document and no code. Slice 1
therefore introduces no Mapbox dependency and no credential.

**Recommended role: Mapbox owns the bottom of the ladder; the globe owns the top.**

A 3D globe stops paying its way below the continent rung. What it is good at —
planetary pattern, one continuous Earth, the sense of descent — is exactly what a
tiled 2D map is bad at. What a tiled map is good at — real terrain relief, rivers,
place names, streaming detail at zoom, accurate local projection — is what the
`state`, `landscape` and `locality` rungs are *for*, and reimplementing a tile
pipeline on three.js to get them would be the wrong kind of ambitious.

Concretely, for Slice 2 or later:

1. **Hand over on descent, not at load.** Keep `three-globe` for `earth` → `country`.
   Enter Mapbox GL JS at `state` and below. The handover must be visually
   continuous: carry centre, zoom and bearing across, cross-fade rather than cut,
   and keep the same marks with the same colours.
2. **Mount it lazily.** Mapbox bills per map load. A map instantiated on page load —
   or worse, embedded on the homepage — turns every visit into a billable event.
   Entering it only on descent keeps the cost proportional to actual use.
3. **What it should carry, in order of value to this Atlas:**
   - Terrain-DEM + hillshade. This is the strongest single argument for Mapbox: it
     makes the `landscape` rung mean something, and elevation is the one
     environmental variable the Continuum already holds per record.
   - Vector basemap in a dark cartographic style matched to the globe, so the two
     scales look like one instrument.
   - Raster/vector sources for environmental layers *when* those layers exist
     (§14) — not before.
   - `mapbox-gl-draw` for research-mode area selection, behind authentication.
4. **Credential handling.** Add `VITE_MAPBOX_TOKEN=` to `.env.example` as an empty
   key; read it from `import.meta.env`; never commit a value. Because it is a
   `VITE_` variable it is public in the built bundle by definition — that is normal
   for a Mapbox `pk.*` token, but it makes URL restrictions on the token
   **mandatory**, configured in the Mapbox account against the Render origins. If
   the token is absent, the descent must degrade to the globe with a stated reason,
   never to a broken map.
5. **Not recommended: Mapbox GL JS v3 globe projection as a replacement for
   three-globe.** It would work, and it would remove a dependency. It would also put
   a vendor basemap and a billable load in the render path at *every* scale
   including the first paint, and trade the current dark cartographic Earth — which
   reads as an instrument — for a styled consumer basemap. Revisit only if the
   maintenance cost of two renderers proves worse than that trade.

**MapLibre GL JS is a credible alternative** if vendor lock-in or billing is a
concern; the API is close enough that the handover layer could be written against
either. Mapbox is recommended for Slice 2 only because the credential already
exists and terrain is turnkey.

## 11. Google Earth / Google mapping — recommendation

**Do not integrate any Google mapping product in the client.**

Evaluated on unique contribution rather than availability:

- **Google Maps JS / Photorealistic 3D Tiles.** Visually strong, and genuinely
  unique in one respect — photogrammetric 3D of the built environment. That is the
  least relevant terrain this Atlas will ever show. It otherwise duplicates what
  Mapbox would already be doing, adds a second billing relationship and a second
  attribution requirement, and imposes a consumer-map aesthetic on a scientific
  instrument. No unique contribution to a spatial reasoning interface for orchids.
- **Google Earth (the app / KML embeds).** Offers no data the Continuum could
  ingest and no interaction model worth importing.
- **Google Earth Engine — the one exception worth keeping on the table.** GEE is
  not a map; it is a planetary raster analysis platform with Landsat and Sentinel
  archives, Hansen forest-loss, ESA land cover, JRC surface water and MODIS/VIIRS
  fire history already mounted. If the Atlas ever answers *"what is changing where
  it lives?"* (§13), GEE is the most direct defensible route to land-cover change
  over an occurrence's neighbourhood — and there is no comparable free alternative.

  **But it belongs in the backend, not the browser.** It needs a service account,
  it has attribution and licensing terms, and everything it returns is a *derived*
  raster that must be stored with provenance and rendered as `observed (remote
  sensing)` or `modeled` — never as "habitat". Recommendation: revisit GEE only
  when a specific thematic question requires it, and then as a Continuum ingestion
  pipeline whose outputs land in the graph like any other source.

## 12. three-globe — recommendation

**Keep it for Slice 2. Plan to outgrow it, and fix the duplication now.**

Measured payload:

| Module | Raw |
|---|---|
| `three/build/three.module.js` | 1.3 MB |
| `three-globe/dist/three-globe.mjs` | 216 KB |
| `world-atlas/countries-110m.json` | 108 KB |
| Resulting `/atlas-next` chunk | 1.73 MB · **502 KB gzip**, code-split |

three-globe is about 14% of the 3D payload, so removing it is not a size argument.
What it actually earns its place with is four things: the sphere and its
`globeMaterial` hook, the atmosphere shader, `polygonsData` (GeoJSON projected onto
the sphere — which also supplies the country geometry the ladder will want), and
`getCoords`, which is now shared between drawing and picking so the two can never
disagree. Everything else it ships — points, arcs, hex bins, rings, labels, tiles,
and the d3 data-join machinery behind them — is unused.

Three things to act on:

1. **It bundles its own copy of three.** The console reports *"Multiple instances of
   Three.js being imported."* That is a real duplication and a latent correctness
   hazard — `instanceof` checks across the two instances silently disagree. Worth
   attempting `resolve.dedupe: ['three']` in `vite.config.ts` in Slice 2 and
   verifying the globe still renders.
2. **The mark layer will not scale as written.** Each mark is currently its own
   `Mesh`, which is fine for the hundreds visible at a country and wrong for tens of
   thousands. Slice 2 should move to a single `InstancedMesh` plus a coarse spatial
   grid for picking. This is independent of three-globe.
3. **Reimplementation is cheap if it ever becomes worth it.** Sphere + atmosphere +
   GeoJSON-to-sphere is on the order of 150 lines. Do it only if the duplicated
   `three` cannot be deduped, since that is the real cost, not the 216 KB.

---

## 13. Thematic capability matrix

One question is implemented. The other six are declared in
`src/features/atlas-next/types.ts`, rendered struck through in the interface, and
each states its blocker on hover — because an unanswerable question is more honest
shown open than filled in.

| Question | State | Reads | Blocker |
|---|---|---|---|
| **Where does it live?** | **Implemented** | `lat`, `lng`, `country`, `region`, `locality`, `elevation_m`, `habitat`, `year` | — |
| What lives alongside it? | Declared | — | Computable today as co-occurrence, but co-occurrence is correlation. Needs a presentation that cannot be read as dependency before it ships |
| What feeds it before it can feed itself? | Declared | — | 15 literature-backed species records. Excellent quality, very small coverage. Needs its own coverage surface so the gap is the subject, not a blank |
| What pollinates it? | Declared | — | Sparse, unevenly attributed across datasets, and provenance is not held per record |
| When does it bloom? | Declared | — | `atlas_occurrences` stores `year`, not an event date. Occurrence year is not phenology. Needs a backend contract change |
| What is changing where it lives? | Declared | — | Requires external environmental and land-use datasets not yet contracted (§11, §14) |
| What is not known here? | Declared | — | Depends on the coverage model the modes above produce — but see §17: this is the cheapest and most distinctive of the six |

**Scale ladder.** Seven rungs are defined; which are *offered* is resolved at runtime
from the data, never asserted. A rung organised by a field the current selection
does not carry reports itself unavailable with the reason, instead of being faked
from a coordinate heuristic. In the smoke fixtures, records without a `region`
correctly close the Continent and State rungs and leave Earth / World / Country open.

---

## 14. Data gaps, classified

Categories as commissioned. "READY NOW" means the Continuum holds it and the Atlas
can render it honestly today.

| Category | Classification | Detail |
|---|---|---|
| Occurrence records | **READY NOW** | `atlas_occurrences` with coordinates, dataset, source record id, verification flag |
| Elevation (per record) | **PARTIAL** | `elevation_m` present but not on every row; no continuous surface |
| Topography (slope, aspect, relief) | **REQUIRES EXTERNAL DATASET** | DEM — Mapbox Terrain-DEM, Copernicus GLO-30, or SRTM |
| Hydrology | **REQUIRES EXTERNAL DATASET** | HydroSHEDS or equivalent |
| Geology / lithology | **REQUIRES EXTERNAL DATASET** | GLiM or national surveys. Caveat: the substrate that matters to an orchid is often micro-scale, and a global lithology layer will not answer it |
| Soils | **REQUIRES EXTERNAL DATASET** | SoilGrids. Same caveat, more sharply: an epiphyte never touches soil |
| Habitat / biome | **PARTIAL** + **REQUIRES NEW BACKEND CONTRACT** | `habitat` and `biome` exist as free text. Uncontrolled vocabulary cannot be aggregated or filtered reliably. Needs mapping to a controlled scheme (IUCN Habitats Classification, or WWF ecoregions) |
| Climate normals | **REQUIRES EXTERNAL DATASET** | WorldClim or CHELSA. `AtlasSpeciesRecord` carries only free-text `climateZone` / `climateNote` |
| Rainfall | **REQUIRES EXTERNAL DATASET** | As climate |
| Temperature | **REQUIRES EXTERNAL DATASET** | As climate |
| Humidity | **NOT CURRENTLY SUPPORTABLE** | Gridded humidity is free-air at coarse resolution. The humidity that governs an epiphyte is canopy microclimate. Rendering the former as the latter would be a fabrication with a respectable-looking source |
| Weather (current / forecast) | **REQUIRES EXTERNAL DATASET** — and questionable | Technically easy. Scientifically close to meaningless: today's weather at the coordinate of a 1975 herbarium sheet says nothing about the record. High risk of a beautiful empty layer |
| Phenology | **REQUIRES NEW BACKEND CONTRACT** | Needs event date, not just year. `species.traits.phenology` is free text for some species and is species-level, not observation-level |
| Pollinators | **PARTIAL** | `pollinator_data` on some occurrence rows, `species.pollinators` on some species. Coverage unmeasured; per-record provenance absent |
| Mycorrhizae | **PARTIAL** | 15 species records, all DOI-bearing. High confidence, low coverage |
| Host / substrate | **PARTIAL** + **REQUIRES NEW BACKEND CONTRACT** | `species.traits.substrate` and `growth_form` are species-level. Per-occurrence host tree identity does not exist |
| Conservation status | **PARTIAL** — and a safety issue | Held on `species`, not on `atlas_occurrences`. See §15 |
| Protected areas | **REQUIRES EXTERNAL DATASET** | WDPA. Note its redistribution terms need checking before any tiles are served |
| Fire / disturbance | **REQUIRES EXTERNAL DATASET** | MODIS/VIIRS active fire, or Hansen loss-year. The Google Earth Engine case (§11) |
| Land-use change | **REQUIRES EXTERNAL DATASET** | Hansen or ESA CCI. Also the GEE case |
| Historical records | **PARTIAL** | `year` and `source_dataset` are held. Collector, institution and full event date are not |
| Knowledge gaps | **READY NOW** (per record) / **PARTIAL** (aggregate) | Slice 1 already renders per-record coverage. The aggregate view needs no new data at all — only computation |
| Ecological intersections | **NOT CURRENTLY SUPPORTABLE as biology** | Co-occurrence is computable today and must be labelled `correlated`. Habitat viability is **REQUIRES SCIENTIFIC MODELING** — a species distribution model with its own validation and its own peer review, presented as a hypothesis and never as a finding |

---

## 15. Sensitive locality protection

Implemented in `src/features/atlas-next/sensitivity.ts`; 20 tests. Every rendering
path goes through it — there is no way to draw a mark that bypasses it.

**Rules in force**

- Threatened assessments (`CR`, `EN`, `VU`, by code or by spelled-out status)
  generalise the coordinate to a graticule cell: 1° for CR, 0.5° for EN, 0.25° for VU.
- Generalisation **snaps to the cell centre**. It never jitters. Jitter produces a
  plausible-looking coordinate that is simply false; a cell centre honestly means
  "somewhere in this square".
- The record's own `coordinate_uncertainty_m` coarsens the rendering independently
  of any threat assessment. Drawing a 30 km-uncertain record as a pin is a precision
  claim the source never made.
- **Free-text locality is withheld whenever threat protection applies.** A string
  like "2 km N of the village, on the ridge" defeats coordinate generalisation
  entirely. The card says the locality is withheld and why, rather than hiding the row.
- The current scale imposes a floor. Protection can only ever make a rendering
  coarser, never finer.
- Generalised records draw a ring at the real cell radius, so the viewer sees the
  size of the uncertainty rather than a false point.
- Aggregate cells carry a `containsProtected` flag without naming which record.
- `AtlasAccessLevel` is a parameter on every call. Slice 1 always passes `public`.
  Research access can see through *threat* protection — which exists to guard
  against collection — but **never** through the record's own coordinate
  uncertainty, because no authorisation makes an observation more precise than it
  was made.

**A real gap found, partly closed, and worth the owner's attention**

Conservation status is held on `species`. An `atlas_occurrences` row inherited it
only through `species_id` — and many ingested rows do not carry one. Because
locality protection keys off that assessment, **an unlinked occurrence of a
critically endangered orchid would have had its precise coordinate published with
no protection, looking identical to an unassessed record.**

Commit `36cc43c` narrows this: occurrences now also resolve an assessment by exact
canonical binomial, using the same conservative rule as the mycorrhizal index —
exact name, first match, nothing inferred, a congener resolves nothing.

It does not close it. **Any threatened species with no row in `species` at all
remains unprotected.** That needs a data fix, not a frontend one, and it is the
single highest-priority item in this report. The test suite pins both the fix and
the remaining hole so the hole stays visible.

---

## 16. Proposed `AtlasContext` for Calyx

Defined in `src/features/atlas-next/atlasContext.ts` and inspectable live in the
interface ("Show Atlas context"). **Not wired to any conversation in this slice.**

It is designed around one premise: a guide that cannot tell *"nobody has recorded
this"* from *"we could not reach the server"* will fabricate to fill the gap.

```
{
  version, route, accessLevel,
  scale, thematicMode, question,
  view:    { lat, lng, distance },
  visible: { records, species, countries, protectedRecords },
  filters: { genus, country },
  selection: {
    occurrenceId, name,
    evidence: { <field>: <evidence state> },   // states, not values
    recordedFields, totalFields,
    localityGeneralised, localityNotice
  },
  unimplementedModes: [{ mode, question, blockedBy }],
  guardrails: [...]
}
```

Three properties make it safe to hand to a language model:

1. **It carries evidence states, not just values.** `unknown` and `unavailable` are
   distinct and both reach the guide.
2. **It carries the locality policy in force**, so a guide cannot narrate a precise
   site the interface deliberately withheld.
3. **It names what is not built and why**, so the honest answer to "show me the
   pollinators" is "that mode is not built yet, and here is the blocker" rather
   than an improvised map.

The shipped guardrails, verbatim:

- Records shown together in one place are co-occurring. Do not describe that as one causing, supporting, or depending on the other.
- An aggregate cell is a count of records. It is not a range, a population, a density estimate, or a habitat boundary.
- Where a field is "not recorded", say so. Do not substitute general orchid biology for a missing record.
- Absence of records is sampling, not absence of the orchid.
- Never restate a precise locality for a record whose site has been generalised, and never estimate one.
- Do not describe any area as suitable, viable, or protected habitat; the Atlas holds no habitat model.

---

## 17. Recommended Slice 2

In priority order.

1. **Close the conservation-status gap at the data layer.** Backend work, not
   frontend. Until every threatened taxon in `atlas_occurrences` can resolve an
   assessment, locality protection has a hole in it. Everything else on this list
   can wait; this cannot.
2. **Make the mark layer scale.** `InstancedMesh` plus a coarse spatial grid for
   picking, and attempt `resolve.dedupe: ['three']`. Cheap, and it unblocks showing
   the full occurrence set rather than the current 4,000-record ceiling.
3. **The Mapbox handover below the country rung** — terrain and a real basemap at
   `state` / `landscape` / `locality`, entered on descent, credential via env, same
   marks and the same sensitivity policy, degrading to the globe if the token is
   absent.
4. **The second thematic question: "What is not known here?"**

   Recommended over any relationship mode, for three reasons. It needs **no new
   data** — coverage is computable from what the Continuum already holds, and Slice 1
   already renders the per-record version. It is the Continuum's most defensible
   claim, because a gap is a fact about the archive rather than a claim about
   biology. And it is the thing no other orchid map does: every competitor shows
   what is known, and none of them shows the shape of what is missing. Aggregated
   over the globe, it turns the Atlas from a distribution map into a research
   instrument.

Explicitly **not** recommended for Slice 2: any weather or climate layer, any
intersection framed as viability, and the full Atlas Tour.

## 18. First Calyx-guided Atlas Tour

**Recommendation: not a grand tour, and not a script.**

The prototype's tour was eight hand-written stops with unsourced figures. Repeating
that shape with better prose would repeat the error. The first Calyx tour should be
the opposite: short, generated from records, and honest about its own limits.

Proposed shape:

- **One genus, chosen at runtime by coverage, not editorially.** Score each genus by
  record count × fields populated × relationship links, and tour the winner. This
  makes it structurally impossible for the tour to drift away from what the graph
  actually supports, and it means the tour improves automatically as the data does.
- **Four or five stops, each derived from real records** — a country with a dense
  cluster, an elevation band, a record with an unusual attribute, a documented
  relationship if the genus has one.
- **Calyx narrates only from `AtlasContext`**, with the guardrails in §16 enforced.
  Every stop states its own evidence state on screen, so the narration can be
  checked against the record while it is being spoken.
- **The tour ends on a gap.** The final stop should be somewhere the graph is
  silent — a region with no records, or a relationship nobody has documented for
  this genus. That ending is the honest one, it is the one no other orchid atlas
  can give, and it converts a tour into an invitation.
- **No numbers Calyx cannot source from the context object.** If a figure is not in
  `AtlasContext`, it does not get said.

---

## Validation

| Check | Result |
|---|---|
| Production build (`npm run build`) | Passes. `/atlas-next` code-split to its own chunk; main bundle unchanged |
| Full frontend test suite (`npm test`) | 361 tests, 48 files, all passing |
| New tests in this slice | 44 (`sensitivity` 20, `evidence` 10, `scale` 8, `conservationLinkage` 6) |
| ESLint on all changed files | 0 errors, 0 warnings |
| `git diff --check` | Clean |
| TypeScript | The repository has no typecheck script and `tsc -p tsconfig.app.json` reports 110 pre-existing errors across unrelated files; **none in any file this slice touches**. The build gate is esbuild, as it was before |

**On the screenshots.** The development sandbox has no network egress to the
occurrence host, so any screenshot taken here would show either the "unavailable"
state or stubbed points — neither of which is evidence. Capture therefore runs on a
CI runner with real egress (`.github/workflows/atlas-next-evidence.yml`) against the
real store. Interaction behaviour at all three viewports was additionally verified
locally against stubbed records, which is stated as a smoke test and not offered as
evidence of data.
