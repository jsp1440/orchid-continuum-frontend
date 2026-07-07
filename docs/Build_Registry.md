# Build Registry

This file is a living registry for Orchid Continuum builds. Add a row when a build begins and update it when the build is completed, merged, or deferred.

## Registry Format

| Build ID | Title | Repository | Branch | PR | Status | Merged | Deployment Required | Completion Date | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BUILD-INFRA-001 | Orchid Continuum Developer Workstation | `jsp1440/orchid-continuum-frontend` | `build-infra-001-dev-workstation` | [#21](https://github.com/jsp1440/orchid-continuum-frontend/pull/21) | Merged | Yes | No | 2026-07-06 | Foundation workstation docs and read-only diagnostics. |
| BUILD-INFRA-002 | Continuous Development Workspace | `jsp1440/orchid-continuum-frontend` | `build-infra-002-continuous-development-workspace` | [#22](https://github.com/jsp1440/orchid-continuum-frontend/pull/22) | Merged | Yes | No | 2026-07-06 | Session bootstrap docs and read-only diagnostics. |
| BUILD-INFRA-003 | Architecture Repository Access and Source Curation Bootstrap | `jsp1440/orchid-continuum-frontend` | `build-infra-003-architecture-source-curation-bootstrap` | TBD | In progress | No | No | TBD | Adds read-only architecture access and source-curation readiness workflow. |

## Status Values

- `Planned`
- `In progress`
- `PR open`
- `Merged`
- `Blocked`
- `Deferred`
- `Closed without merge`

## Field Guidance

- `Build ID`: Stable identifier, such as `BUILD-INFRA-002`.
- `Title`: Human-readable build title.
- `Repository`: Repository where the build branch lives.
- `Branch`: Branch containing the work.
- `PR`: Pull request URL or number.
- `Status`: Current lifecycle state.
- `Merged`: `Yes` or `No`.
- `Deployment Required`: `Yes` or `No`.
- `Completion Date`: Date the build is completed or merged.
- `Notes`: Blockers, manual steps, or follow-up build recommendations.
