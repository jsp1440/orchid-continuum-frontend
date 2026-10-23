# Frontend exact-source validation: #946 / #947

Evidence prepared 2026-10-23 UTC. Accountable lane: Codex frontend validation; root integration checker and original owners retain adoption authority. This report supplies local execution evidence for existing #947/#946; it does not authorize integration, deployment, publication or production activation. Paid provider spending: $0; no provider dispatch, credential read, workflow retrigger, repository mutation or maker-branch write occurred in this lane.

## Result

Both complete tracked-source candidates installed their locked dependencies and passed typecheck, lint and production build on Node 22.23.4. A dependency installation used the initial Node 24.19.0 runtime; B installation used Node 22.23.4. Lint reports 44 warnings and zero errors per candidate. Builds complete with dynamic-import and large-chunk warnings. Deployment-contract scripts report the five critical client routes, one static rewrite, SPA fallback and ordered fail-closed prepublication gate valid (initial Node 24.19.0 execution).

The full `npm test` commands did **not** pass. Initial correct-source executions lacked Git metadata. Authentic shallow Git objects were subsequently reconstructed and verified against the original immutable commit and tree hashes. Only the four previously failing files were rerun: each candidate then had 110 passing tests and one local environment failure (`tsx` CLI Unix-socket `listen EPERM` in the done-guard report-only test). Fifty prior failures resolved with genuine HEAD metadata. No complete post-recovery full-suite run occurred; these results must not be presented as one full green test run.

## Immutable sources and capture completeness

Repository: `jsp1440/orchid-continuum-frontend`. Candidates are existing prepared repairs, not new product branches.

| Candidate | Intended lineage | Exact commit | Root Git tree | Tracked blobs | Bytes | Recursive entries |
|---|---|---|---|---:|---:|---:|
| A | Featured Genus #914 | `332ad00ef7563f24d8314459ac87f662a3a2cb2d` | `e0aa8db19f120b528d05c1d91ffdb81ee0788764` | 1099 | 17701243 | 1168 |
| B | visitor photo repair #940 | `f1fbedc948183e7dfefddf80cfa6d3f3c9f9b95b` | `4f7cce92d43982a1a9816297b6ea5137af2cdb82` | 1130 | 18112952 | 1201 |

All recursive tree responses were untruncated. Every tracked blob was captured, including binary assets, using immutable refs and base64 connector reads, deduplicated by Git blob SHA. Every byte stream was verified as `SHA1("blob " + decimal_length + NUL + bytes)`. Largest captured asset: 957,258 bytes. There were 1,131 content reads total, below the 1,800-read cap; no read errors, rate-limit retries, gitlinks, symlinks, `.gitmodules` or `.gitattributes` were found. Thus no configured LFS pointer or submodule checkout was silently omitted. The captured root tree proves the complete tracked inventory, rather than a selected source subset.

Canonical manifest calculation: JSON array sorted by path, each entry containing exactly `{path,mode,sha}`, JSON compact separators `,` and `:`, UTF-8, then SHA-256. Full manifests and tree JSON are retained with the raw local evidence bundle.

| Candidate | Final path/mode/blob manifest SHA-256 | Missing or changed blobs | Unexpected source files | Tracked Git diff/status |
|---|---|---:|---:|---|
| A | `78c6fd959fef79273d44b88de48e9b6454ceaabe521724e232e8c2e9360f8778` | 0 | 0 | clean |
| B | `86b164bd5fd6bf354a761c8962db8417392cdb86d60c0e8b7ce58f7b2c54fc24` | 0 | 0 | clean |

Final source closure time: `2026-10-23T04:09:21.940956+00:00`. A generated 13 ignored dist files; B generated 18. Dependency directories and generated dist output were kept outside the tracked-source manifest. No tracked artifacts changed during commands. B executable mode for `scripts/agent_branch_ownership.py` was restored to the original `100755` tree mode before the final four-file rerun and clean closure. No source bytes changed.

## Runtime and commands

Dependency installation used the original `package-lock.json` unchanged in both candidates: 533 packages installed per candidate. B reused the isolated npm cache in offline mode; this is a full locked install, not a reuse of focused-test node_modules. A installation preceded local Node 22 setup and used initial Node 24.19.0; B installation used Node 22.23.4. Thus clean installation under Node 22 is demonstrated for B, not A. Node 22.23.4 was installed under the validation scratch directory through `node@22`; system Node was not replaced. npm version: 11.9.0. This is a local major-22 validation, not proof of identical hosted runner tooling.

The command launcher used a minimal environment preserving only provided PATH, proxy and runtime CA trust configuration. It set `NO_API_MODE=1`, `CI=1`, isolated npm cache and `npm_config_userconfig=/dev/null`. Provider credentials were excluded. Strict TLS verification stayed enabled. Initial DNS/proxy and provided-CA setup attempts failed (`EAI_AGAIN`, then `SELF_SIGNED_CERT_IN_CHAIN`); these were environment setup errors, not product test results. Trust was repaired only by preserving the environment's existing CA variables and proxy settings. No secrets or values are included here.

