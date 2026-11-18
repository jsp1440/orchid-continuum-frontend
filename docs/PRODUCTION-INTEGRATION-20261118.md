# Production integration checkpoint — 2026-11-18

Owner: current Codex Production Integrator. Classification: **CONTINUE / CONVERGE**.
Canonical coordination remains backend #1823 and Brain #143. This is a dated
execution receipt, not another queue or architecture. No merge, deployment,
production database write, taxonomy activation, credential change, provider call,
spending-limit change or service provisioning was performed.

## Verified starting point

| Repository or runtime | Exact inspected revision | Observation |
|---|---|---|
| Backend main and Render API | 6e5150fdf69d19bddb308b6be629552b1a1cd9e2 | Release #2449 merged; live deploy dep-dbujasoae00c73eni3qg; auto-deploy off |
| Frontend main | 7ce582bd20c4f5c2a262b713e2fc6fd202271967 | Ahead of the canonical deployed static site |
| Canonical frontend live deployment | 57600f246d1b024b37e40851b866722c4a09b58a | Last successful deploy dep-dbeli7jrjlhs73838oa0; later retries of that SHA failed their build |
| Brain main | 94a90f34d480dcd12f62a91114c39239f21918eb | Canonical instructions, registry, blueprint and governance read |
| Existing autonomy worker | c4d17ad366292b0e5193cabdfa69a83c09880283 | Live; separate workload; no persistent disk advertised; left untouched |

Read current Brain AGENTS, AI Engineering Agent Instructions, Mission Contract,
Repository Registry and Engineering Blueprint; backend/frontend operating memory,
branch ownership, security boundaries and current hub/journey records. The
inventory contained backend231, frontend75 and Brain69 open PRs. The selected
metadata snapshot is under docs/evidence/production-integration-20261118/.
An open branch is not proof a session is running. Preserve the recorded Claude
taxonomy lane, backend #2451/#2450 and frontend #979/#983/#988 ownership.

## Executed repair: existing frontend #974

Claim recorded on #974 and backend #1823 before editing. Its branch is
fix/render-frontend-build-contract-20261108, initial head
c651cce75b1f777ec585eadc38f9441b6abc7073. No replacement PR or foreign branch update.

The canonical Render frontend build runs test, lint, typecheck, deployment-contract
validation and build before publication. On current main, the focused test group
with a public API origin and placeholder public Mapbox token returned **2 failed,
34 passed**: the API and regional-map tests assumed those variables were absent.
The newer scheduler-pause tests already passed.

Reuse #975 at6a63655d6f55e9f2775eea1eb051581f340d81f1: direct import.meta.env
access avoids Vite/Vitest's frozen environment snapshot and lets isolated module
imports observe vi.stubEnv. Preserve the missing-origin no-fetch assertion and
the explicit dynamic-import Mapbox test from #974. Restore the scheduler test
byte-for-byte from current main, retaining all17 incident-pause/admission tests;
do not ship the older branch's simplified coverage. No workflow or schedule is
changed. #975's Claude branch remains untouched and retains attribution here.

Executed validation on the corrected existing branch:

- Focused three files, unset environment: **37 passed**.
- Same selection with CI=true, VITE_API_BASE_URL=https://api.orchidcontinuum.org
  and VITE_MAPBOX_TOKEN=pk.render-placeholder: **37 passed**.
- Full suite under those Render-like values: **3738 passed,2 skipped**.
- npm run typecheck: PASS. npm run lint: PASS,0 errors/44 warnings.
- npm run validate:deployment: PASS. Render-like npm run build: PASS,3064 modules;
  existing large-chunk and utility-class warnings remain.
- git diff --check: PASS.

The first full run hit49 sandbox IPC/child-process failures (listen/spawn EPERM).
The environment was changed to permit local IPC; the unchanged code then passed
the full selection. No product code or tests were weakened for those failures.
A separate current-main projection uses only the three intentional changed source/
test files; the scheduler file already equals main. That projection independently passed
**3772 tests,2 skipped**, with local IPC available; this is target-main
compatibility evidence, separately reported from the older branch's total.

