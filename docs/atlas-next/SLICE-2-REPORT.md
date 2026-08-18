# Living Atlas — Slice 2 report

**Status: candidate for owner review. Nothing is deployed. `/atlas` is untouched.**

---

## 1. Atlas branch and commit

`feat/atlas-next-living-atlas`, continuing directly from Slice 1.

| commit | what it does |
|---|---|
| `e11d3e3` | Fail closed on unresolved assessments; question engine; time state; knowledge-gap engine |
| `c4d3258` | Earth → Mapbox descent, configuration contract, regional layer registry |
| `6dedfb4` | Slice 2 surfaces added to the CI capture |
| `c92c543` | Draw ceiling raised — the gap view was truncating at 20,000 of 31,092 |

Slice 1's commits are unchanged beneath these.

## 2. Backend safety branch and PR

**`jsp1440/orchid-conservatory` → PR #13 (draft), branch `claude/atlas-locality-protection`, commit `5c9707a`.**

Nothing applied. No production data mutated. Sections 1–2 of the migration are
additive; section 3 is commented out because it revokes anonymous read on the
base table and would break every consumer still pointed at it, including the
current frontend.

The same SQL is kept in this repo at
`docs/atlas-next/proposed/20260818_atlas_occurrences_locality_protection.sql`
so the Atlas branch carries the reason its frontend fails closed.

## 3. Candidate route

`/atlas-next`, unchanged. `/atlas`, `/atlas/:species` and `/atlas/ecuador` still
resolve to the existing Atlas page.

---

## 4. Earth → Mapbox transition

**Implemented. Contract-complete; unverified against a real token, because none exists.**

| Rung | Engine |
|---|---|
| Earth, World, Continent, Country | `three-globe` |
| State / Province, Landscape, Locality | Mapbox GL JS |

One engine is mounted at a time. Both at once would double the GPU cost and let
a stale camera show through the seam. The handover carries the camera position,
the selection, the active question, and the same sensitivity policy — a mark is
drawn regionally exactly where the globe would have drawn it, generalised or not.

`mapbox-gl` is 1.86 MB and is dynamically imported, so it lands in its own chunk
and costs nothing until somebody descends. The Atlas entry chunk is unchanged.

**Verified both ways locally:**

- With no token: the descent holds on the globe, the regional component is not
  mounted, and the interface names the missing variable. It does not degrade to
  a broken map.
- With a placeholder `pk.` token: the regional engine mounts, `mapbox-gl` loads,
  the style request is attempted, and the component degrades to a stated
  *Unavailable* — the correct behaviour for a token that cannot authenticate.

What that leaves unproven: tiles, terrain, and the visual continuity of the
handover, none of which can be exercised without a working token.

## 5. Mapbox environment configuration required

**One variable. Set it to the Mapbox key that already exists.**

```
VITE_MAPBOX_TOKEN=pk.…
```

- It **must** be a public `pk.*` token. The contract refuses an `sk.*` token
  outright — a browser bundle is public, so a secret token there is a credential
  leak, not a configuration choice.
- Because it is a `VITE_` variable it is embedded in the built bundle. That is
  normal for a `pk.*` token and makes **URL restrictions on the token mandatory**,
  configured in the Mapbox account against the Render origins.
- Optional: `VITE_MAPBOX_STYLE_URL` overrides the default
  `mapbox://styles/mapbox/dark-v11`, chosen to sit continuously beside the globe.
- Both are documented in `.env.example`. No token is hard-coded anywhere, and a
  scan of the built bundle confirms none is present.

Mapbox bills per map load; mounting only on descent keeps the cost proportional
to use. Mapbox error text quotes the failing URL including the token — it is
stripped before display, so a token cannot reach a screenshot or a bug report.

---

## 6. Thematic question architecture

`src/features/atlas-next/questions.ts`. A question is not a layer with a nicer
name: a layer says "here is some data", a question commits to what would count
as an answer. Each carries:

