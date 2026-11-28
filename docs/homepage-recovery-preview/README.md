# Homepage blueprint recovery preview

This is an isolated, working candidate at `/homepage-recovery-preview`. It restores the original editorial opening and groups the featured genus into one exhibit before following that genus into the Atlas. It is not homepage acceptance or completion of the planetary Atlas program.

The root homepage is unchanged. No deployment or main-branch merge is part of this change. Owner visual feedback belongs in the existing design commission (#163), Featured Genus work (#238), and coordination hub (backend #1823).

## Recovered sources

- June 7 opening: frontend commit `93f2e30f68740b6bdff0ebc20bbf0dfd7a15aaeb`.
- July 5 composition: frontend commit `8245244827f4b4a8520c1ddb7cd30bdbadbcb163`.
- Brain main examined: `1c3783bbc3e8164ca0fd5e92758aec92db897eb1`, all seven `docs/design-book` chapters, and `04_APPLICATIONS/Calyx_Scientific_Teaching_Experience/BLUEPRINT.md`.
- Atlas program: backend `docs/architecture/ATLAS_PLANETARY_INTELLIGENCE_PROGRAM.md` and accepted `ADR-ATLAS-001-EARTH-SYSTEMS-AND-THEMATIC-CARTOGRAPHY.md`.
- [Pinned source URLs](recovered-sources.json). These are existing documents, not a replacement governance framework.

## Implemented behavior

- A single daily-genus provider controls media, identity, source credit, and Atlas navigation.
- A dominant photograph and moving window of at most nine distinct source-named species, with previous/next, manual study pause, visible-only 45-second rotation, focus/hover pause, and reduced-motion support.
- Source, photographer, license, full scientific name in image alternative text, and source-record link remain associated with the selected image. Failed images and observed NYBG/Kew herbarium-sheet hosts are excluded. No replacement images are invented.
- Interactive globe reuses the existing Atlas Next renderer; the 2D view reuses the existing map. The record selector provides keyboard selection and globe focus.
- Occurrences use the canonical public client and existing sensitivity/uncertainty projection, with a 500-record cap and genus filtering. Late previous-genus responses are discarded. No raw locality text is published. The existing client collapses failed and empty reads into `[]`; the UI explicitly describes that ambiguity instead of asserting absence.
- The globe mounts near its viewport and releases its renderer when scrolled away.

## Remaining work toward the full blueprint

The media service returned only two loadable living photographs in the captured Masdevallia response after duplicate, broken-image, and observed herbarium-sheet exclusions. The nine-item layout was separately exercised with declared browser fixtures. The preview never pads missing species with substitutes.

The generic `fetchContinuumGraph().description` is client-authored placeholder text, not a source-derived scientific narrative. It is deliberately not relabeled as a Calyx interpretation. Evidence-backed species interpretation and a progressive source-inspectable knowledge graph remain required before homepage acceptance.

The Atlas program includes Earth systems, thematic overlays, time/change, reproducible maps, and export manifests. This candidate implements only the genus occurrence view and handoff to the existing Atlas workspace. Google mapping/Earth Engine, Mapbox regional layers, and thematic data integrations have not been commissioned or activated here. Existing implementer recommendations do not establish owner approval to discard those parts of the original program.

Calyx's existing design workflow was recovered; no live Calyx design session, Famous AI generation, or paid model/provider call was performed.

## Visual evidence

The screenshots use an actual public Masdevallia media response retrieved on 2026-11-20, with an adjusted running browser clock selecting that genus. Other external scientific API calls were blocked, and the occurrence endpoint was explicitly unavailable in that capture. This demonstrates composition and licensed-photo rendering, not live ecological or Atlas data acceptance.

- [Opening](opening-desktop.png)
- [Unified Featured Genus](featured-desktop.png)
- [iPad opening](opening-ipad.png)
- [Interactive globe and data limits](atlas-desktop.png)

## Validation

`npm run typecheck`, focused Vitest tests in `src/features/homepage-recovery`, targeted ESLint, `npm run validate:deployment`, and production-build Playwright specs `homepage-blueprint-preview.spec.ts` and `canonical-homepage-recovery.spec.ts`.

Browser fixtures are explicitly synthetic interaction fixtures, not scientific evidence; external APIs are blocked in those tests. Tests verify name/image/credit synchronization, the moving nine-species window, genus-preserving Atlas links, responsive navigation, no page overflow, and no uncaught errors. Focused tests also cover reduced motion, failed images, stale genus reads, and public location policy.
