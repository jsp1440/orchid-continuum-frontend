# BUILD-038 - Mission Control Live Telemetry

## Purpose

Replace planned/fallback Mission Control values with safe read-only live telemetry wherever the backend exposes it.

BUILD-038 is a frontend contract/adaptor build in `jsp1440/orchid-continuum-frontend`. Backend endpoint implementation belongs in `jsp1440/orchid-calyx-backend` when the Calyx routes listed below are absent or CORS-blocked.

## Current Mission Control endpoints requested

Mission Control now probes these Calyx backend endpoints:

- `GET /api/mission-control/status`
- `GET /api/mission-control/subsystems`
- `GET /api/mission-control/audit`
- `GET /api/mission-control/harvesters`
- `GET /api/mission-control/repositories`
- `GET /api/mission-control/builds`
- `GET /api/mission-control/deployments`
- `GET /api/mission-control/metrics`
- `GET /api/mission-control/completeness`
- `GET /api/mission-control/recommendations`
- `GET /api/mission-control/governance`
- `GET /api/runner/health`
- `GET /api/connectors/health`
- `GET /api/runtime/constitutional/status`
- `GET /api/runtime/constitutional/missions`
- `GET /api/runtime/constitutional/policies`
- `GET /api/runtime/constitutional/decision-ledger`
- `GET /api/runtime/constitutional/governance-questions`

It also probes the public API backend:

- `GET /health`

## Implemented in this frontend

- Added defensive live telemetry normalization in `src/lib/missionControlOps.ts`.
- Added support for subsystem health telemetry from `subsystems`, `systems`, `globalHealth`, or `global_health` payload keys.
- Added support for harvester heartbeat/checkpoint telemetry from `harvesters`, `items`, or `pipelines` payload keys.
- Added support for repository/build/deployment status from `repositories`, `builds`, `deployments`, or `items` payload keys.
- Added support for Atlas, Brain, Knowledge Graph, Literature, Image/media, and other science/platform metrics from `/api/mission-control/metrics`.
- Added support for evidence-based completeness scoring from `/api/mission-control/completeness`.
- Preserved fallback data when endpoints fail, but labels dashboard mode as `fallback`, `mixed`, or `live`.
- Added visible evidence snippets for live completeness scores.
- Added harvester heartbeat display.
- Added latest commit and last deploy display for repository/deployment rows.
- Expanded endpoint diagnostics so backend/CORS failures are visible instead of silently replacing data.

## Read-only safety posture

No destructive action was enabled.

The frontend forcibly treats harvester controls as requiring server-side owner authorization, even when live telemetry is returned:

- run now
- pause
- resume

The following remain disabled or planned:

- deploy controls
- credential controls
- production writes
- destructive data operations

Frontend owner unlock remains a UI gate only. It is not security and does not authorize backend actions.

## Expected backend contract

The Calyx backend should return JSON arrays under the keys listed above. Recommended minimum shapes:

```json
{
  "subsystems": [
    {
      "id": "atlas",
      "name": "Atlas",
      "category": "Science",
      "status": "healthy",
      "completeness": 82,
      "evidence": ["occurrence table reachable", "region counts fresh"],
      "blockers": [],
      "summary": "Atlas telemetry is current.",
      "recommended_next_action": "Add specimen-level freshness."
    }
  ]
}
```

```json
{
  "harvesters": [
    {
      "id": "gbif",
      "name": "GBIF",
      "source": "GBIF occurrence backbone",
      "enabled": true,
      "state": "idle",
      "last_run": "2026-07-07T20:12:00Z",
      "heartbeat_at": "2026-07-07T20:15:00Z",
      "checkpoint": "orchidaceae:page:42",
      "rows_processed": 12000,
      "rows_inserted": 310,
      "warning_count": 2,
      "errors": []
    }
  ]
}
```

```json
{
  "repositories": [
    {
      "name": "jsp1440/orchid-continuum-frontend",
      "default_branch": "main",
      "latest_commit": "abc1234",
      "open_pull_requests": 1,
      "deployment_target": "Frontend hosting",
      "deploy_status": "healthy",
      "last_deploy": "2026-07-07T21:00:00Z",
      "frontend_deploy_needed": true,
      "backend_deploy_needed": false,
      "known_blockers": []
    }
  ]
}
```

## Blocked backend work

If Mission Control still reports fallback or mixed mode after this frontend deploy, the remaining work belongs in `jsp1440/orchid-calyx-backend`:

- Implement the read-only Mission Control endpoints listed above.
- Add CORS support for the deployed frontend origin.
- Populate live harvester heartbeat, checkpoint, row count, warning count, and log summary data.
- Populate GitHub, build, and Render deployment telemetry through backend-owned connectors.
- Populate Brain, Atlas, Knowledge Graph, Literature, and Image/media metrics.
- Serve evidence arrays for completeness scores so scores are explainable.
- Add server-side owner/admin authorization before any run, pause, resume, deploy, credential, or production-write route is exposed.

## Redeploy requirements

- Frontend redeploy required: yes.
- Backend redeploy required for this PR: no.
- Backend redeploy required for full live telemetry: yes, after `jsp1440/orchid-calyx-backend` implements the read endpoints.