The publish head, hosted run URLs, independent-review state and merge readiness
belong to #974's current PR body/comments. A green local build is not deployment
or independent maker acceptance. Do not deploy its old branch tree directly:
after owner-approved integration, deploy the resulting current-main revision.

## Independently verified backend #2451

Exact head4927be936f6bb9401e28dce9f48559bb599c0d61: **27 tests passed** in a full
checkout with real dependencies. Both new tests fail against current main's
acceptance script. Separate instrumentation submitted two scientific questions
verbatim through http_ask and the real Speak router/in-memory ConversationStore:
creation201 then turn200, twice. Returned operator_message.content equals each
submitted question. Evidence:2451-message-flow.json.

This proves the HTTP runner asks the question instead of reporting201 as a failed
answer. Retrieval/provider/auth seams in that test are deterministic doubles;
it does not certify production scientific answers. A missing opening is now
reported as a question never asked. The old3/28 production result therefore
does not mean25 scientific answers failed: those25 questions were never sent.

All6 visible current-head workflows succeeded. Critical-suite job134603741667
actually executed against GitHub merge89cde90aedcf9b1579b1b0d141552d807491d71b
(4927be93 into6e5150fd). Source/readiness evidence is independent of the maker
session, but uses the same GitHub principal. Copilot's COMMENTED quota refusal is
not an approval. Required review/owner merge authority remain unsatisfied here.

This is tool-only: approved checkout execution needs no backend redeployment.
Live HTTP acceptance is separately approval-gated:25 scientific cases create25
conversations, and research_mode=auto can use configured providers. No such
production requests were sent. Approve a bounded conversation-write test and
establish a provider-free runtime before using the corrected tool against live.

## Scientific and browser boundaries

Independent real-repository check of frontend #979 at
39b549355101f4fa69a64c21ad25fe455501e66b: **428 tests passed in14 files**.
Its partial-read contract repair is already implemented; the old hub blocker
that it rejects partial is obsolete. Keep the warning and not-retrieved records;
do not turn partial into absence. This result covers fixture/captured envelopes,
not a deployed frontend or live source review. #979 still depends on #978 and
its homepage/Atlas base, and its species-checklist component is not mounted.

Fresh public GET checks: backend /health and frontend HTML return200. The three
Atlas checklist acceptance GET paths return200 JSON with their typed envelopes,
including an explicit gap field for Atlantis. A shell and an API envelope are
not a verified user journey. A sandboxed Chromium attempt closed before page
navigation; no browser journey or iPad acceptance is claimed. No sign-in, message,
member-account creation or other production POST was performed.

Smallest scientific serving path: existing stored source/assertion → reviewed,
namespaced taxon identity → existing typed graph/source pointers → existing MCP
read tools → Brain scientific evidence context → Calyx evidence block → frontend
panel. Preserve ambiguous/unbridged identities and uncited visitation as such.
Do not equate an ID across namespaces or promote metadata to a scientific claim.
Current-backend local PostgreSQL16.2 tests executed29 cases successfully with
1 optional trace-output case skipped; that trace-export case passed separately
when its output directory was configured. They exercise real graph/MCP/Brain/Calyx
on the repository's24-node/38-edge dev snapshot plus fixture-based Atlas builds.
Source assertions stay unreviewed and synthetic builds stay test-only. No
production data or scientific state was changed.

## Federation #2423: reused, no rebuild

Verified merged head2c4ae441836010ac32362d192d07047c3d761e55, merge
4fdf6167371d06ab220b366805cae6c3e73eb504, present in the current deployed backend.
Existing relay/source-package suites: **66 passed**. Existing CLI offline replay:
first cycle2 synthetic review records, second cycle0, preview0 accepted assertions.
No new source registry, extractor, graph publisher or relay implementation.

The metadata relay's immediate output is a review package. Real identity,
rights/provenance, scientific review and the existing controlled publisher must
be satisfied before graph admission; this relay does not already implement
that full scientific activation chain.

Existing-service hosting was inspected before proposing cost:

