# BUILD-092R — My Conservatory Frontend Relocation

## Purpose

BUILD-092 was originally merged into `jsp1440/orchid-calyx-backend` as PR #99. The React application belongs in the canonical frontend repository, `jsp1440/orchid-continuum-frontend`.

This change ports the approved first vertical slice into the existing React/Vite application rather than embedding a second application or copying the backend `client/` directory wholesale.

## Canonical routes

- `/conservatory`
- `/conservatory/plants`
- `/conservatory/plants/new`
- `/conservatory/plants/:plantId`
- `/conservatory/search`
- `/conservatory/scan`

All routes remain protected by the existing Supabase authentication boundary.

## Existing Calyx integrations

- `GET /api/implementation-planning/health`
- `GET /judging/events/{event_id}/plants`
- `GET /judging/plants/{plant_id}`
- `POST /judging/events/{event_id}/plants`

The judging-event inventory is a temporary adapter. It is not presented as the final authenticated conservatory ownership API, and no nonexistent `/api/conservatory` endpoints are fabricated.

## Environment configuration

- `VITE_CALYX_API_URL`
- `VITE_CONSERVATORY_EVENT_ID`
- `VITE_CONSERVATORY_EXHIBITOR_ID`
- `VITE_CONSERVATORY_CATEGORY_ID`

The current Supabase access token is sent as a bearer token when available. Requests also use credentialed fetch for deployments that rely on secure cookies.

## Included capabilities

- Dashboard summary
- Collection listing
- Collection search
- Plant detail
- Plant creation
- QR/manual identifier resolution
- Scientific uncertainty display
- Loading, empty, configuration, and backend-error states
- Responsive navigation

## Deferred capabilities

Bloom history, environmental history, repotting, media management, reminders, exports, and sharing remain deferred until approved backend contracts exist.

## Repository cleanup

A separate backend cleanup branch removes or reverts the frontend-only files introduced by backend PR #99. The frontend relocation should be merged before that cleanup.
