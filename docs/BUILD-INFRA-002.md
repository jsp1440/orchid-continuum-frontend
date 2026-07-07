# BUILD-INFRA-002: Continuous Development Workspace

## Purpose

BUILD-INFRA-002 creates a repeatable startup layer for Orchid Continuum development sessions. Future AI-assisted builds should be able to run one script and quickly understand workspace readiness, repository availability, branch state, pull request state, deployment notes, known issues, and the next recommended development action.

## Scope

This build is development-operations only. It adds documentation and read-only diagnostic scripts for the Orchid Continuum frontend, Orchid Calyx backend, and architecture repository when accessible.

## Files Created

Documentation:

- `docs/BUILD-INFRA-002.md`
- `docs/Continuous_Development_Workspace.md`
- `docs/Repository_Inventory.md`
- `docs/Development_Workflow.md`
- `docs/Branch_Strategy.md`
- `docs/Deployment_Workflow.md`
- `docs/Architecture_Index.md`
- `docs/Build_Registry.md`
- `docs/Known_Issues.md`
- `docs/Repository_Map.md`
- `docs/Developer_Session_Checklist.md`

Scripts:

- `scripts/check_repositories.ps1`
- `scripts/check_branches.ps1`
- `scripts/check_pull_requests.ps1`
- `scripts/check_deployments.ps1`
- `scripts/check_workspace.ps1`
- `scripts/start_development_session.ps1`

## Relationship To BUILD-INFRA-001

BUILD-INFRA-001 established the Developer Workstation foundation: Windows setup guidance, package-manager expectations, local tool diagnostics, Git/GitHub authentication checks, Python checks, and Google Drive workflow notes. BUILD-INFRA-002 depends on that foundation and supplements it with a persistent session bootstrap: one main entry script plus repository, branch, PR, deployment, registry, and known-issue context for the start of each development session.

BUILD-INFRA-002 should not duplicate or contradict BUILD-INFRA-001's workstation instructions. When tool installation, npm workflow, Node validation, Python setup, Git setup, or Drive setup details are needed, use the BUILD-INFRA-001 workstation documents as the source of truth.

## How To Run

From the repository root:

```powershell
.\scripts\start_development_session.ps1
```

Individual checks may also be run directly:

```powershell
.\scripts\check_workspace.ps1
.\scripts\check_repositories.ps1
.\scripts\check_branches.ps1
.\scripts\check_pull_requests.ps1
.\scripts\check_deployments.ps1
```

## Output Meaning

- `PASS` means the check completed and found the expected condition.
- `WARN` means the check could not fully verify the condition, but the session may continue with manual review.
- `FAIL` means the check encountered a stronger local error and manual action is required before relying on that area.

Each warning or failure should include a manual action when the next step is known.

## Intentional Non-Goals

This build does not:

- Modify frontend application code.
- Modify backend application code.
- Install dependencies.
- Delete files.
- Overwrite existing files.
- Deploy any service.
- Merge any branch.
- Treat inaccessible repositories as fatal to the whole workspace check.

## Known Limitations

- Git may not be visible in Jeff's PowerShell PATH even when bundled runtimes are available to Codex.
- GitHub CLI checks require `gh` to be installed and authenticated.
- Google Drive visibility is detected only through common local paths.
- Deployment checks are manual notes until safe read-only provider APIs are configured.
- Architecture repository access may return 404 until repository visibility and connector access are resolved. This is a controlled warning, not a workspace-wide failure.
