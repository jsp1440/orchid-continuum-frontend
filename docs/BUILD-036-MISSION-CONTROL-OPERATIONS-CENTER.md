# BUILD-036 — Mission Control as Calyx Master Operations Center

## Purpose

Mission Control must become the master operational control center for Calyx and the Orchid Continuum. It should not remain only a constitutional dashboard. It must become the cockpit where Calyx can observe, audit, explain, govern, and eventually safely act across the entire system.

This build must obey the Orchid Continuum Constitution, preserve provenance, record governance decisions, and avoid unsafe autonomous actions.

## Core Principle

- Calyx is the executive intelligence.
- Mission Control is Calyx's cockpit.
- The Orchid Continuum is the living system being observed, audited, repaired, and grown.

Do not merely repair the existing Mission Control page. Redesign it into the master operations layer for the entire Orchid Continuum while preserving the existing constitutional and decision-ledger features as one subsystem.

## Governance Requirements

1. Create a governance/decision record for BUILD-036.
2. Record that this build expands Mission Control from a constitutional dashboard into a master operations center.
3. Record current limitations and safety boundaries.
4. Require owner approval for destructive actions, deployments, credential changes, and production writes.
5. Keep write controls guarded by ADMIN_TOKEN or an equivalent server-side owner authorization mechanism.
6. Document all new endpoints, UI sections, assumptions, blockers, and next steps.
7. Produce a readable build report file in the repository.

## Required Product Report

Create or update this file during implementation:

`docs/BUILD-036-MISSION-CONTROL-OPERATIONS-CENTER.md`

The final report must explain:

- what was implemented,
- what systems are visible in Mission Control,
- what is live,
- what is stubbed or placeholder,
- what endpoints were added,
- what safety controls exist,
- what remains blocked,
- what should be built next.

## Required Mission Control Layers

### Layer 1 — Global Health

Create a global Orchid Continuum health view with status for:

- Frontend
- Backend
- Database
- Brain
- Knowledge Graph
- Images / Media
- Harvesters
- Runners / Jobs
- AI Services
- GitHub / Build System
- Render / Deployment
- Atlas
- Species Pages
- Pollinator System
- Mycorrhizal System
- Literature System
- Conservation System
- Grants / Funding Intelligence
- Orchid Continuum University
- Vision Lab
- Governance / Constitution

Each subsystem should have:

- name
- category
- status: healthy / warning / error / unknown / stub
- completeness percentage
- last checked timestamp
- summary
- blockers
- recommended next action

### Layer 2 — Continuous Audit

Implement a Mission Control audit model that can report:

- what systems exist,
- what capabilities are implemented,
- what capabilities are missing,
- what endpoints are available,
- what endpoints are failing,
- what repositories are connected,
- what deployment targets exist,
- what data pipelines exist,
- what harvesters exist,
- what needs repair next.

Completeness percentages must be explainable. They may initially be heuristic, but the report must show why each score was assigned.

### Layer 3 — Harvester Operations

Create backend and frontend structures for harvester control.

Each harvester should expose:

- id
- name
- source
- enabled/disabled state
- running/idle/error state
- last run
- next run if known
- duration
- rows processed
- rows inserted
- errors
- warning count
- current cursor/checkpoint if available
- run-now capability
- pause/resume capability
- logs or log summary

Required harvesters to register, even if some are placeholders:

- iNaturalist
- GBIF
- World Plants / Hassler
- EOL / TraitBank
- GloBI
- Pollinator datasets
- Mycorrhizal literature/data
- Image/media harvesters
- Literature harvesters
- Climate/elevation enrichment
- Conservation status enrichment

Write actions must be safe:

- read status may be visible inside owner-unlocked Mission Control,
- run-now/pause/resume must require server-side admin authorization,
- no destructive database operation should be exposed without explicit owner approval.

### Layer 4 — Calyx Executive Intelligence

Mission Control must include a Calyx status and self-audit panel.

Calyx should be able to report:

- what it can currently do,
- what it cannot yet do,
- what tools are connected,
- what repositories are connected,
- what endpoints are live,
- what services are failing,
- what build should happen next,
- what risk level applies,
- what owner decision is needed.

Add a Calyx Recommendation section that computes or displays the next recommended build/action based on the audit.

### Layer 5 — Build and Deployment Manager

Mission Control must show GitHub/build/deployment status.

At minimum, create the data model and UI sections for:

- repositories
- default branch
- latest commit if available
- open pull requests if available
- deployment target
- deploy status
- last deploy
- whether frontend deploy is needed
- whether backend deploy is needed
- known blockers

