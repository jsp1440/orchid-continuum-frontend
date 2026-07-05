# BUILD-039 — Homepage Triage: Images, Layout, Public Copy

## Objective

Repair the public homepage experience before adding new features. BUILD-039 focuses on the most visible blockers reported after BUILD-038 deployment:

- unnecessary `IMAGE PENDING` cards
- overly tall sections
- public copy that read like internal instructions
- unclear Mission Control access
- tracker-based review process

## Tracker source of truth

This build uses:

- `docs/trackers/LIVING_HOMEPAGE_MASTER_BACKLOG.md`

Future build reports should reference tracker IDs instead of relying on screenshot-heavy review.

## Implemented

### Image resolver fallback

Updated:

- `src/lib/publicImageSource.ts`

Changes:

- Keeps the approved OC image endpoint first: `/images/genus/{genus}`.
- If that endpoint is cold, empty, blocked, or returns no usable images, the resolver now falls through to the existing `fetchGenusImagesWithSource` path.
- That fallback already supports local cache, shared cache/proxy, and a guarded Plantae-only fallback.
- This should reduce unnecessary `IMAGE PENDING` placeholders without fabricating images.

Tracker IDs:

- A1
- D1
- D2
- D3
- D6

### Featured Genus layout tightening

Updated:

- `src/components/orchid/DailyGenusFeatureV5.tsx`

Changes:

- Tightened the wrapper around the Featured Genus section.
- Compressed Discovery Trails into compact doorway cards.
- Removed long public-facing explanatory copy from this wrapper.

Tracker IDs:

- A3
- A4
- E1
- E3
- E5
- M2
- M3
- M5
- M6

### Public Calyx copy revision

Updated:

- `src/components/orchid/PublicCalyxGuide.tsx`

Changes:

- Rewrote the section so it reads like a guide, not internal documentation.
- Reduced vertical height and shortened copy.
- Changed audience blocks into compact pathways: Grow, Learn, Research, Protect.
- Replaced `Ask Calyx interface coming online` with `Public Calyx chat is next`.

Tracker IDs:

- A3
- K1
- K2
- M5

### Mission Control footer access

Updated:

- `src/components/orchid/Footer.tsx`

Changes:

- Footer now labels `Mission Control (owner)`.
- Adds a clear owner access note: use the footer link, then enter the owner access code configured for this deployment.
- Reduces footer vertical spacing.

Tracker IDs:

- A5
- L1
- L2
- M5

### Viewport rule documentation

Added:

- `docs/architecture/Homepage_Viewport_Rules.md`

This establishes the review rule that major homepage sections should be understandable within one viewport on desktop, iPad, and iPhone.

Tracker IDs:

- A4
- M1
- O4

### Tracker update

Updated:

- `docs/trackers/LIVING_HOMEPAGE_MASTER_BACKLOG.md`

The tracker now records BUILD-039 progress and identifies BUILD-040 as the next recommended build.

Tracker IDs:

- O2
- O3
- O4
- O5

## Still open

BUILD-039 does **not** fully complete:

- above-the-fold hero redesign
- logo reduction
- full one-viewport refactor for every homepage section
- graph label overlap fix
- Atlas control replacement
- pollinator portal
- mycorrhizal dossier
- Featured Genus archive
- native public Calyx chat

## Next recommended build

BUILD-040 — Hero Orchid + Responsive Story Flow

Target:

- A2
- B1–B5
- A4
- M2–M6
- E1–E6
- F2

## Deployment

Frontend deployment required after merge. Backend deployment is not required for this build.
