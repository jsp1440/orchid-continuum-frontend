# BUILD-052 Frontend Wiring

Mission Control now treats `GET /api/executive/state` as the first source of truth for executive state.

## Consumed From Executive State

- Global Health
- Subsystem Status
- Scientific Systems
- Completeness Matrix
- Recommendation Cards
- Attention Summary
- Recent Changes
- Executive Summary / Calyx Self-Audit

## Fallback

Legacy `/api/mission-control/*` probes remain compatibility fallback inputs when the executive endpoint is unavailable. This keeps the UI stable during backend deployment, but the BUILD-052 production path is the single executive state.

## No Redesign

No layout redesign was introduced. The change is limited to replacing local/fallback executive summary logic with the backend Executive Intelligence Engine payload.

