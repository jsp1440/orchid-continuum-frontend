# Known Issues

This file tracks current development blockers, technical debt, and deferred items that future sessions should see immediately.

## Current Known Issues

| Issue | Status | Manual Action |
| --- | --- | --- |
| Git not visible in PowerShell PATH on Jeff's Windows workstation | Open | Install Git for Windows or add the existing Git runtime to PATH before relying on local git commands. |
| GitHub connector may return 404 for newly created repositories | Open | Verify repository visibility, connector access, and exact owner/name before treating 404 as a missing repository. |
| Node/npm/esbuild validation may fail due to local environment rather than code | Open | Follow the BUILD-INFRA-001 npm workflow and inspect runtime path, dependency installation state, and platform-specific binaries before assuming source failure. |
| Architecture repository access may return 404 | Open | Keep this as a controlled WARN until repository visibility and connector access are resolved. Run `scripts/check_architecture_access.ps1` before architecture curation work. |
| Source-staging readiness may be incomplete | Open | Set `ORCHID_SOURCE_STAGING` or prepare an approved source-staging folder, then run `scripts/check_source_curation_readiness.ps1`. |
| Deployment status is manually verified | Open | Use host dashboards and health checks until a safe read-only deployment provider API is documented. |

## Maintenance Rules

- Add new blockers as soon as they are discovered.
- Close issues only when the fix is verified.
- Link issues to build IDs and PRs when possible.
- Keep manual actions concrete enough for a future session to act.
