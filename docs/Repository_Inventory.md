# Repository Inventory

## Primary Repositories

| Repository | Purpose | Expected Access | Notes |
| --- | --- | --- | --- |
| `jsp1440/orchid-continuum-frontend` | Frontend application and shared development documentation | Required for frontend builds | BUILD-INFRA-002 does not modify frontend application code. |
| `jsp1440/orchid-calyx-backend` | Backend services and Calyx APIs | Required for backend builds | BUILD-INFRA-002 does not modify backend application code. |
| `jsp1440/orchid-continuum-architecture` | Architecture library and source curation | Optional until access is stable | If inaccessible, workspace checks should report `WARN`. |

## Inventory Rules

- Record newly created repositories here before relying on them in future builds.
- Keep repository purpose and access expectations current.
- Do not treat private or newly created repository 404 responses as fatal without confirming access separately.
- Prefer explicit repository names in build plans and PR descriptions.

## Session Questions

At the start of a session, confirm:

- Which repository is the work target?
- Which branch is active?
- Whether there are uncommitted changes.
- Whether an open PR already covers the requested work.
- Whether deployment is required after merge.
