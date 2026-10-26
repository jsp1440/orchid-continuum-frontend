# Exact Atlas/homepage candidate release validation — 2026-10-26 PDT

Validated product commit: **5b523827028eba74efc4df7a16a39e501f7247e8**.
Root is the merge/URL maker. These are actual local maker checks, not independent review, hosted CI, deployment or visual acceptance.

## Results

- npm run typecheck: **PASS / exit0**, both tsconfig.app.json and tsconfig.node.json, including all886src files.
- npm run validate:deployment: **PASS / exit0**. Checks5critical client routes,1static rewrite,SPA fallback and ordered fail-closed Render publication command.
- npm run build: **PASS / exit0**, Vite5.4.21,3,066modules,39.92s. Eighteen generated files; index.html contains the full5b release identity; all12public asset copies match canonical bytes.
- npm run lint: **PASS / exit0**,0errors/44warnings over the materialized tree. Added support-module lint separately PASS/exit0. This is not a claim that unmaterialized e2e/docs files were linted.
- Prior exact5b29focusedtests/9suites were not repeated; evidence348b066c/receipt6415358014 remains separate.

## Source and environment

966canonical input blobs verified after materialization and after validation: all886src files,54scripts,12publicassets,13root configs/package inputs and one imported e2e support module. Includes byte-exact binary public assets. The complete manifest is included. These are complete application-source inputs, not a Git checkout/history or full-repository materialization.

The first typecheck attempt exited2 because the local materialization lacked canonical e2e/support/species-of-stored-identity.mjs, imported by cultivatedIdentityBackendParity.test.ts. Fetching that exact existing file repaired the environment; the second run passed. No product code, config or gate was modified. Text transport trailing-newline artifacts were corrected only where removal produced the exact expected Git blob; all966final files match their canonical SHA1.

Reused cached node_modules installed from the byte-identical canonical package-lock; no install/dependency edits this run. Actual versions checked against the lock: Node24.22.1, TypeScript5.9.3, ESLint9.39.4,Vite5.4.21,React/DOM18.3.1,@vitejs/plugin-react-swc3.11.0,Tailwind3.4.19. Earlier validation also verified Vitest3.2.6/Router6.30.4/jsdom30.0.1/Leaflet1.9.4. No full byte audit of installed dependencies.

Each command ran in a minimal environment with NO_API_MODE=true,PROVIDER_AUTHORIZED=false,npm_config_offline=true and NODE_OPTIONS preloading the offline fetch/http fence from the earlier combined validation evidence. Build received VITE_RELEASE_SHA=5b523827028eba74efc4df7a16a39e501f7247e8. No live provider/backend/Render calls or credential access.

## Preserved warnings

Lint reports44warnings, no errors. Build retains the ambiguous duration-[2000ms] class warning, mixed static/dynamic ocBackend import warning and large-chunk warnings. They were not suppressed or relabeled as absent.

## Artifact hashes

- Input manifest SHA256 a8f81ef62bc3c09175023f48314e301fcceac6637795e2d2e5ce17d4aa3ac99f.
- Build-output inventory406c4f107794807b6a78773cac38b149b6f6425b2b10633b21ed46674c001b2c.
- Typecheck log9bf4a0307d01ec987b24f80271364b57774ef086bd2be33e09688e4232fd7132.
- Deployment log67ad955cc16aaac093b7f3c4a904ff0638ca65757f4f3e0e9186cc3826e274e7.
- Build log53c79cfac17248af9d6f967fa9f482130654e55c22006261b59a476849715241.
- Lint log8a77c7f38fbc88361a8bef367e987cba6bf019bdd242f34d8bab588b35a2de1c.
- Additional support lint log empty (exit0).

## Acceptance still open

Existing non-maker must review the cumulative candidate; required hosted/history-aware/full-suite gates and desktop/iPad/phone rendered privacy/media credits/Featured Genus/fungi/pollinator/species/Atlas/Calyx acceptance remain. Google Maps/Earth/automatic thematic mapping and backend1802/1803producer co-land/inventory gates are not completed by this build.

Canonical948 remains cd9b; this product candidate is unadopted/undeployed. No main/integration merge, newPR, foreign/canonical ref edit, workflow/provider/timer launch, Render service/deploy, credentials/settings/billing/globalflag/productionDB/scientific action. This evidence-only child stores inputs/logs/inventory, not the compiled application or a hosted release. Current balances/expiry/caps/sessioncapacity/accountcost remain unverified; no paid dispatch.