Repositories to register:

- jsp1440/orchid-continuum-frontend
- jsp1440/orchid-calyx-backend
- jsp1440/orchid-continuum-control-panel
- jsp1440/Orchid-Continuum-Brain

Do not create unsafe automated deploy buttons unless server-side authorization and owner confirmation are implemented.

### Layer 6 — Scientific Systems Registry

Mission Control must be designed so every scientific module can register itself.

Create a subsystem registry model for:

- Atlas
- Species Explorer
- Featured Genus
- Image Quality System
- Knowledge Graph
- Pollinators
- Mycorrhiza
- Literature Extraction
- Conservation Priorities
- Climate Comparison
- Vision Lab
- Orchid Continuum University
- Grants/Funding
- Society/Calyx community tools

Each subsystem should have:

- route or endpoint if known,
- data source,
- current maturity,
- percent complete,
- risks,
- next build needed.

## Suggested Backend Endpoints

Inspect the current backend first. Add or repair endpoints needed by Mission Control. Suggested endpoint structure:

- `GET /api/mission-control/status`
- `GET /api/mission-control/subsystems`
- `GET /api/mission-control/audit`
- `GET /api/mission-control/harvesters`
- `GET /api/mission-control/harvesters/{id}`
- `POST /api/mission-control/harvesters/{id}/run`
- `POST /api/mission-control/harvesters/{id}/pause`
- `POST /api/mission-control/harvesters/{id}/resume`
- `GET /api/mission-control/builds`
- `GET /api/mission-control/repositories`
- `GET /api/mission-control/recommendations`
- `GET /api/mission-control/governance`

If the backend already has equivalent endpoints, reuse them rather than duplicating them.

All write endpoints must require admin authorization.

## Frontend Requirements

Update Mission Control UI so it becomes an operations center, not only a constitutional page.

Required UI panels:

1. Overall Continuum Health
2. System Completeness Matrix
3. Harvester Operations
4. Calyx Executive Summary
5. Build / GitHub / Deployment Status
6. Governance and Decision Ledger
7. Recommendations / Next Actions
8. Scientific Systems Registry
9. Logs / Recent Activity
10. Safety / Owner Approval Boundaries

The existing constitutional orchestrator, missions, policies, decisions, and governance questions should remain, but they should become part of the broader control center.

## Safety Requirements

- Do not expose secrets in the frontend.
- Do not hard-code production admin credentials.
- Do not make the frontend access code the true security layer.
- Treat frontend unlock only as a UI gate.
- Server-side owner/admin authorization must guard all real actions.
- Do not enable destructive actions.
- Do not enable autonomous deployment unless explicitly guarded and documented.
- If a control is not safely implemented yet, show it as planned or requires owner authorization.

## Implementation Instructions

1. Inspect the current frontend and backend repositories.
2. Identify current Mission Control code and backend endpoints.
3. Determine why current probes show Load failed.
4. Implement missing read endpoints first.
5. Implement safe harvester status models.
6. Implement safe UI panels.
7. Preserve existing styling where useful, but prioritize operational clarity.
8. Add governance/build documentation.
9. Commit changes on a feature branch.
10. Open a pull request.
11. If appropriate and safe, merge into main.
12. Tell Jeff exactly what was implemented and whether frontend, backend, or both need redeployment.

## Acceptance Criteria

BUILD-036 is acceptable only if:

- Mission Control unlocks.
- Mission Control loads live backend data or clearly marked stub data.
- It shows more than constitutional cards.
- It includes a subsystem completeness matrix.
- It includes harvester status.
- It includes Calyx self-audit/recommendations.
- It includes build/deployment/repository status sections.
- It records governance and build documentation.
- It protects all write actions.
- It states what is still not implemented.

## Final Report Required

At the end, report:

- Files changed
- Endpoints added
- UI panels added
- Governance record location
- Product/report file location
- Whether backend redeploy is required
- Whether frontend redeploy is required
- What still needs BUILD-037

## Guiding Sentence

Mission Control is not a decorative dashboard. It is the master operations center for Calyx and the Orchid Continuum.

---

## Final Build Report

**Implementation status:** Implemented as a frontend operations-center build with a typed Mission Control data adapter, safe read-only fallback data, endpoint diagnostics, and disabled/planned controls for all actions that require server authorization.

### Files changed

- `src/lib/missionControlOps.ts`
- `src/pages/MissionControl.tsx`
- `docs/BUILD-036-MISSION-CONTROL-OPERATIONS-CENTER.md`

