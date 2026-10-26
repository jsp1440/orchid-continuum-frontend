# Atlas/homepage combined-head focused validation — 2026-10-26 PDT

Validated product commit: 5b523827028eba74efc4df7a16a39e501f7247e8.
This closes a bounded combined-head execution gap. It is maker validation, not non-maker approval or a product-release certificate.

## Result

Actual Node24.22.1/Vitest3.2.6: **9 suites / 29 tests PASS, zero skips, exit0**, 24.66s.
- Atlas URL selection 4
- Atlas detail identity 3
- Hero recovery 6
- Atlas recovery/pagination/filter/counts 1
- Homepage Atlas recovery 2
- AtlasMiniMap basemap 1
- Genus media empty-batch fallback 4
- Genus media recovery 4
- Species exhibit recovery 4

59 canonical source/config/lock/test files were reconstructed from exact commit blobs with static relative/alias-import closure. Every file was verified by Git SHA1 before and after execution. The manifest is included. This is a partial materialization, not a complete Git checkout or full application test selection.

Cached dependencies were reused without installation or package edits. Canonical package-lock bytes equal the cache's source lock; actual versions checked against that lock: React/DOM18.3.1, Router6.30.4, jsdom30.0.1, Vite5.4.21, Leaflet1.9.4, Vitest3.2.6. This is not a byte audit of all installed dependency files.

NO_API_MODE=true, PROVIDER_AUTHORIZED=false, explicit VITE_RELEASE_SHA set to the validated commit. NODE_OPTIONS preloaded the included offline fence for global fetch and node:http/https request/get. Tests retain their existing synthetic service/UI/map mocks; they can replace global fetch with synthetic responses. No live provider/backend/real-tile HTTP or account changes. No product modules were replaced with reduced scaffolds.

These are existing committed suites rerun ON THE NEW MERGED HEAD because its combined execution was not yet established. No old137/full/type/build suite was replayed. React Router future-flag warnings remain unsuppressed.

## Reproduce

On a complete exact5b checkout with its canonical-lock dependencies:
set NODE_OPTIONS to preload the absolute path of the included .fence.cjs.
Run:

    NO_API_MODE=true PROVIDER_AUTHORIZED=false VITE_RELEASE_SHA=5b523827028eba74efc4df7a16a39e501f7247e8 node node_modules/vitest/vitest.mjs run src/pages/Atlas.recovery.test.tsx src/pages/Atlas.selectionIdentity.test.tsx src/pages/Atlas.urlSelection.test.tsx src/components/orchid/AtlasMiniMap.basemap.test.tsx src/lib/genusMediaResolver.emptyBatch.test.ts src/lib/genusMediaResolver.recovery.test.ts src/lib/speciesExhibit.recovery.test.ts src/components/orchid/HeroOrchid.recovery.test.tsx src/components/orchid/HomeAtlasContinuum.recovery.test.tsx --pool=forks --maxWorkers=1 --minWorkers=1

The included log and manifest have SHA256:
- log a5cd5806453baec026660a305d4fd22ddfeb8f2eb100003f2df48aa74208a1a5
- manifest 23c17e3c388bab550fb5a6e872cc6166d48b3657aea33dc286b5d694134198b8

## Next gate / ownership

Canonical PR948 remains cd9b2aaa60edff079c47c1e472978f323ad9b8e7; product candidate5b is not adopted/deployed. Root authored the merge and earlier URL fix, so this is not independent review. Existing non-maker checks the final cumulative source/required gates; final-head typecheck/build/release identity/deployment-contract and desktop/iPad/phone rendered privacy/attribution/counts/layout/live acceptance remain open.

Google Maps/Earth and automatic thematic mapping are not implemented or tested here. Backend1802/1803 producer co-land before route-inventory regeneration remains binding. All homepage modules must remain in scope; this test result does not complete Featured Genus, fungi/pollinator scientific integration or Brain/MCP.

This evidence-only child adds four documentation/support files. No source/head edit, main/integration merge, workflow/provider/timer launch, Render deploy/service creation, credentials/settings/billing/globalflag/productionDB/scientific action.
