# BUILD-033 — Mission Control

## Objective

Create the first private Mission Control interface for the Orchid Continuum frontend.

Mission Control is the owner cockpit for Calyx, runtime telemetry, frontend repair, visual thinking, grant preparation, institutional memory, and future integrations.

## Routes

- `/mission-control`
- `/orchid-continuum-mission-control`

## Added

- `src/pages/MissionControl.tsx`
- `CALYX_BACKEND_BASE_URL` in `src/lib/backendConfig.ts`
- Mission Control routes in `src/App.tsx`

## Current capabilities

- Owner access gate shell
- Live telemetry probes for:
  - `/api/runner/health`
  - `/api/connectors/health`
  - `/api/runner/summary`
  - `/api/runner/autonomous-status`
- Calyx chat console placeholder
- Visual knowledge-layers map placeholder
- Frontend Workbench status panel
- Founding Charter status panel
- Grant workspace placeholder
- Links to diagnostics, relationship explorer, gallery, and Orchid University

## Security note

This build uses a client-side owner gate and must not expose secrets, raw logs, tokens, or write controls. Server-side role enforcement is required before Mission Control can safely trigger GitHub writes, deployment controls, or sensitive Calyx actions.

Recommended environment variable:

```text
VITE_MISSION_CONTROL_ACCESS_CODE=<private-owner-code>
```

If that variable is not set, the temporary shell fallback code is:

```text
orchid-continuum-owner
```

## Next builds

### BUILD-034 — Calyx Action Wiring

Connect Mission Control chat to live Calyx actions:

- frontend audit
- frontend workbench queue
- GitHub connector tasks
- runner queue inspection
- grant workspace generation

### BUILD-035 — Visual Thinking Canvas

Add real graph and mind-map views:

- Knowledge Layers map
- homepage repair dependency graph
- literature maps
- grant roadmap boards
- relationship network views