Builds used explicitly configured `VITE_RELEASE_SHA=<exact candidate commit>` through the existing supported version environment input. This is a disclosed local identity input; it is not a deployment SHA, fabricated checkout, or hosted release receipt.

| Candidate | Exact command | Exit | Seconds | Node | Result |
|---|---|---:|---:|---|---|
| A | `npm ci --no-audit --no-fund --fetch-retries=0 --fetch-timeout=20000` | 0 | 15.665 | 24.19.0 (initial runtime) | PASS |
| B | `npm ci --offline --no-audit --no-fund` | 0 | 17.207 | v22.23.4 | PASS |
| A | `npm run typecheck` | 0 | 22.41 | v22.23.4 | PASS |
| B | `npm run typecheck` | 0 | 23.031 | v22.23.4 | PASS |
| A | `npm run lint` | 0 | 11.22 | v22.23.4 | PASS; 0 errors / 44 warnings |
| B | `npm run lint` | 0 | 11.519 | v22.23.4 | PASS; 0 errors / 44 warnings |
| A | `npm run build` | 0 | 25.058 | v22.23.4 | PASS; chunk/import warnings |
| B | `npm run build` | 0 | 25.349 | v22.23.4 | PASS; chunk/import warnings |
| A | `npm test` | 1 | 59.848 | v22.23.4 | initial full: 51 failed |
| B | `npm test` | 1 | 60.668 | v22.23.4 | initial full: 51 failed |
| A | `npm test -- src/dispatchRuntime.test.ts src/providerFreeSettlement.test.ts src/runtimeBackoffRequeue.test.ts scripts/oc-done-guard.test.ts` | 1 | 15.808 | v22.23.4 | recovered four files: 1 failed |
| B | `npm test -- src/dispatchRuntime.test.ts src/providerFreeSettlement.test.ts src/runtimeBackoffRequeue.test.ts scripts/oc-done-guard.test.ts` | 1 | 15.758 | v22.23.4 | recovered four files: 1 failed |

Deployment-contract command: `npm run validate:deployment`, both candidates, initial Node 24.19.0. Both raw logs contain `Render deployment contract valid.` and the five-route validation summary. The initial direct command exits were observed as successful; unlike later gates, no separate launcher JSON receipt was retained for those two commands. These are static local contract checks, not Render deployment or browser/live checks.

## Full-suite and recovery results

| Invocation | Test files | Tests | Exit |
|---|---|---|---:|
| A initial correct-source `npm test` | 330 passed / 4 failed / 1 skipped (335) | 3,569 passed / 51 failed / 2 skipped (3,622) | 1 |
| B initial correct-source `npm test` | 341 passed / 4 failed / 1 skipped (346) | 3,682 passed / 51 failed / 2 skipped (3,735) | 1 |
| A recovered four-file rerun | 3 passed / 1 failed (4) | 110 passed / 1 failed (111) | 1 |
| B recovered four-file rerun | 3 passed / 1 failed (4) | 110 passed / 1 failed (111) | 1 |

Both initial runs failed the same files: `src/dispatchRuntime.test.ts` (1 failed), `src/providerFreeSettlement.test.ts` (46 failed), `src/runtimeBackoffRequeue.test.ts` (3 failed) and `scripts/oc-done-guard.test.ts` (1 failed). Missing local HEAD directly produced `git rev-parse HEAD` failure/unknown implementation revision in dispatch and settlement; runtime reconciliation showed absent mock patches. After exact genuine Git metadata recovery, all dispatch, settlement and backoff tests passed with the same mandated `NO_API_MODE=1`. This establishes the observed recovery without attributing every initial assertion to a separate unverified cause. Vitest groups some parameterized names beneath one error, so counting only textual error blocks would undercount shared failures.

Remaining failure in each recovered run: `scripts/oc-done-guard.test.ts > oc-done guard inventory request > reaches the audit summary in report-only mode`. The unmodified test invokes the `tsx` CLI; its IPC server cannot bind `/tmp/tsx-0/*.pipe` in this local runtime (`Error: listen EPERM: operation not permitted`, Node 22.23.4). The other done-guard test passes. The report-only CLI boundary therefore remains unproven in an execution environment allowing that IPC operation. No permissions were bypassed and no product code was changed to force a pass.

The rerun counts overlap the initial full run and must not be added to the full-suite totals. No hosted CI check, independent product acceptance, full visitor browser journey, real provider-free lease settlement, ten-cycle unattended certification, integration, deployment or live verification is claimed.

## Authentic shallow metadata recovery

Original Git commit metadata was read through the existing GitHub connector. Both originals are unsigned. Exact raw commit objects were recovered using original tree, parent, author/committer, timestamps, original timezone `-0700`, message bytes and absence of a terminal message newline. The framed Git commit SHA-1 matched each authoritative candidate exactly before import. All original blob and directory-tree object hashes likewise matched. Signatures were not invented or stripped; the API explicitly reports `unsigned`.

