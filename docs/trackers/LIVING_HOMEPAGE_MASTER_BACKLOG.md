# Living Homepage Master Backlog

**Purpose:** This is the permanent tracker for the Orchid Continuum public homepage experience. It exists so the work does not disappear across chats, builds, screenshots, or deployments.

**Rule:** New ideas are welcome. They are added here first, then either pulled into the current build or left in the backlog. Nothing is marked complete until it is verified after deployment.

**Status key**

- 🔴 Not started
- 🟡 In progress / partially working
- 🔵 Needs revision after review
- ✅ Complete / verified
- ⏸ Deferred intentionally

---

## Current priority: stop screenshot-driven development

The immediate goal is to make the homepage reviewable by checklist instead of requiring dozens of screenshots after every deployment.

---

## A. Critical blockers

| Status | ID | Item | Notes |
|---|---:|---|---|
| 🔴 | A1 | Fix Genus of the Day / Featured Genus image pipeline | No more `IMAGE PENDING` for species where usable images exist. |
| 🔴 | A2 | Restore real hero orchid image above the fold | The first screen should show an orchid, not mostly logo/typography. |
| 🔴 | A3 | Remove or rewrite public placeholder/instructional copy | Anything that reads like internal instructions must be removed from public view. |
| 🔴 | A4 | Make every major homepage section fit one viewport | Must work on desktop, iPad, and iPhone. No section should require scrolling just to understand one idea. |
| 🔴 | A5 | Create a public-facing Mission Control access explanation | Footer link exists, but access pathway is not clear. |

---

## B. Hero and first impression

| Status | ID | Item | Notes |
|---|---:|---|---|
| 🔴 | B1 | Reduce logo dominance | Logo belongs in header/upper-left as institutional identity, not as main visual. |
| 🔴 | B2 | Use Featured Genus species image as hero visual | Museum-quality orchid photo should carry the emotional opening. |
| 🔴 | B3 | Hero caption changes with active species | Species name, location, relationship hint, and story should update together. |
| 🔴 | B4 | Hero CTA points to Featured Genus experience | Button language should match current structure: Featured Genus / Today’s Genus. |
| 🔴 | B5 | Above-the-fold experience is visually complete | Headline, image, caption, and primary actions visible together. |

---

## C. Featured Genus engine

| Status | ID | Item | Notes |
|---|---:|---|---|
| 🟡 | C1 | Maintain Featured Genus 12-hour cadence | Existing text states this, but behavior needs verification. |
| 🔴 | C2 | Rotate species within Featured Genus | Target cadence: about 45 seconds, adjustable if performance requires. |
| 🔴 | C3 | Rotate 3×3 grid as species pass through hero slot | One species moves into hero, new species enters grid. |
| 🔴 | C4 | Archive previous Featured Genera | Visitors should be able to browse past genera. |
| 🔴 | C5 | Make all genus/species cards clickable | Cards should lead to genus/species pages or dossiers. |
| 🔴 | C6 | Remove species that do not belong to active genus unless explicitly labeled | Example: Vanilla should not appear inside Phalaenopsis grid unless part of a deliberate comparison. |

---

## D. Images and media

| Status | ID | Item | Notes |
|---|---:|---|---|
| 🔴 | D1 | Inspect frontend image parsing/filtering | Determine whether image URLs are missing, rejected, or malformed. |
| 🔴 | D2 | Inspect backend image endpoint payload | Verify response shape for Featured Genus images. |
| 🔴 | D3 | Permit trusted backend image URLs | Avoid over-filtering valid orchid images. |
| 🔴 | D4 | Exclude herbarium/specimen/plate/document images from hero unless intentionally shown | Public hero should prioritize living/studio/habitat photos. |
| 🔴 | D5 | Keep image attribution/source credit | Real images only; no AI orchid substitutes. |
| 🔴 | D6 | Add graceful fallback only when no real image exists | Fallback should say why image is unavailable, not dominate the experience. |

