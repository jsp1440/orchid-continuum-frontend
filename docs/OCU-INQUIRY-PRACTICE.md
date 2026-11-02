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

Six new mounted React tests pass locally with the real page/practice and mocked
shell, durable notebook and API transport. They cover all stages, wrong-answer
feedback/retry, final review/reset, no mutation/network/storage calls during
practice, focus/ephemeral note reset, release disagreement, failed chapter fetch,
old-backend behavior and unknown evidence references.
Only the new test file was executed in this source-subset environment.
Focused inquiry TypeScript check passed; full application typecheck/build and
visual/assistive-technology checks remain for independent full-checkout validation.

The production HTTP verification script passed against the existing deployed
frontend/backend pair, and a separate cloud-browser observation rendered the
read-only chapter and case. This does not mean the new practice is deployed.
See the backend report's stored read-only production evidence and exact deployed SHAs.

Independent review must verify exact paired heads, full router/CORS mounting,
keyboard/focus, narrow-screen rendering, failure states and no writes before
approving a later integration. No merge, deployment, provider activation or
durable-session activation is authorized by this draft.