| Field | Purpose |
|---|---|
| `id`, `title`, `question` | Identity, and the question a person would actually ask |
| `requires[]` | Evidence, each marked `required` or `enriching`, with notes |
| `presentation` | `records` · `record-tally` · `evidence-coverage` · `surface` — each a different kind of claim |
| `scales[]` | Rungs at which the question means anything |
| `time` | `none` · `occurrence-year` · `event-date` · `flowering-season` · `environmental-series` |
| `strongestClaim` | The strongest evidence state it may **ever** assert |
| `provenance` | `per-record` · `per-relationship-citation` · `external-dataset` |
| `calyxContribution[]` | Keys it contributes to AtlasContext |
| `implemented`, `blockedBy` | Built or not, and why not |

**Availability is resolved at runtime** against the records in view, not asserted.
A question can be fully built and still honestly unavailable here — the interface
reports *"2 of 12 questions can be answered from what the graph holds here"* and
each disabled question states its blocker.

Twelve questions are declared. Two are implemented.

One is **withheld rather than merely unbuilt**: *"What has changed through time?"*
Collection years measure collecting effort, not orchids. A decline in records
between decades is a fact about botanists, and presenting it as change on the
ground would be the single most misleading thing this Atlas could do.

## 7. "What is not known here?" — result

Implemented, and it is the view Slice 2 exists for. **Against the live store it
reports this:**

| Across the whole Atlas | |
|---|---|
| Occurrence records | 31,092 |
| Species named | 2,611 |
| Countries | 134 |
| Records reaching a **documented fungal partner** | **240** — 0.77% |
| Records naming a **pollinator** | **372** — 1.2% |
| Records belonging to names with **no conservation assessment** | **30,720** — 98.8% |
| Withheld because the species is assessed as threatened | 197 |
| Drawn as areas because the source itself was imprecise | 7,878 |
| Drawn as areas in total | 31,001 |

Two things follow from that table, and both belong in front of the owner.

**The map is almost entirely the bottom tier.** 30,480 of 31,092 records are
coordinates and a name, with no habitat, no elevation, and no documented
relationship. That is the Continuum's honest picture of orchid science, and it is
the single most interesting thing this Atlas can show.

**The fail-closed precaution now applies to 98.8% of records**, so nearly every
mark is drawn as an area. That is the correct posture given nine assessed species
— and it is also the strongest possible argument for the first Slice 3
recommendation. The precaution is doing real work; it should not have to do this
much of it.

Three tiers, each phrased as **what is known first, then what is not**, so no
label can be read as an absence claim on its own:

| Tier | Known | Not |
|---|---|---|
| Relationship documented | Observed here, with a documented relationship | — |
| Context, no relationship | Observed here, with habitat or elevation recorded | No pollinator and no fungal partner linked in the Continuum |
| Occurrence only | Observed here | Coordinates and a name, and little else |

Under the legend, permanently: *"Every orchid depends on a fungus. Nothing is
linked here yet — that is a gap in the literature we hold, not a gap in the
orchid."*

Three tiers, not a rainbow, and not a score out of ten. A single number would let
a viewer read "0.7 known" as a quantity and let two very different gaps cancel
each other out.

The panel adds computed sentences — every one a statement about the **archive**:

> No fungal partner is linked for any of these 1,019 records. Every orchid has
> one; nobody has published one into the Continuum for these.
>
> The most recent collection here was 1972. Nobody has recorded since — which
> measures collecting effort, not whether the orchid is still there.

Tests hold the line: an undated pile of records is never called historical, and
no sentence may contain *extinct*, *extirpated*, *disappeared* or *no longer*.

## 8. AtlasContext schema

Version 2. Inspectable live in the interface. **Not wired to any conversation.**

```
{
  version: 2, route, accessLevel,
  scale, mapMode,                    // 'globe' | 'regional'
  activeQuestion, question,
  view:    { lat, lng, distance },
  bounds:  { north, south, east, west } | null,   // from DISPLAYED positions
  timeState: { mode, yearMin?, yearMax?, description },
  visible:  { records, species, countries, protectedRecords, impreciseRecords },
  filters:  { genus, country },
  selection: { occurrenceId, name, evidence{field:state},
               recordedFields, totalFields,
               localityGeneralised, localityNotice } | null,
  visibleEvidence: { occurrence, pollinator, mycorrhizal,
                     environmental, conservation },     // states, not values
  knowledgeGap: { tier, records, withFungalPartner, withPollinator,
                  withHabitat, withElevation, withYear, historicalOnly,
                  mostRecentYear, undated, weakProvenance, imprecise,
                  unassessed, species },
  provenanceRefs: [ source datasets ],
  localitySensitivity: { withheldThreatened, withheldUnresolved,
                         impreciseAtSource, policy },
  coordinateUncertainty: { stated, notStated, maxMetres },
  questions: [ { id, question, availability, reason, strongestClaim } ],
  guardrails: [ … ]
}
```

