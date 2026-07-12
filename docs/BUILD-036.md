# BUILD-036 — Homepage Recovery + Grant-Ready Front Page

## Objective

Repair the public Orchid Continuum homepage so it presents the intended story clearly and avoids the older duplicated/boastful homepage language.

The homepage should move visitors through:

1. Beauty
2. Discovery
3. Relationships
4. Understanding
5. Stewardship

## Repository

`jsp1440/orchid-continuum-frontend`

## Implemented

### Hero recovery

Updated:

- `src/components/orchid/HomeHero.tsx`

Changes:

- Reframed the above-the-fold message around biodiversity, relationships, education, and conservation.
- Updated body copy to connect orchids with pollinators, fungi, habitats, climate, images, maps, literature, education, and conservation action.
- Changed the primary CTA to `Follow today's orchid`.
- Added a conservation CTA to `/get-involved`.
- Kept the existing museum/botanical visual style and logo treatment.

### Homepage story section recovery

Updated:

- `src/components/orchid/WhyContinuumExists.tsx`

Changes:

- Replaced the old parchment/white manifesto section and "There is no other platform like this" framing.
- Added a grant-ready story section: `Beauty → Discovery → Relationships → Stewardship`.
- Added four interpretive pathway cards.
- Added platform evidence cards for taxonomy, ecology, atlas, literature, education, and Calyx.
- Kept the tone scientific, conservation-centered, and appropriate for public visitors and grant reviewers.

### Story anchor repair

Updated:

- `src/components/AppLayout.tsx`

Changes:

- Added `id="species-in-focus"` around the Genus of the Day section so hero CTAs reliably scroll to the intended orchid story.
- Preserved error boundaries around all public homepage sections.

## Genus of the Day / Discovery Trails

The existing `DailyGenusFeatureV5` remains in place and already includes:

- V4 image rotation foundation
- relationship chips
- Discovery Trails
- habitat, relationship, conservation, and story paths

BUILD-036 preserves this working layer while improving the surrounding homepage narrative and anchors.

## Known limitations

This build does not rewrite the backend image resolver. If images are still missing after deploy, the next repair should focus specifically on the image endpoint, image payload shape, CORS behavior, or trusted image URL filtering.

## Deployment

This is a frontend-only build. After merge, redeploy the frontend service.
