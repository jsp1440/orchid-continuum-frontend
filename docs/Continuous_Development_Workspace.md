# Continuous Development Workspace

## Objective

The Continuous Development Workspace is the standard bootstrap layer for Orchid Continuum builds. Its job is to reduce rediscovery by making environment state, repository state, branch state, pull request state, deployment notes, known issues, and next actions visible at session start.

## Main Entry Point

Run:

```powershell
.\scripts\start_development_session.ps1
```

The script summarizes:

- Environment readiness.
- Local repository availability.
- Current branches and uncommitted changes.
- Pull request visibility when `gh` is available.
- Deployment verification notes.
- Known issues.
- Recommended next action.

## Supported Repositories

- `jsp1440/orchid-continuum-frontend`
- `jsp1440/orchid-calyx-backend`
- `jsp1440/orchid-continuum-architecture`, if accessible

Repository access problems should be reported as `WARN`, not as a workspace-wide failure.

## Operating Principles

- Diagnostics are read-only.
- Recoverable errors should not stop the full report.
- Missing tools are expected conditions and should produce clear manual actions.
- The output should favor practical next steps over exhaustive logs.
- Session startup should happen before feature, backend, deployment, or architecture work begins.
