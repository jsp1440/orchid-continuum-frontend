# CONSERVATORY-READINESS-UI-001

## Completed

- Added a live readiness banner to the Conservatory dashboard.
- Added `/conservatory/readiness` with gate evidence and blocking reasons.
- Added fail-closed handling when the readiness API is unavailable.
- Locked the plant-entry form unless `ready_for_collection_entry` is explicitly true.
- Changed the initial operational instruction to three test plants only.

## Governance

Frontend code does not declare deployment readiness. It renders the owner-gated backend report from `/api/conservatory/readiness`. Unknown, unavailable, or incomplete evidence remains blocked. This build does not configure a persistent volume, restart the backend, or authorize full collection entry.

## Brain record

Priority decision: prevent the owner from accidentally entering irreplaceable collection records into ephemeral storage. Collection-entry UX now follows backend evidence rather than merge status.