Two properties are load-bearing. **`bounds` is computed from displayed positions**,
so a withheld site cannot be recovered by reading the extent back out of the
context. And every dimension rolls up to `unknown` unless something in view
actually supports a stronger state — never a stronger state by default.

Guardrails shipped in the object, verbatim, now include:

- A field with nothing in it is a gap in what has been collected and published. It is never evidence that the orchid lacks the thing.
- Every orchid depends on a mycorrhizal fungus. "No fungal partner linked" describes the literature the Continuum holds, never the plant.
- A collection year measures when somebody was there with a notebook. Fewer recent records means less recent collecting, not fewer orchids.
- A relationship documented for a species was documented from a study somewhere. It was not measured at the site being looked at.
- Where a coordinate is withheld because no conservation assessment could be reached, say that it is a precaution about what is unknown — not that the species is threatened.
- …plus the six carried forward from Slice 1.

## 9. Guided investigation

`src/features/atlas-next/investigation.ts` + `GuidePanel.tsx`. Not a tour and not
a chatbot: a tour is a slideshow with a map behind it, and a chatbot will say
anything.

Shape: **QUESTION → MAP ACTION → OBSERVATION → EVIDENCE → NEXT QUESTION.**

The one implemented investigation is *"What do we know about this orchid's
range?"*, and it runs on whatever is in view:

1. **What do we know about this range?** — counts records, species, countries.
   *"Each mark is a record somebody made. The blank space between them is where
   nobody has looked, or where nobody has published what they found."*
2. **Are all these places equally well understood?** — switches the map to the
   knowledge-gap question. Following the guide *moves the Atlas*; it does not
   narrate over a still map.
3. **What is missing?** — the computed gap sentences.
4. **Why does that matter?** — the single interpretive step, and it interprets
   the archive, not the biology.
5. **Where would an answer come from?** — *"Somebody sequencing fungi from roots
   at one of these sites, and publishing it."*

**Every observation is computed, never authored.** A step whose observation cannot
be computed from real evidence does not render. That is what stops a guided
experience from becoming a narrated one, and it means the investigation improves
as the data does without anyone rewriting it. When live Calyx is connected it
writes the prose from the same AtlasContext; the structure does not change.

No invented fungal partner. No invented pollinator. No causal claim.

## 10. Time-state architecture

`src/features/atlas-next/time.ts`. Typed, wired into question definitions, and
deliberately not a temporal system yet.

- `TimeMode`: `all-time` (the default, and the only honest default) · `year-range` · `recent` · `historical`
- `TimeCompatibility` on every question: `none` · `occurrence-year` · `event-date` · `flowering-season` · `environmental-series`
- `RECENT_WINDOW_YEARS = 25`, documented as a **display convention, not a biological threshold**, and the interface always states the actual year beside the label.
- **Undated records are never excluded by a recency filter.** Absence of a date is not evidence of a date.

The rule the module exists to enforce: `atlas_occurrences` stores a collection
*year*. It tells you when somebody was standing there with a notebook. It cannot
become a flowering date, and a gap in years cannot become an extinction.

## 11. Locality protection — status

### What was found

Traced end to end. Three separate problems, and only the third is a frontend one.

**a. The governing standard exists and is not implemented.** Brain KO-0029
"Atlas Public Display Rules" is *Active* and requires that sensitive location
detail be removed or generalised, naming the fields to carry it. The live
`atlas_occurrences` table has none of them.

**b. The frontend cannot enforce anything.** RLS grants `anon` unrestricted
SELECT on the base table, and the anon key ships in the browser bundle. Frontend
generalisation protects what the Atlas *draws* and nothing about what the
endpoint *returns*.

**c. There is almost nothing to consult.** Measured on the live store:

| | |
|---|---|
| occurrence rows | 31,073 |
| distinct names among them | 2,611 |
| rows carrying `species_id` | **353 (1.1%)** |
| `iucn_code` on the occurrence table | **absent** |
| `species` reference table | **9 rows** |
| sampled rows resolving to any assessment | **5.5%** |