Local repositories were initialized solely to import these verified existing objects and point a local `validated-local` ref/HEAD to the exact original candidate. Each exact candidate is marked shallow; no parent object, remote branch, integration ref, merge-base, ancestry or remote history was synthesized. Git reads and tests now see the genuine original HEAD, not a substitute commit. This is an authentic reconstructed shallow source snapshot, not an ordinary network clone or a complete Git-history checkout. History/diff-range-dependent security and hygiene gates remain unproven; they were not run against an empty synthetic range.

## Excluded invalid attempts

A capture helper initially wrote B-only files into A. An early A test/typecheck attempt therefore saw 37 source paths absent from immutable A and is invalid as candidate evidence. Those task-created extras were removed, every A blob was restored from the verified cache and a closed file inventory was checked before the valid A commands reported above. The initial invalid A logs are retained as `test-a-invalid-extra-files.log` and `typecheck-a-invalid-extra-files.log`; their results are excluded from all candidate totals. This was corrected in the validation harness, not in Orchid product source. Final closure again confirms zero unexpected source paths and all immutable blob hashes.

## Evidence integrity

Raw logs, per-command JSON receipts, immutable manifests, reconstruction receipts and final source closure are retained together in `frontend-validation-evidence.tar.gz`. The repository report is intentionally evidence-only. Original owners adopt or repair through the existing #946/#947 authority; this report creates no competing PR or production permission.

| Raw artifact | Bytes | SHA-256 |
|---|---:|---|
| `npm-ci-a-trust.log` | 511 | `cad424fe46be1c51cb88896ab83e288e6225a804c9c50ff7434d698a19f12b88` |
| `npm-ci-b-offline.log` | 511 | `76e15bf566436d14cecb33b9eee1a131cafcfb520f6164ed89e37d8544e707d3` |
| `typecheck-a.log` | 115 | `9bf4a0307d01ec987b24f80271364b57774ef086bd2be33e09688e4232fd7132` |
| `typecheck-b.log` | 115 | `9bf4a0307d01ec987b24f80271364b57774ef086bd2be33e09688e4232fd7132` |
| `lint-a.log` | 11219 | `9d4f3459686dfdf6f091f1a4a2d7ef395465d355db108d64903c0bfa2d9a828c` |
| `lint-b.log` | 11219 | `b366a37f0131f8a7e0b2c7afda6a1b2fd5d7066d79923d4c58a2ce0971dba09f` |
| `build-a.log` | 3031 | `d99bd856995976840c2b1731eb488de8627895487e4dad6567352bd784e1f804` |
| `build-b.log` | 3031 | `5efcdd0e738399ca464f63f10f15844fdbf5a5d38d356b900575ca64e70d059f` |
| `test-a.log` | 169622 | `c2f46c29d94a965036533f9d777ef8e4c6ae860b507d0ed280431889ea28786a` |
| `test-b.log` | 173457 | `64945523a012e271a0ba566b2c38b4f6533b21502754bcf63e5a58dfbc774167` |
| `test-a-git-recovered.log` | 7689 | `ae88d11bc7a15cbc4baefbef17d7d9e77128fd48c58313e346996557050fbd05` |
| `test-b-git-recovered.log` | 7313 | `5209f98c4bc3bdbe3942553d8e3b1322a186049d172b47a0b70bb526ec4f25b9` |
| `deployment-a.log` | 265 | `67ad955cc16aaac093b7f3c4a904ff0638ca65757f4f3e0e9186cc3826e274e7` |
| `deployment-b.log` | 265 | `67ad955cc16aaac093b7f3c4a904ff0638ca65757f4f3e0e9186cc3826e274e7` |
| `source-manifest-a.json` | 129803 | `db680ae48506d1c237d9dbd4fc6556c3171a628ddf75265eb6f505bc594df3fd` |
| `source-manifest-b.json` | 133248 | `5e0c174980790e6ce546ff233f86785c21e4b50f617b15e18cf90ca646de26b2` |
| `tree-a.json` | 306573 | `3b3834dc75027e7b6a7dd730a79486636f75b74503da094ca170aa5c366367a6` |
| `tree-b.json` | 315009 | `31185e8b7c3732928f49fb54ac48aa7ac50eb183e3276a61037dcb8070328829` |
| `git-reconstruction.json` | 954 | `e4f506a58df111eaa0faad29706d0b332c3142549f2396cb4b321e12d2809873` |
| `source-closure-final.json` | 2448 | `10f43ef8b0b3e11155483fb8a78e9b82baf0e781db48ad55302a8da83b7f9752` |

## Remaining acceptance gates

The immediate validation milestone is the unmodified done-guard CLI test in a suitable permitted runner, plus required exact-head hosted checks and history-aware gates on actual repository ancestry. Independent review, original-owner adoption/integration and production gates remain separate. Current stage evidence: BUILT local production bundles; TESTED local passes with one unresolved runtime boundary; REVIEWED pending independent checker receipt; INTEGRATED, DEPLOYED and LIVE VERIFIED unproven by this lane.
