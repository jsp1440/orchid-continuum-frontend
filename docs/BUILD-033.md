# BUILD-033 — Mission Control

## Objective

Create a private Mission Control entry point for the Orchid Continuum owner so Calyx, runtime health, frontend repair, visual thinking, grants, and institutional memory can begin to converge in one operational workspace.

## Repository

`jsp1440/orchid-continuum-frontend`

## Implemented

### New route

- `/mission-control`
- `/orchid-continuum-mission-control`

Both routes render the new `MissionControl` page.

### New page

- `src/pages/MissionControl.tsx`

The page includes:

- Owner-only client-side access gate.
- Mission Control header and build path summary.
- Live telemetry probes for:
  - `/api/runner/health`
  - `/api/connectors/health`
  - `/api/runner/summary`
  - `/api/runner/autonomous-status`
- Calyx conversation console shell.
- Quick prompts for frontend audit, runtime status, image repair, daily summary, and grant planning.
- Visual monitor placeholder for Knowledge Layers and future mind-map/graph canvases.
- Navigation for Dashboard, Calyx Chat, Frontend Workbench, Brain Explorer, Knowledge Gaps, Visual Canvas, Grant Workspace, and Founding Charter.
- Right-side live state panel with backend origin, workbench state, knowledge-layer state, owner-gate warning, and quick links.

### Backend configuration use

Mission Control uses `CALYX_BACKEND_BASE_URL` from `src/lib/backendConfig.ts` so telemetry calls are pointed at the Calyx backend rather than the public API backend.

## Security note

BUILD-033 intentionally uses a client-side owner gate only. It is a visibility gate, not a final security boundary. The page does not expose secrets, tokens, destructive controls, raw logs, or GitHub write controls.

Before Mission Control receives write operations, deployment controls, sensitive logs, or direct GitHub mutation buttons, a later build must add server-side owner-role enforcement.

## Philosophy alignment

BUILD-033 implements Mission Control as the owner workspace for the institution described in BUILD-031:

> The Orchid Continuum exists to cultivate understanding by revealing relationships.

Mission Control is where those relationships are operationalized across Calyx, the Brain, frontend repair, grants, visual thinking, and institutional memory.

## Next builds

### BUILD-034 — Constitutional Mission Orchestrator

Connect Calyx action planning to constitutional guardrails, decision ledgers, mission queues, rollback checkpoints, and governance questions.

### BUILD-035 — Visual Thinking Canvas

Add mind maps, relationship graphs, knowledge-layer diagrams, literature maps, grant boards, and project-planning canvases.

## Deployment

This is a frontend build. After merge, redeploy the frontend service.
