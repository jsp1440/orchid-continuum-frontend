# BUILD-092R Relocation Manifest

Source: `jsp1440/orchid-calyx-backend` PR #99.

## Relocated into the canonical frontend

The standalone backend `client/src` implementation was adapted into the existing frontend architecture as:

- `src/pages/MyConservatory.tsx`
- canonical `/conservatory/*` routes in `src/App.tsx`
- frontend validation workflow
- frontend relocation documentation

## Backend-owned items

Backend API routes and implementation-planning services remain backend-owned. The frontend calls only the existing approved endpoints.

## Cleanup classification

Frontend-only files introduced by PR #99 under `client/src`, frontend package/workspace files, Vite configuration, the BUILD-092 frontend workflow, and frontend-only documentation/tests should be removed or reverted in the backend cleanup PR.

Pre-existing backend `client` scaffold files must be restored to their state before PR #99 rather than deleted.
