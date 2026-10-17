# Frontend development evidence — 2026-10-17

Classification: CONTINUE / CONVERGE. Base: main at 32f28063d674a5b56c9cdd5499b98f571b1899ad.
Scope: four independent fixes, in three code commits. No broad feature or operational-readiness claim.

## Changes and published commits

| Surface | Change | GitHub commit |
| --- | --- | --- |
| Field Journal | Confirm irreversible local discard; disable discard for server-accepted records; use a 44px trash target. Fence rapid save taps synchronously while original hashing/persistence is pending; disable draft editing during the write; preserve entered notes and permit retry after storage failure. | 6ff34f04cfb0a04de19867242a9451458aba4c48 |
| Atlas / Calyx integration | Reject duplicate query parameters before forwarding carried context; independently reject repeated Atlas question/provenance fields. Includes Featured Genus, canonical Atlas, Atlas Next and occurrence-question producers. | cb674c6d62ab24a48b688244d82134ac1cf54b58 |
| Featured Genus | Fence the entire optional snapshot refresh, rather than only hydration. Ignore stale success/failure responses and completions after unmount; initialize later mounts from the current UTC rotation. | a2d0ce2719a79a05831dbfb756bfbd442203f261 |

The Featured Genus snapshot adapter remains opt-in. This change does not enable it.

## Validation on the final code tree

- Field Journal page/coordinator: 22 tests passed (7 page regressions plus 15 existing coordinator cases).
- Calyx duplicate context, Atlas handoff, governed genus context and mounted route guard: 55 tests passed.
- Featured Genus lifecycle, snapshot, rotation/resume and continuum: 20 tests passed.
- 34 newly added regressions in total.
- Full `npm run test`: **3,731 passed, 2 skipped, 1 failed** across 344 files (342 passed, 1 skipped, 1 failed).
- The one failing test is `scripts/oc-done-guard.test.ts > reaches the audit summary in report-only mode`. Its tsx child fails before repository script execution: `listen EPERM /tmp/tsx-0/<pid>.pipe` in tsx's IPC setup. This is an execution-environment limitation; the full suite is not green. No test/configuration was weakened or excluded.
- `npm run typecheck`: exit 0, both TypeScript projects.
- `npm run lint`: exit 0, 0 errors / 44 warnings. Existing mixed-export warnings remain in dailyGenusContext.
- `npm run build`: exit 0; existing bundle-size/Tailwind warnings remain.
- `npm run validate:deployment`: exit 0; Render contract valid.
- `git diff --check`: clean.
- Browser validation: **BLOCKED**. No Chromium binary was available; a bounded Playwright installer attempt received a truncated/invalid archive. Stopped further installer attempts. jsdom tests are not real iPad/Safari or browser acceptance.

## Reconciled lineages and remaining blockers

- Frontend #918 and Brain #141 govern the Field Journal readiness journey. Main already includes the pilot and archive-receipt implementation. These changes supplement it.
- Claude's draft #923 owns media size-limit/EXIF disclosure corrections. Those fixes are intentionally not duplicated here. The current main's original-media EXIF/GPS disclosure remains a known issue pending that lineage.
- Featured Genus scientific-profile PR #914 and Atlas Explorer PR #913 remain separate existing lineages; neither implementation is copied or replaced here.
- #913 documents sequencing behind backend #1802 and a truthful regenerated backend route inventory. That integration/merge order is not advanced here.
- Real iPad online/offline/restart/media/recovery acceptance, deployed Atlas journeys and live Calyx scientific turns remain unverified. No production or paid-provider request was used as a test.
- An independent checker and hosted CI are still needed. This report does not certify the Field Journal pilot, Atlas Explorer, Featured Genus profile or Release-1 complete.

## Access, isolation and preservation

- Direct repository API connectivity returned HTTP 200; the CONNECT 403 did not recur.
- The GitHub connector authenticated as jsp1440 and reported push permission.
- Available Work filesystem checkout used: /workspace/scratch/729ab132ec3e/orchid-continuum-frontend. Separate worktree: /workspace/scratch/28e5af4d0824/frontend. The tool surface did not expose a published-environment name/attachment fingerprint; that named attachment is not independently attested.
- Current main was fetched before editing. Existing Calyx work and Claude branches were left untouched.
- CLI git push lacked an HTTPS credential and failed without prompting. The authenticated GitHub connector published three equivalent commits; fetched Git trees match all three local trees exactly.
- Published branch: work/frontend-safe-fixes-20261017. Local review branch tracks it. Original local commits are retained on work/frontend-safe-fixes-20261017: 6564410, 8e29550, 226d954.
- Recovery: fetch the published branch and create a worktree, or use the retained local commits in this checkout. No force-push or history rewrite occurred.

## Publication hold and action boundary

Draft PR only, with OC-AUTO-HOLD: true and no convergence authorization marker.
The actual oc-convergence-supervisor verification shell block was executed locally with mocked held PR metadata (including a convergence marker to exercise the stronger case): it returned hold=true and exited before validation dispatch or merge. This is local code-path evidence, not a hosted scheduler run.

Material inputs: current frontend source/instructions, open PR/issue metadata, Brain #141 and existing contracts/tests.
Outbound actions: read GitHub repository/issue/PR metadata, fetch git refs, the failed CLI push, bounded browser archive download, and authenticated publication to the new branch/draft PR.
No production configuration/data, credentials, Claude branch, merge authorization, paid API or scientific state was changed.
