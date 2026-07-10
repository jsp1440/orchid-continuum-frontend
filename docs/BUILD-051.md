# BUILD-051 Owner Operations Console

## Mission

BUILD-051 turns Mission Control into an owner-authorized operations console. Browser unlock is only a UI gate; production authority comes from a signed Calyx owner session and per-action `allowedActions`.

## Authentication And Storage

- Owner session: `POST /api/mission-control/owner/session`
- Browser storage: signed owner session token only, stored in `sessionStorage` under `oc_mission_control_owner_session_v1`
- Prohibited: `CALYX_API_KEY`, owner session secret, or any privileged backend secret in Vite env, source, browser URLs, responses, logs, or localStorage
- Local fallback: the previous owner access code can unlock the UI for read-only/local preview, but it does not enable backend writes

## Control Matrix

| Capability / control | Frontend component and function | Backend endpoint | Auth | Persistence | Calyx integration | BUILD-051 status |
|---|---|---|---|---|---|---|
| Owner unlock | `MissionControlContent.unlock` | `POST /api/mission-control/owner/session` | Owner access code exchanged for signed bearer token | Session is stateless; privileged actions logged server-side | Enables server `allowedActions` | Implemented |
| Permission contract | `loadOwnerOperations` | `GET /api/mission-control/owner/permissions` | Owner session or backend API key | None | Drives exact enabled/disabled action state | Implemented |
| Command bar submit | `CommandBarPanel` / `prepareCommand` | `POST /api/mission-control/owner/commands` | Owner session | `owner_commands`, `operations_queue`, action log | Parses intent, queues durable command, applies constitutional review | Implemented |
| Operations queue view | `CalyxOperationsQueuePanel` | `GET /api/mission-control/owner/operations-queue` | Owner session | `operations_queue` | Shows durable queue records and statuses | Implemented |
| Queue approve/reject/cancel/retry | `handleQueueTransition` | `POST /api/mission-control/owner/operations-queue/{id}/{transition}` | Owner session | `operations_queue`, action log | High-risk approvals remain review-required server-side | Implemented with guarded transitions |
| Executive audit downloads | `ExecutiveAuditPanel` / `downloadAudit` | `POST /api/mission-control/owner/audits` | Owner session | `generated_audits`, action log | Uses live Mission Control metrics, completeness, and harvester registry | Markdown/JSON implemented; PDF/DOCX blocked pending backend export libraries |
| Partnership packets | `PartnershipGeneratorPanel` / `downloadPartnershipPacket` | `POST /api/mission-control/owner/partnership-packets` | Owner session | `partnership_packets`, action log | Uses live partnership readiness audit data | Markdown/JSON implemented; PDF/DOCX blocked pending backend export libraries |
| Research request templates | `ResearchCommandPanel` / `prepareResearchCommand` | `POST /api/mission-control/owner/research-requests` | Owner session | `research_requests`, action log | Queues research request, does not fabricate results | Implemented |
| Twin Daily Brief parse preview | `IntelligenceWorkspace.parse` | Browser-only preview | None | None | Local deterministic preview only | Implemented as preview, not authority |
| Twin Daily Brief central save | `IntelligenceWorkspace.save` | `POST /api/mission-control/owner/source-briefings` | Owner session | `source_briefings`, `intelligence_items`, action log | Server preserves raw report and deterministic provisional parse | Implemented |
| Local intelligence import | `IntelligenceWorkspace.importLocalRecords` | `POST /api/mission-control/owner/intelligence/import-local` | Owner session | `intelligence_items`, action log | Deduplicates imported local records | Implemented; local records are not deleted |
| Intelligence reload | `loadOwnerOperations` | `GET /api/mission-control/owner/intelligence` and `/source-briefings` | Owner session | Reads central DB | Feeds Grant Office and Partnership / Research Queue | Implemented |
| Intelligence edit | `ItemEditor` / `updateSavedItem` | `PATCH /api/mission-control/owner/intelligence/{id}` | Owner session | `intelligence_items`, action log | Updates review state, owner, priority, notes | Implemented for backend items |
| Grant Office | `GrantOpportunityRow` | `GET /api/mission-control/owner/intelligence` | Owner session | `intelligence_items` | Grant/funding records routed from central intake | Implemented |
| Partnership / research queue | `OpportunityRow` | `GET /api/mission-control/owner/intelligence` | Owner session | `intelligence_items` | Partnership, dataset, API, technology, and research items routed centrally | Implemented |
| Harvester run once | `HarvesterRow` / `handleHarvesterAction` | `POST /api/harvesters/{id}/run-once` | Owner session or backend API key | Harvester control plane and action log server-side | Mutates authoritative harvester state, then refreshes telemetry | Implemented |
| Harvester pause/resume | `HarvesterRow` / `handleHarvesterAction` | `POST /api/harvesters/{id}/pause`, `/resume` | Owner session or backend API key | Harvester control plane and action log server-side | Mutates authoritative harvester state, then refreshes telemetry | Implemented |
| Harvester reassess | `HarvesterRow` / `handleHarvesterAction` | `POST /api/harvesters/{id}/reassess` | Owner session or backend API key | Harvester control plane and action log server-side | Requests backend reassessment | Implemented |
| Harvester retire/restore | `HarvesterRow` / `handleHarvesterAction` | `POST /api/harvesters/{id}/retire`, `/restore` | Owner session or backend API key | Harvester control plane and action log server-side | Mutates authoritative harvester state, then refreshes telemetry | Implemented; high-risk policy remains backend-governed |
| Harvester target change | `HarvesterRow` | `POST /api/harvesters/{id}/target-proposals` | Owner session or backend API key | Harvester control plane | Requires structured proposal payload | Blocked in UI until target proposal form is added |
| Harvester schedule change | `HarvesterRow` | `PATCH /api/harvesters/{id}/schedule` | Owner session or backend API key | Harvester control plane | Requires schedule input | Blocked in UI until schedule form is added |
| Harvester approve/reject recommendation | `HarvesterRow` | `POST /api/harvesters/{id}/target-proposals/{proposal_id}/approve` or `/reject` | Owner session or backend API key | Harvester control plane | Requires selected proposal ID | Blocked in UI until proposal selector is added |
| Harvester recent runs/errors/config | Mission Control harvester telemetry | `GET /api/mission-control/operations`, `GET /api/harvesters/{id}`, `GET /api/harvesters/{id}/runs`, `GET /api/harvesters/{id}/recommendation` | Read endpoints public/read-only; writes owner-authenticated | Read-only backend state | Shows recent run/error/config/recommendation fields where backend supplies them | Partially implemented; detail drawers remain follow-up |
| Owner guide/manual/lifecycle | Owner guide, manual, lifecycle panels | Static frontend metadata | None | None | Explanatory only | Implemented as local guidance |

## Deployment Notes

- Backend must deploy BUILD-051 owner operations router and BUILD-049 harvester owner-auth changes.
- Required backend env: `CALYX_OWNER_ACCESS_CODE`, `CALYX_OWNER_SESSION_SECRET`; `CALYX_API_KEY` remains server-only for backend actors.
- Production persistence requires applying `migrations/BUILD-051-owner-operations-console.sql` in the backend repo before relying on central records.
- CORS must allow the frontend origin and headers `Authorization`, `Content-Type`, `X-API-Key`, and `X-Orchid-Actor`.

## Validation

- `eslint src/pages/MissionControl.tsx src/lib/ownerOperationsConsole.ts`
- `vite build`
