# BUILD-051 Owner Operations Console

## Mission

BUILD-051 turns Mission Control from a passive dashboard into the first owner operations console for the Orchid Continuum. The page must answer four questions everywhere:

- What is this?
- What can I do?
- What is Calyx doing?
- What decision does Calyx need from me?

## Implemented Slice

- Integrated Owner Guide cards for core subsystems including Atlas, Knowledge Graph, Pollinators, Mycorrhiza, Vision Lab, and Grant Office.
- Added a Calyx Command Bar that prepares owner-reviewed command files without performing production writes.
- Added a Calyx Operations Queue with Now Working, Queued, Waiting for Owner, Waiting for External Partner, and Completed Today lanes.
- Added downloadable executive audit shells for overall, taxonomy, knowledge graph, and grant readiness audits.
- Added partner packet generators for Smithsonian, GBIF, iNaturalist, and universities/research labs.
- Added Research Command Center templates for species comparison, literature review, knowledge gaps, and grant packages.
- Added Research Inbox, Owner Manual, and Development Lifecycle panels.
- Preserved existing Mission Control telemetry, harvesters, governance, recommendations, endpoint diagnostics, and owner safety boundaries.

## Safety Model

- Frontend commands prepare downloadable Markdown for owner review.
- Production writes remain disabled unless the backend authorizes the specific action.
- Harvester controls continue to display authorization state and do not bypass backend owner authorization.
- The Owner Guide is local metadata until backend Mission Control endpoints expose full live subsystem guides.

## Future Backend Hooks

- `GET /api/mission-control/owner-guide`
- `GET /api/mission-control/operations-queue`
- `POST /api/mission-control/reports/executive-audit`
- `POST /api/mission-control/reports/partnership`
- `POST /api/mission-control/research/commands`
- `GET /api/mission-control/research-inbox`
- `GET /api/mission-control/lifecycle`

Every POST must require backend authorization and must record provenance or a decision-ledger entry before producing production-visible output.

## Validation

Run:

- `pnpm lint`
- `pnpm build`
