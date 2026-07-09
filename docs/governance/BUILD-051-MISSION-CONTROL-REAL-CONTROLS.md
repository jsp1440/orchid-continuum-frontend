# BUILD-051 — Mission Control Real Controls Contract

Status: implementation contract created from owner escalation on 2026-07-09.

## Problem

Mission Control currently renders several controls that look actionable but are intentionally disabled. This creates a false sense of progress and forces Jeff to keep asking what works.

Known inert controls in `src/pages/MissionControl.tsx`:

- `HarvesterRow` renders `Run now` as a disabled button.
- `HarvesterRow` renders `Pause/resume` as a disabled button.
- `RepositoryRow` renders `Deploy disabled` as a disabled button.

The existing safety posture is correct for destructive or production-changing actions, but the UI must stop presenting fake controls as if they are unfinished buttons.

## Build rule

No redesign. No route rename. No new dashboard. No new architecture. Wire safe controls now, and clearly label unsafe controls until backend owner authorization exists.

## Required safe controls to make live now

### Global header

- `Refresh` must remain live and visibly refresh Mission Control telemetry.
- When refresh succeeds, update a visible timestamp/status message so the owner knows the button worked.
- When refresh fails, show the existing error banner and keep the page alive.

### Navigation rail

Convert the left navigation list from static `<div>` rows into anchor buttons that jump to sections on the same page.

Required anchors:

- `#mission-health`
- `#mission-completeness`
- `#mission-harvesters`
- `#mission-calyx-audit`
- `#mission-builds`
- `#mission-governance`
- `#mission-recommendations`
- `#mission-intelligence`
- `#mission-grant-office`
- `#mission-partnerships`
- `#mission-safety`

Each target panel should get the matching `id`.

### Repository rows

Replace the single fake `Deploy disabled` button with safe, real links:

- `Open GitHub repo` for repository names that look like `owner/repo`.
- `Open deploy target` when `deploymentTarget` starts with `http://` or `https://`.
- Keep a disabled `Deploy requires backend owner authorization` button for actual deployment mutation.

The deploy button must remain disabled until there is a server-side action endpoint and explicit owner authorization.

### Harvester rows

Replace the fake action-only footer with:

- `Refresh telemetry` button that calls the parent `load()` function.
- Disabled `Run now requires backend owner authorization` button.
- Disabled `Pause/resume requires backend owner authorization` button.

This makes at least one control in each harvester row real while preserving production safety.

### Recommendations

Each recommendation card should support a safe action:

- `Copy next build` button that writes `recommendation.nextBuild` to the clipboard when available.
- If clipboard access fails, show the text in a small visible status line instead of crashing.

No backend write is required for this step.

## Acceptance criteria

- Mission Control no longer contains fake controls without either a real action or an explicit safety label.
- Safe controls work without backend writes.
- Dangerous controls remain disabled and explain why.
- `npm run lint` passes with no new errors.
- `npm run build` passes.
- No secrets are added.
- No production-write, deploy, harvester-run, pause/resume, or credential mutation is enabled.

## Follow-up build

BUILD-052 should add backend action endpoints only after server-side owner authorization exists.

Candidate endpoints:

- `POST /api/mission-control/harvesters/{id}/run`
- `POST /api/mission-control/harvesters/{id}/pause`
- `POST /api/mission-control/harvesters/{id}/resume`
- `POST /api/mission-control/repositories/{id}/deploy`

These are explicitly out of scope for BUILD-051.