### UI panels added

- Overall Continuum Health
- System Completeness Matrix
- Harvester Operations
- Calyx Executive Summary / Self-Audit
- Calyx Recommendations / Next Actions
- Build / GitHub / Deployment Status
- Scientific Systems Registry
- Governance and Decision Ledger
- Recent Activity
- Safety / Owner Approval Boundaries
- Endpoint Assumptions / Diagnostics

### Data adapter

`src/lib/missionControlOps.ts` is now the single coherent Mission Control operations adapter. It attempts read-only calls to the Calyx backend and falls back to clearly marked repository-local operational data when endpoints fail or are not yet implemented.

The adapter probes:

- `GET /api/mission-control/status`
- `GET /api/mission-control/subsystems`
- `GET /api/mission-control/audit`
- `GET /api/mission-control/harvesters`
- `GET /api/mission-control/repositories`
- `GET /api/mission-control/recommendations`
- `GET /api/mission-control/governance`
- `GET /api/runtime/constitutional/status`
- `GET /api/runtime/constitutional/missions`
- `GET /api/runtime/constitutional/policies`
- `GET /api/runtime/constitutional/decision-ledger`
- `GET /api/runtime/constitutional/governance-questions`
- `GET /health` on the public API backend

Endpoint failures are shown in the UI as diagnostics instead of breaking or emptying the dashboard. Browser-level `Load failed` / `Failed to fetch` errors are described as likely missing backend routes, CORS rejection, or service unavailability.

### Operational systems visible

Mission Control now registers and displays:

- Frontend
- Backend
- Database
- Brain
- Knowledge Graph
- Images / Media
- Harvesters
- Runners / Jobs
- AI Services
- GitHub / Build System
- Render / Deployment
- Atlas
- Species Pages
- Pollinator System
- Mycorrhizal System
- Literature System
- Conservation System
- Grants / Funding Intelligence
- Orchid Continuum University
- Vision Lab
- Governance / Constitution

### Required harvesters registered

- iNaturalist
- GBIF
- World Plants / Hassler
- EOL / TraitBank
- GloBI
- Pollinator datasets
- Mycorrhizal literature/data
- Image/media harvesters
- Literature harvesters
- Climate/elevation enrichment
- Conservation status enrichment

These harvesters are visible as read-only/planned rows until backend status and server-authorized action routes exist.

### Build / GitHub / deployment registry

Mission Control now registers:

- `jsp1440/orchid-continuum-frontend`
- `jsp1440/orchid-calyx-backend`
- `jsp1440/orchid-continuum-control-panel`
- `jsp1440/Orchid-Continuum-Brain`

Deployment controls are disabled. The UI reports whether frontend or backend redeploy is expected, but does not expose deploy actions.

### Governance record

The governance record is preserved in the Mission Control page through the Constitution and Decision Ledger panel. If live constitutional endpoints fail, BUILD-036 provides a fallback governance record documenting:

- BUILD-036 expands Mission Control into the Calyx master operations center.
- Frontend unlock is a UI gate only.
- Destructive actions, deployments, credential changes, and production writes require server-side owner authorization.
- BUILD-037 should add the server-owned operational API.

### Safety controls

The frontend exposes no secrets and no production credentials.

The following controls are rendered disabled, planned, or requiring server authorization:

- run-now
- pause/resume
- deploy
- credential management
- production writes
- destructive actions

The existing owner unlock behavior remains, but the UI explicitly states it is not real security.

### Endpoint assumptions

The frontend implementation assumes the Calyx backend should eventually provide the Mission Control read endpoints listed above. If those routes are absent, CORS-blocked, or unavailable, Mission Control still renders using clearly marked fallback data and shows endpoint diagnostics.

No backend code was changed in this PR.

### Deployment requirements

- Frontend redeploy required: **Yes**
- Backend redeploy required: **No for this PR**
- Backend work required for full live operations: **Yes, in BUILD-037**
- Database migration required: **No**

### Remaining blockers for BUILD-037

- Add server-owned Mission Control read endpoints.
- Add server-side owner/admin authorization for any run-now, pause, resume, deploy, credential, or production-write action.
- Add live harvester heartbeat, checkpoints, row counts, warning counts, and log summaries.
- Add GitHub/PR/build/deployment status through a backend connector.
- Add Render deployment status without exposing deployment credentials.
- Add Brain status and sync visibility without exposing secrets.
- Feed real completeness percentages from backend evidence instead of frontend fallback heuristics.
