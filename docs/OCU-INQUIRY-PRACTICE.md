# Existing flowering laboratory: ephemeral inquiry practice

Coordination: backend #454, frontend #774, Brain #93.
Backend inventory, architecture, roadmap and independent checklist:
https://github.com/jsp1440/orchid-calyx-backend/blob/codex/ocu-living-learning-20261102/docs/OCU-LIVING-LEARNING-20261102.md

The University entry links to the existing /university/lab page. Its existing
release/capability gates still control content access and durable notebooks.
An additive backend activity contract provides seven prompts, case references,
reasoning choices and feedback. The React practice component keeps responses
and optional notes in page memory only. It makes no API mutation, model call,
storage write, submission or scientific publication.

This is a simulated instructional case, not a live evidence-backed investigation.
The page disables the shared live-GBIF badge, displays backend provenance and
does not invent an activity if an older backend lacks the additive contract.
Choice feedback is deterministic formative practice; notes are not machine-graded.
Version changes reset practice. Existing EDA and authenticated notebooks remain separate.

The test fixture was captured from candidate canonical content GET routes via
FastAPI TestClient, not from production; its _capture metadata describes the source.
Source base: frontend 57600f246d1b024b37e40851b866722c4a09b58a and backend
885b80a083f6e0cac999bc8283f5570251f34c21.

Focused test in a full checkout:

```bash
npx vitest run src/pages/UniversityInquiryJourney.test.tsx src/pages/UniversityLabPrototype.test.tsx
npm run typecheck
npm run build
```

Current verification: 52 University tests across eight files passed, including
16 StrictMode journey tests. The mounted tests mock shell/notebook/transport.
Full application and node TypeScript checks passed. Production build passed.
Changed-file lint passed without findings; repository lint passed with zero errors
and 44 warnings. No screen-reader certification is claimed.

The production HTTP verification script passed against the existing deployed
frontend/backend pair, and a separate cloud-browser observation rendered the
read-only chapter and case. This does not mean the new practice is deployed.
See the backend report's stored read-only production evidence and exact deployed SHAs.

Independent review must verify exact paired heads, full router/CORS mounting,
keyboard/focus, narrow-screen rendering, failure states and no writes before
approving a later integration. No merge, deployment, provider activation or
durable-session activation is authorized by this draft.

## Review repairs and integration evidence

The separate reviewer confirmed three P2 defects: initial async mount stole focus;
background content-refresh failures lost notes; malformed activity contracts could
crash or coerce string truth values. Repairs restrict focus to explicit stage/reset
actions, retain cached practice during content refresh errors, and validate the
supported ID/version, exact seven stages, reference identity, booleans and
no-authority flags. Sixteen StrictMode cases cover the repaired and existing flows.

Loss of release/capability verification remains fail-closed and clears practice.
The UI discloses this clearing behavior; a loss/recovery regression verifies it.
Content refresh errors retain practice only while safety verification remains valid.

Backend head 94a24e9c0ddc72042a0e019778327978506f20de passed 76 tests plus two
subtests in independent and maker runs. The independent reviewer additionally
verified the exact 326-file dependency closure and passed 20 actual outer-router
HTTP/auth/CORS assertions without service stubs. Backend hosted checks all passed,
including 23 contract tests, durable foundation, critical suites/PostgreSQL job,
source compile, workflow governance, security and BUILD-088E.

An unmocked local browser/API pair passed University entry → flowering lesson →
all seven actual backend activity stages → feedback and learner notes → final
review of all seven notes → reset → narrow viewport → reload. Actual frontend
University traffic used GET only and produced no page errors. No response fixture
or route fulfillment was used. This is local candidate integration evidence,
not deployed-candidate acceptance.

Local frontend validation used all 1,113 canonical text/source files and lockfile
dependencies; 20 pre-existing binary screenshots/static images were omitted.
This supports code compilation and the text-only learning flow, not a complete
distributable-asset audit. A broad local test run without git history/binary assets
has unrelated infrastructure failures and is not an acceptance result.

## Required CI blocker