---

## E. Story and redundancy control

| Status | ID | Item | Notes |
|---|---:|---|---|
| 🔴 | E1 | Reduce homepage length by removing repetition | Current page repeats relationships/connections in multiple sections. |
| 🔴 | E2 | Reorder homepage into one story | Wonder → Featured Genus → Relationships → Why Continuum Exists → Atlas/Explore → Conservation → Participation. |
| 🔴 | E3 | Each section answers one distinct question | No repeated thesis paragraphs. |
| 🔴 | E4 | Convert explanatory walls into visual demonstrations | Demonstrate, do not over-explain. |
| 🔴 | E5 | Shorten section copy by about 40–60% | Especially on public homepage. |
| 🔴 | E6 | Add “learn more” links instead of putting everything on homepage | Deeper details belong on dedicated pages. |

---

## F. Knowledge graph / relationship section

| Status | ID | Item | Notes |
|---|---:|---|---|
| 🟡 | F1 | Keep knowledge graph visual | Strong section; needs refinement, not removal. |
| 🔴 | F2 | Fix overlapping graph text labels | Labels are currently overlapping in graph area. |
| 🔴 | F3 | Replace placeholder relationship cards with real data where available | Avoid “data needed” if data exists elsewhere. |
| 🔴 | F4 | Make graph spokes behave as entry points | Pollinators, fungi, habitat, climate, literature, conservation. |
| 🔴 | F5 | Relationship section updates with active species inside Featured Genus | Where data exists. |
| 🔴 | F6 | Show a compact “what this empowers” explanation | The graph should teach what connected data allows, not just display nodes. |

---

## G. Pollinators

| Status | ID | Item | Notes |
|---|---:|---|---|
| 🔴 | G1 | Add pollinator section/portal preview | Pollinators deserve a distinct public pathway. |
| 🔴 | G2 | Show pollinator photographs when available | EOL and other sources may support this. |
| 🔴 | G3 | Add pollinator distribution map concept | Include migration when relevant. |
| 🔴 | G4 | Connect pollinators to orchid species and genera | Show known/possible associations with evidence status. |
| 🔴 | G5 | Include literature/video links when available | Deeper content belongs in dossier pages. |

---

## H. Mycorrhizal fungi

| Status | ID | Item | Notes |
|---|---:|---|---|
| 🔴 | H1 | Make fungi section useful beyond names | Fungal associates are organisms and evidence nodes. |
| 🔴 | H2 | Show fungal photos/fruiting bodies where available | Especially basidiomycetes where images exist. |
| 🔴 | H3 | Include microscopic/peloton imagery where available | Explain orchid root cell fungal coils. |
| 🔴 | H4 | Add fungal distribution map concept | Overlay with orchid occurrence where possible. |
| 🔴 | H5 | Show associated orchids and other ecological associations | Fungi connect to more than orchids. |
| 🔴 | H6 | Link literature and research gaps | Important for researchers such as mycorrhizal specialists. |

---

## I. Habitat

| Status | ID | Item | Notes |
|---|---:|---|---|
| 🔵 | I1 | Reduce generic habitat cards on homepage | Six large cards are too much for landing page. |
| 🔴 | I2 | Make habitat species-aware where possible | Genus may span many habitats; active species should drive card detail. |
| 🔴 | I3 | Add “Explore all habitats” link/page | Deeper habitat cards belong on dedicated pages. |
| 🔴 | I4 | Connect habitat to elevation, rainfall, temperature, host/substrate, neighbors | Evidence-card model. |

---

## J. Atlas and thematic maps