- Canonical API is already on the merged code, has the required Python
  dependencies and an existing1GB disk at /var/data. It is a candidate for a
  **bounded, separately approved one-shot** using the existing CLI and an isolated
  /var/data/federation state directory. Its uvicorn command contains no relay
  supervisor. CPU/memory headroom, credentials/folder scope and disk free space
  were not inspected through a runtime shell, so continuous co-hosting is not
  certified. Do not change the API start command as an incidental fix.
- Active autonomy worker runs a different old revision, advertises no persistent
  disk and has a separate workload. Do not replace its command or queue.
- Suspended legacy workers are not free spare capacity: different repositories,
  scope and billing consequences need approval. No service was resumed.

First executable production proposal, requiring owner approval: use authenticated
execution on the existing API service for one metadata-only relay cycle, existing
authorized provider credentials and selected folder, batch-size25, no archive
upload, no graph/taxonomy ingestion; inspect status and run once more only after
the checkpoint says it is due to prove replay. Preserve state and inspect capacity
before deciding about a persistent worker. No new recurring service cost is
required merely to perform that bounded trial. Connector access is not runtime
Google/Smithsonian authentication. No live provider or archival proof was run.

## Shortest safe release order and overlap disposition

1. **CONTINUE/CONVERGE #974+#975**: fix the existing publication gate and obtain
   exact-head CI/review; owner merges and deploys resulting current main.
   The scheduler portion is **ALREADY_DONE** on main and is preserved verbatim.
2. **CONTINUE backend #2451**: independently verified tool repair, then owner
   approval for its merge and separately bounded live acceptance. No backend
   service redeployment is needed for tool-only execution.
3. **CONTINUE frontend #988** for owner access: source-owned, no duplicate login
   form. Its current head7b39c236a81d2dab0a0647cf4e0070d9a984ed65 still needs its
   independent review/required CI and browser/device evidence.
4. **CONVERGE visitor path #939 with its existing corrections**: #980→#981→#985
   for ID/name/malformed-route/hydration, #982 for empty-image fallback, #984 for
   candidate isolation. Preserve exact identity and cancellation. #939 has
   unresolved review findings; #985's cancellation is for public-record reads,
   not proof the separate candidate-resolution callback is safe on route changes.
   Do not certify those unresolved pieces from their PR titles.
5. **CONTINUE #978→#979** (with #948/#968 base reconciliation) for structured
   evidence; **CONTINUE #983** for checklist Atlas UI over the now-deployed API.
   Avoid merging #939 and #948 blindly: both change homepage/map behavior. Select
   and verify one current-main composition preserving their useful contributions.
6. **ALREADY_DONE** backend #2449 scientific release and Federation #2423; older
   contained scientific drafts are preservation records, not separate release
   dependencies. **SUPERSEDE** obsolete #2439 only through the already-adopted
   #2449 lineage. Taxonomy #2447 is a separate owned activation gate, not a
   reason to silently rebuild identities or hold this narrow build correction.

No overlapping PR was closed and no owner-controlled branch was modified. A
computationally mergeable draft is not a safe merge. Required reviews, source
rights, existing privacy rules and branch protection remain in effect.

## State and requested approval boundary

| Item | BUILT | TESTED | INTEGRATED | DEPLOYED | LIVE VERIFIED |
|---|---|---|---|---|---|
| #974 correction | Existing PR updated | Local gates above; CI on PR | No | No | No |
| #2451 | Existing Claude PR |27 local;6 visible CI workflows | No | Tool not deployed | No production question run |
| Backend release #2449 | Yes | Existing CI; local checks separately reported | Main6e5150fd | Render6e5150fd | Health/Atlas GET only here |
| Federation #2423 | Yes |66 local + offline replay | Main | Code present in API | No deployed relay cycle |
| Frontend #979 | Yes |428 local | Stacked draft only | No | No |
| Complete requested visitor journey | Pieces exist | Partial evidence | No accepted composition | Mixed revisions | **BLOCKED** |

Next governed actions are concrete: review/approve #974's published correction
and #2451, merge only after their review/protection gates, deploy the resulting
frontend main, and authorize the bounded provider-free production conversation
acceptance separately. No merge/deployment/provider authority is inferred here.
Model calls0; new services/subscriptions0; no spending limit changed. Existing
runner/Neon/Render marginal usage was not priced or represented as zero cost.
