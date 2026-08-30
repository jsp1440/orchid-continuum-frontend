# CALYX Tonight — Convergence Status

**Mission classification:** CONVERGE

This branch incorporates the changes from PR #472
(`feat(calyx): auth preflight banner + cold-start retry + starter prompts + focus management`)
on top of `main`, validated and ready for the owner to have a working conversation with
CALYX tonight.

---

## CALYX TONIGHT STATUS

### Priority 1 — Core conversation path

| Feature | Status |
|---------|--------|
| Calyx interface loads reliably | ✅ `CalyxWorkspace` at `/speak-with-calyx` and `/mission-control/calyx` |
| User can type to Calyx | ✅ Textarea with Ctrl+Enter submit, character counter, resize |
| Request reaches canonical backend | ✅ `sendCalyxTurn` → `/api/calyx/speak/conversations/{id}/turns` via `calyxWorkspace.ts` |
| Calyx response appears in conversation | ✅ `CalyxMessageContent` renders prose + rich artifacts |
| Multi-turn context works | ✅ Conversation ID persisted through turns; thread load/switch |
| Microphone / voice input | ✅ `useCalyxSpeechInput` — Web Speech API with mic-leak guards |
| Spoken Calyx response | ✅ `useCalyxSpeechOutput` — Web Speech Synthesis with auto-cancel on unmount |
| Authentication / project context preserved | ✅ Auth preflight banner + sign-in link (PR #472 feature) |
| Loading and error states usable | ✅ Submitting indicator with elapsed-time; cold-start auto-retry in 20s (PR #472) |
| Stale responses cannot contaminate session | ✅ `requestIdRef` + `mountedRef` lifecycle guards + `submissionLockRef` |

### Priority 2 — Scientific workspace

| Feature | Status |
|---------|--------|
| Upload files | ✅ File picker for PDF / image / CSV / TSV / TXT / MD / JSON |
| PDF / paper viewing | ✅ `<iframe>` preview for PDF, `<img>` for images |
| Conversation + paper visible simultaneously | ✅ Split `xl:grid-cols-[2fr_1fr]` layout |
| Selected paper text → Ask Calyx | ✅ `handleViewerMouseUp` + "Ask CALYX about selection" button |
| Tables | ✅ `buildStructuredWorkspacePreview` renders CSV/TSV as sortable table |
| Charts and graphs | ✅ `CalyxArtifactView` parses ````calyx-chart` / `calyx-map` / `calyx-image` blocks |
| Rich scientific responses | ✅ `renderCalyxRichText`, `ScientificSynthesis`, `SynthesisDetail`, `CitationList` |
| Citations / evidence presentation | ✅ `CalyxCitation`, `MissionResult`, `EvidenceList`, `SourceList` |
| Export / download of results | ✅ "↓ Export research" button via `buildCalyxConversationExport` |

---

## DEPENDENCIES

- `VITE_CALYX_API_URL` must be set to the deployed Calyx backend origin.
- Owner must be authenticated (Mission Control session) for full conversation capability.
  The auth preflight banner surfaces this before the first turn fails.

## BLOCKERS

- Server-side file ingestion is blocked pending the canonical Calyx file contract
  (`orchid-calyx-backend`). Local attachment preview (PDF, image, text) works tonight.
- `ANTHROPIC_CREDIT_EXHAUSTED` CI runner failure (PR #467) is a billing blocker;
  does not affect this frontend PR.

## NEXT PRIORITY

1. Merge this PR so the improved UX (auth banner, retry, starter prompts, focus) lands on `main`.
2. Confirm `VITE_CALYX_API_URL` is set in the deployment environment.
3. Owner authenticates at Mission Control and opens `/speak-with-calyx`.
4. Track backend file-upload contract to unblock server-side paper ingestion.

---

## RELATED / SUPERSEDED

- Converges: PR #472 `feat(calyx): auth preflight banner + cold-start retry + starter prompts`
- Related:   PR #470 (earlier convergence attempt, same surface)
- Related:   PR #453 (proactive auth banner from history preflight)