*Dracula vampira* (VU) returns six-decimal coordinates to an anonymous caller
while stating 31,451 m of uncertainty — wrong in both directions at once.

### What was changed here

`assessmentResolved` now travels on every occurrence and records whether a lookup
actually **reached** an assessment. Where it did not, the public Atlas
generalises to a precautionary cell (`UNRESOLVED_FLOOR_DEG`, ≈5.5 km) and says
so — as a precaution about what is unknown, explicitly **not** a claim that the
species is threatened.

Three reasons for a coarsened coordinate stay distinct because they mean
different things:

| Reason | Meaning |
|---|---|
| `iucn-threatened` / `conservation-status` | A site the Atlas could publish and chooses not to |
| `coordinate-uncertainty` | A record that was never precise. **Nothing withheld.** |
| `unresolved-assessment` | Nobody has assessed this name. Precaution. |

Free-text locality follows the **withholding decision**, not the coordinate
reason. Research access sees through threat protection and the precaution, and
**never** through a record's own stated uncertainty — no authorisation makes an
observation more precise than it was made.

13 regression tests pin this, including the case that still escapes.

### What remains open

The reference data. Nine assessed species against 2,611 names is the underlying
problem and no schema change closes it. The migration makes the *absence* of an
assessment safe rather than silent; populating `species`, or attaching
assessments at ingest, is the actual remedy.

Stage 3 of the migration is breaking and must not run before consumers move to
the view.

## 12. Capability matrix

Fifteen extension points are declared in `mapboxConfig.ts` as one registry, so
the interface and this table cannot drift apart.

| Layer | Readiness | Candidate source |
|---|---|---|
| Terrain / elevation | **READY NOW** | Mapbox Terrain-DEM v1 |
| Hillshade | **READY NOW** | mapbox-terrain-rgb |
| Habitat / land cover | **BACKEND CONTRACT REQUIRED** | ESA WorldCover + a controlled habitat vocabulary |
| Hydrology | EXTERNAL DATA REQUIRED | HydroSHEDS / HydroRIVERS |
| Geology / lithology | EXTERNAL DATA REQUIRED | GLiM, or national surveys |
| Soils | EXTERNAL DATA REQUIRED | SoilGrids 250m |
| Temperature | EXTERNAL DATA REQUIRED | WorldClim 2.1 / CHELSA |
| Precipitation | EXTERNAL DATA REQUIRED | WorldClim 2.1 / CHELSA |
| Weather | EXTERNAL DATA REQUIRED | any forecast API |
| Fire history | EXTERNAL DATA REQUIRED | MODIS / VIIRS, via Earth Engine |
| Disturbance | EXTERNAL DATA REQUIRED | Hansen Global Forest Change |
| Protected areas | EXTERNAL DATA REQUIRED | WDPA (redistribution terms to check) |
| Land-use change | EXTERNAL DATA REQUIRED | Hansen / ESA CCI |
| Climate envelope | **SCIENTIFIC MODEL REQUIRED** | — |
| Humidity | **NOT CURRENTLY SUPPORTABLE** | — |

Changes since Slice 1, from the live probe:

- **Habitat / biome moved to BACKEND CONTRACT REQUIRED, and the blocker is ours.**
  `biome` is populated on **zero** of 31,073 rows. Habitat remains free text.
- **Occurrence data: still READY NOW**, but `species_id` coverage is 1.1%, which
  reclassifies every question depending on species linkage.
- **Conservation: downgraded.** Nine assessed species is not partial coverage of
  2,611 names; it is a reference table that has not been populated.
- Humidity stays NOT CURRENTLY SUPPORTABLE: gridded humidity is free-air at
  coarse resolution, and what governs an epiphyte is canopy microclimate.
  Drawing one as the other would be a fabrication with a respectable source.

A test holds that only terrain and hillshade may claim READY NOW.

## 13. Screenshots

`SCREENSHOTS_PLACEHOLDER`

## 14. Tests and build

| Check | Result |
|---|---|
| Full frontend suite | **389 tests, 52 files, all passing** |
| Tests in the Atlas feature | 72 (was 44 at end of Slice 1) |
| New in Slice 2 | 28 — fail-closed 13, knowledge-gap 11, Mapbox contract 4 |
| Production build | Passes. `mapbox-gl` in its own lazy chunk; Atlas entry unchanged |
| ESLint on changed files | 0 errors, 0 warnings |
| `git diff --check` | Clean |
| TypeScript | Pre-existing project errors **110 → 98**; none in any file this slice touches |