Frontend CI run 41418854663 at e4d23812b418e83ac1a1075296e48a64ee4ffa3f ran
3,733 tests: 3,730 passed, two skipped, one failed. The failure is
`src/lib/provider-governor/noApiSchedulerWorkflow.test.ts:13`: it expects
`on.schedule = [{ cron: '2/5 * * * *' }]`, while the canonical timer is paused.
Reproduction on unchanged main 57600f246d1b024b37e40851b866722c4a09b58a yielded
the same failure (one failed, four passed in that file).
This PR changes neither the scheduler nor that test. Preserve the timer pause and
its controls. Required CI awaits the responsible scheduler/incident lineage's
baseline reconciliation or an explicit owner-approved exception.

The reference-backend E2E workflow passed on the initial frontend head, but its
configured backend does not itself prove this University activity. Current-head
results and exact SHAs are recorded in the PR/coordination comments.

## Reproduce the unmocked pair

Use the exact paired checkouts and backend Python dependencies. Run three terminals:

```bash
# Backend source dependencies, real University router; local-only test harness.
PYTHONPATH=/path/to/orchid-calyx-backend python -m uvicorn university_readonly_app:app --app-dir /path/to/orchid-continuum-frontend/scripts --host 127.0.0.1 --port 8000
# Frontend checkout: these are local build settings, not production changes.
VITE_BACKEND_BASE_URL=http://127.0.0.1:8000 VITE_CALYX_BACKEND_BASE_URL=http://127.0.0.1:8000 VITE_IMAGES_BACKEND_BASE_URL=http://127.0.0.1:8000 VITE_RELEASE_SHA=<exact-frontend-head> npm run build
npm run preview -- --host 127.0.0.1 --port 5174 --strictPort
# Frontend checkout, after installing the official test browser:
npx playwright install chromium
node scripts/verify-university-inquiry.mjs http://127.0.0.1:5174 http://127.0.0.1:8000 university-inquiry-evidence.json
```

The test harness clears production credentials, disables session writes/durability/
publication/models, blocks non-loopback connections, and imports the existing
canonical router. Bind it only to loopback. It is test scaffolding, not a second
backend or hosted service. CHROMIUM_EXECUTABLE_PATH can select an installed
official executable. The verifier performs no learner mutations or response mocking.

## Release configuration and rollback

No new database migration or environment variable is required. Existing
OCU_UNIVERSITY_ENABLED allows reading; session/durable writes, publication,
Candidate Knowledge and model flags remain disabled. Production settings are
not changed by verification.

After owner approval and applicable checks, deploy the approved backend payload
before the frontend through existing Render services. Old frontends ignore the
additive fields; repaired frontends show practice unavailable on old backends.
Rollback selects the previous approved Render revisions or reverts the paired
commits. There is no new persistent learner data to migrate or roll back.

Backend is ready for owner review on its unchanged independently reviewed green
head. Frontend has repaired code and successful targeted/build/typecheck/lint/local
integration evidence, but required CI has the baseline blocker above. Neither
PR authorizes automatic merge, deployment or learner-write activation.

## Next-stage prerequisites only

| Capability | Existing implementation | Missing connection and dependencies | Tests / acceptance | Complexity |
|---|---|---|---|---|
| Real scientific evidence | TeachingSynthesis, Brain/MCP evidence packets, taxonomy/provenance | Bind reviewed, licensed evidence IDs and taxonomy versions to this lesson after service acceptance | Citations, contradictions and unavailable states survive; simulation stays distinct; no scientific writes | Medium |
| Personalized tutoring | Brain tutor policy, existing Calyx composition/conversations and EDA call path | Enforce tutor policy over approved common evidence and authorized learner context | Five audience profiles preserve meaning/uncertainty; learner attempt precedes conclusions; no fabricated evidence | Medium/high |
| Durable continuity | Existing learner_auth, activation_service, durable_repository/discovery; #523/#680/#1113 | Existing migration, identity, release evidence and owner activation gates | Two learners isolated; revision conflict denied; restart continuity; reviewer qualifications preserved | Medium/high |
| Research Station | Existing EDA/Atlas immutable dataset, plan and promotion interfaces | Verify identity/provenance/rights through current continuation workflow | Exact identities/hashes survive replay; learner work remains noncanonical until review | Medium |

Knowledge Graph, MCP, taxonomy, Atlas, Matrix, Lexicon and literature remain the
existing scientific interfaces described in the backend inventory. Calyx Resolve
is an engineering-repair interface, not scientific evidence or grading authority.
No additional development stage or duplicate knowledge system was implemented.
