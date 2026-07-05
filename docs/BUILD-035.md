# BUILD-035 — Live Mission Control

## Objective

Connect the private Mission Control interface to the live BUILD-034 Constitutional Mission Orchestrator so the owner can see Calyx mission state, policies, decision records, governance questions, and evaluate proposed work through constitutional guardrails.

## Repository

`jsp1440/orchid-continuum-frontend`

## Implemented

### Mission Control live integration

Updated:

- `src/pages/MissionControl.tsx`

Mission Control now calls the Calyx backend directly using `CALYX_BACKEND_BASE_URL` from `src/lib/backendConfig.ts`.

### Live telemetry probes

The Mission Control dashboard now checks:

- `GET /api/runtime/constitutional/status`
- `GET /api/runner/health`
- `GET /api/connectors/health`
- `GET /api/runner/summary`

### Constitutional panels

The page now loads and displays:

- constitutional BUILD-034 status
- mission registry
- policy registry
- decision ledger
- governance question counts
- the North Star statement

### Calyx conversation evaluator

The chat panel now sends proposed work to:

- `POST /api/runtime/constitutional/evaluate`

Mission Control infers a mission lane from the prompt:

- engineering
- science
- education
- conservation
- funding
- institutional memory

The evaluator returns constitutional status, risk, rollback checkpoint information, and governance-question state.

### Visual workspace foundation

BUILD-035 retains the visual layer map and makes Mission Control the place where future graphs, mind maps, relationship maps, literature maps, grant boards, and project roadmaps will be shown.

## Security note

Mission Control still uses a client-side owner gate. BUILD-035 intentionally does **not** expose production write controls, destructive operations, raw secrets, deployment buttons, or direct GitHub mutation buttons.

Before Mission Control can execute high-risk operations, a later backend build must add server-side owner-role authorization and action approval enforcement.

## Deployment

This is a frontend build. After merge, redeploy the frontend service.

## Next build

BUILD-036 should add server-side Mission Control authorization and persistent action submission so owner-approved work can be placed into the Calyx mission queue safely.
