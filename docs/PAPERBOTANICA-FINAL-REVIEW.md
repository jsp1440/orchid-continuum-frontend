# PaperBotanica frontend final review repair

Codex maker repair of E/F/G on the existing #961 child of Kimi's #958. Starting head: `8987a689a7a2275453a29616e84cfb012614adea`; parent remains `08aa8991fe0d6ec239f7e666df29c021319fddfc`. Exact new backend/frontend heads and independent-checker handoff are recorded in the PR Conversation receipts. Adjacent source hashes bind the tested files. No Kimi branch was modified.

| Finding | Maker disposition | Evidence |
| --- | --- | --- |
| E: hidden preview downloads | FIXED | DraftView mounts only while its details is open. DOM regression checks initial/closed zero downloads, four per opening, abort on close and species changes. Existing review headers, blob cleanup and stale-result protection remain. |
| F: incomplete evidence | FIXED | Nonblank identifiers/state/attachment fields, allowed confidence/class/kind vocabulary, nonempty structures, unique evidence/organ IDs. Empty notes remain valid. Negative cases reject empty/whitespace/unknown classifications. Required REQUIRES BOTANICAL REVIEW gate remains; confidence never authorizes approval. |
| G: GLB padded-buffer overread | FIXED | Require a positive safe integer declared byteLength and bound bufferViews against it rather than padded BIN size. Includes reviewer 41/44-byte repro, valid 42/44-byte control, missing/fractional/string lengths and existing truncated/unsupported-layout tests. |

FIXED is a maker regression result, not independent acceptance. Review threads remain available to the separate checker.

Before changes: new negative suite **19 failed / 32 passed**, including the original 31 checks and one valid-record control. After repairs and added controls: **55 passed** (54 committed feature/route cases plus one compatibility case consuming actual isolated FastAPI collection and all eight profiles from the paired backend audit). Without PAPERBOTANICA_API_FIXTURE that optional check SKIPS, never claims compatibility. Scoped ESLint/TypeScript and feature-only Vite build pass; 7 modules, 6.01 kB CSS, 30.27 kB JS. Results in `docs/evidence/paperbotanica-final-review/`.

```sh
PAPERBOTANICA_API_FIXTURE=/absolute/backend/verification/backend-api-fixture.json npm test -- src/features/paperbotanica src/lib/routeAccessPolicy.test.ts
npx --no-install eslint src/features/paperbotanica
npx --no-install tsc --noEmit --jsx react-jsx --target ES2021 --module ESNext --moduleResolution bundler --skipLibCheck --types vite/client src/features/paperbotanica/*.tsx src/features/paperbotanica/*.ts
npx --no-install vite build --config verification/vite.paperbotanica.config.ts
git diff --check
```

Node 24.22.1, React 18.3.1, Vitest 3.2.6, Vite 5.4.21, TypeScript 5.5.3. DOM runtime jsdom 26.1.0 differs from repository's requested 30.x: full native-environment acceptance remains required. Exact GitHub source/config files replaced the earlier adapted local harness before testing. No backendConfig, Calyx Resolve, Brain-MCP, route policy, dossier or governance changes were made in this repair.

BLOCKED: full application build fails because the partial snapshot lacks `/src/main.tsx`; direct git access fails for absent CLI credentials. No local Chromium/Playwright runtime is installed and no full-browser journey passed. The connector permits exact file/Git operations but not a full executable checkout. Next: authorized complete checkout, native full tests/build/browser and exact-head CI. Do not treat parent scheduler CI failure as a proven current-main baseline or waive it. Hosted results are recorded separately in the PR receipt.

The paired backend fixes A-D, passes 74 scoped checks, audits all five Christmas packages and validates all five GLBs with zero Khronos errors/warnings. It actually compares 62 floral-organ pairs and finds one identical Calypso/Goodyera column pair; this is an engineering screen, not botanical certification. See backend #2278 `docs/PAPERBOTANICA-FINAL-REVIEW.md` for full evidence and reproduction.

Independent checker requested on the exact published heads; no self-acceptance. Five Christmas species, existing broader collection, provenance restrictions and hypothetical/physical-review boundaries remain. Botanical fidelity, physical assembly and production readiness are unverified; production **NOT READY**. No merge/deploy, production/Matrix/KG/taxonomy write, paid call, Vercel, competing engine or unrelated development.