The typecheck improvement is a side effect worth naming: the project had no
`src/vite-env.d.ts`, so every `import.meta.env` read was a type error. Adding it
fixed four pre-existing errors along with the new Mapbox configuration.

## 15. Remaining scientific and data blockers

1. **The conservation reference table.** Nine rows against 2,611 names. Everything
   about locality protection, and the whole conservation question, rests on this.
2. **`biome` is empty on every row**, and `habitat` is uncontrolled free text.
   Habitat cannot be aggregated without inventing a classification.
3. **`species_id` on 1.1% of rows.** Any question that needs species-level
   linkage is effectively unlinked.
4. **No event date.** Only a collection year, which cannot support phenology.
5. **Pollinator and mycorrhizal coverage** is small and carries no per-record
   provenance.
6. **Anonymous read on the base table** — the P0, open until PR #13 stage 3.
7. **The complete occurrence load takes four to five minutes.** Carried from
   Slice 1 and still unaddressed; the partial-read notice makes it honest, not fast.
8. **CI capture cost.** Each viewport reloads and pays that load again, which
   overran a 25-minute step budget. Narrowest viewport now runs first, and the
   ceiling is 45 minutes — but this is a symptom of blocker 7, not a separate one.

## 16. Recommended Slice 3

1. **Populate the conservation reference table, or attach assessments at ingest.**
   Not glamorous, and it unblocks more than any rendering work. The live numbers
   make the case better than argument does: **30,720 of 31,092 records — 98.8% —
   belong to names the Continuum holds no assessment for**, so the precautionary
   generalisation now applies to almost the entire Atlas. It is working exactly as
   designed, and it should not have to work this hard.
2. **Move consumers onto `atlas_occurrences_public` and complete PR #13.** The
   Atlas is the only consumer I can see; this is a small change and it closes the
   P0 properly.
3. **Terrain, once a token exists.** It is the only READY NOW environmental layer,
   the regional engine is built for it, and elevation is the one environmental
   variable the Continuum already holds per record. This is the honest version of
   "What changes with elevation?" and it needs no new dataset.
4. **A spatial query window instead of loading everything.** Four minutes to
   first complete paint will not survive a live demonstration on hotel wifi.

Explicitly **not** recommended for Slice 3: phenology (no event date), any
intersection framed as viability, and any climate layer — all three would need
data or modelling that does not exist yet, and two of them are easy to draw and
hard to draw honestly.

Live Calyx integration is ready architecturally — AtlasContext v2 carries what a
guide needs — but it should follow item 1, because a guide that can only say
"not recorded" is not yet worth the wiring.

## 17. First NAOCC demonstration

**Lead with the gap, not the globe.**

Every orchid map shows dots. The Continuum is the only one that can show *the
shape of what nobody knows*, and it can do that today with no new data.

Suggested five minutes:

1. **Earth.** 31,092 records, 2,611 species. Let it turn. Say nothing about
   completeness yet.
2. **Descend to Colombia** — 5,507 records, 682 species, the cordilleras legible
   in the point pattern with nothing smoothed or interpolated.
3. **Switch the question to "What is not known here?"** The map recolours. Most of
   it is the bottom tier.
4. **Read the line under the legend aloud**: *"Every orchid depends on a fungus.
   Nothing is linked here yet — that is a gap in the literature we hold, not a
   gap in the orchid."*
5. **Open the guided investigation** and let it walk from range to gap to what an
   answer would require: somebody sequencing fungi from roots at one of these
   sites, and publishing it.

That sequence is honest, it needs no token and no new dataset, and it ends on the
research need rather than on a product claim — which is the right note for that
audience.

**Two things to prepare beforehand:** load the Atlas before the session, because
the complete set takes four to five minutes to arrive; and be ready to say
plainly that **98.8%** of records currently have no conservation assessment,
because somebody in that room will ask, and the answer is better volunteered than
extracted. (The read-only probe put it at 94.5% from a sample; 98.8% is the
complete count the Atlas itself computes and displays, so it is the number to
quote — it is the one on the screen.)