| Status | ID | Item | Notes |
|---|---:|---|---|
| 🔵 | J1 | Replace homepage Atlas control panel | Current GIS-style controls are too heavy for public homepage. |
| 🔴 | J2 | Create homepage Atlas thematic controls | Flowering now, pollinators, mycorrhiza, habitat, elevation, climate, conservation, knowledge gaps. |
| 🔴 | J3 | Keep full Atlas workspace separate | Advanced controls belong in research workspace. |
| 🔴 | J4 | Improve basemap quality/labels | Current map labels are distracting; evaluate better basemap options. |
| 🔴 | J5 | Add flowering-through-time concept | Use date-stamped images/records to show seasonal flowering around the world. |
| 🔴 | J6 | Add conservation projects / hotspots / data gaps as future thematic layers | For grant/research use. |

---

## K. Calyx public guide

| Status | ID | Item | Notes |
|---|---:|---|---|
| 🔵 | K1 | Rewrite Calyx section so it does not read like instructions | Current section feels too much like documentation. |
| 🟡 | K2 | Keep Calyx unobtrusive | Public guide added; needs tone refinement. |
| 🔴 | K3 | Build native Ask Calyx interface | No third-party Tawk.to-style overlay. |
| 🔴 | K4 | Make Calyx page-context aware | If user is viewing Featured Genus, Calyx knows it. |
| 🔴 | K5 | Separate Public Calyx from Mission Control Calyx | Public guide vs owner/operator. |

---

## L. Mission Control

| Status | ID | Item | Notes |
|---|---:|---|---|
| 🟡 | L1 | Mission Control discoverable in footer | Added in BUILD-038; verify usability. |
| 🔴 | L2 | Mission Control access flow clear to owner | Explain login/admin/permissions. |
| 🔴 | L3 | Mission Control not exposed as public capability | Public can see link only if appropriate; sensitive controls require permissions. |
| 🔴 | L4 | Mission Control includes Calyx chat/operator interface | Future build. |
| 🔴 | L5 | Mission Control shows jobs, builds, governance, runner state, approvals | Future build. |

---

## M. Responsive layout / viewport integrity

| Status | ID | Item | Notes |
|---|---:|---|---|
| 🔴 | M1 | Define section viewport rule in CSS/design docs | Major section should fit within one viewport where practical. |
| 🔴 | M2 | iPad layout review | User is reviewing on iPad; must work well there. |
| 🔴 | M3 | Desktop layout review | No giant cut-off sections. |
| 🔴 | M4 | iPhone layout review | Condense sections without losing story. |
| 🔴 | M5 | Reduce top/bottom padding and card heights | Current sections are too tall. |
| 🔴 | M6 | Move secondary content behind links/expanders | Avoid long full-screen panels. |

---

## N. Pages and navigation to recover / expose

| Status | ID | Item | Notes |
|---|---:|---|---|
| 🟡 | N1 | Glossary discoverable | Footer routes to Orchid University for now; may need real glossary page. |
| 🔴 | N2 | Partners page accessible and populated | User recalls partner page existed; verify route/content. |
| 🔴 | N3 | Habitat pages accessible | User does not see habitat pages. |
| 🔴 | N4 | Pollinator pages accessible | Needed as public/research path. |
| 🔴 | N5 | Mycorrhiza pages accessible | Needed as public/research path. |
| 🔴 | N6 | Featured Genus archive accessible | Future return value. |

---

## O. Build/review process

| Status | ID | Item | Notes |
|---|---:|---|---|
| ✅ | O1 | Create permanent master backlog tracker | Created as this file. |
| 🔴 | O2 | Each build updates this tracker | Completed items, changed items, new items. |
| 🔴 | O3 | Each build report references tracker IDs | Example: completed A1, M1, K1. |
| 🔴 | O4 | Deployment review checks tracker before screenshots | Screenshots become optional evidence, not the main workflow. |
| 🔴 | O5 | Preserve new ideas without derailing current work | Add ideas to backlog first; pull into current build only if needed. |

---

## Next recommended build

**BUILD-039 — Homepage Triage: Images, Layout, Public Copy**

Target tracker items:

- A1, A2, A3, A4, A5
- D1, D2, D3, D6
- K1
- M1–M6
- O2–O4

This should be a focused repair build, not a new feature build.
