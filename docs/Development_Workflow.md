# Development Workflow

## Standard Flow

1. Run `.\scripts\start_development_session.ps1`.
2. Read the environment, repository, branch, PR, deployment, and known-issue sections.
3. Confirm the target repository and branch.
4. Review open PRs for overlap.
5. Update `docs/Build_Registry.md` when starting a named build.
6. Make the smallest scoped change that satisfies the build mission.
7. Run relevant checks.
8. Open a draft pull request unless Jeff explicitly asks for a ready PR.
9. Do not merge without explicit approval.

## Development Constraints

- Infrastructure builds must avoid frontend and backend application code unless the build explicitly authorizes it.
- Scripts must be read-only unless a later build intentionally creates a separate mutating tool.
- Deployment work requires a separate deployment plan and explicit approval.
- Known limitations should be documented rather than rediscovered silently.

## Handoff Expectations

Every completed build should report:

- Files changed.
- Branch name.
- PR URL.
- Checks run.
- Blockers or limitations.
- Manual steps after merge.
- Recommended next build.
