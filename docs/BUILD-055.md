# BUILD-055 - Mission Control Runtime Activation Telemetry

## 1. Authentication Model

Mission Control continues to use signed owner sessions for browser-originated privileged actions. It never receives or stores `CALYX_API_KEY`.

## 2. API Key Configuration

API-key configuration is backend-only. The frontend reads only secret-safe booleans from `/api/runtime/configuration`.

## 3. Owner Session Bridge

Existing owner session requests keep sending `Authorization: Bearer <owner-session-token>`. Runtime controls are authorized server-side by the backend owner-or-API-key bridge.

## 4. Runtime Lifecycle

Mission Control now consumes runtime configuration and autonomous status telemetry so the existing runtime subsystem row can show configured, running, thread alive, cycle count, queue depth, completed count, failed count, heartbeat, and blockers.

## 5. Autonomous Loop

The frontend does not start autonomous work by itself. It reports backend autoloop state and owner authorization status through existing Mission Control panels.

## 6. Runtime Endpoint Matrix

- `GET /api/runtime/configuration`: consumed for secret-safe setup diagnostics.
- `GET /api/runner/autonomous-status`: consumed for live runtime state.
- Existing owner-session endpoints remain unchanged.

## 7. Scientific Job Classification

Mission Control displays backend runtime telemetry and blockers. Placeholder or audit-only scientific work remains identified by backend state and documentation; the frontend does not promote it to completed science.

## 8. Required Environment Variables

- `VITE_CALYX_BACKEND_BASE_URL`: optional override for the Calyx backend origin.
- Backend secrets such as `CALYX_API_KEY`, `CALYX_OWNER_ACCESS_CODE`, `CALYX_OWNER_SESSION_SECRET`, and `DATABASE_URL` must never be placed in frontend env vars.

## 9. Render Configuration Steps

Deploy backend secrets in the backend Render service only. Deploy frontend after backend routes are available.

## 10. Deployment Order

1. Deploy backend BUILD-055.
2. Configure backend Render secrets.
3. Smoke test backend runtime auth and diagnostics.
4. Deploy frontend BUILD-055.
5. Refresh Mission Control and verify runtime status rows.

## 11. Smoke Tests

- Mission Control endpoint diagnostics include runtime configuration and autonomous status.
- Runners / Jobs shows configured, running, thread alive, cycles, queue depth, completed, failed, and heartbeat values from backend telemetry.
- No API key value appears in browser code, storage, network responses, or rendered text.

## 12. Remaining True Blockers

Mission Control can only report real backend runtime state. If Render secrets are missing or the backend is deployed with multi-worker in-process runtime topology, the UI must show blockers rather than successful autonomy.

## 13. Operational Readiness Assessment

Frontend BUILD-055 is read-only telemetry wiring. Operational readiness depends on backend deployment, owner-entered Render secrets, and successful runtime smoke tests.
