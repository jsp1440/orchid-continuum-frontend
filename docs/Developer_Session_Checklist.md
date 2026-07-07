# Developer Session Checklist

Use this checklist at the start of every future Codex session for Orchid Continuum work.

## Startup Procedure

1. Run the main workspace check:

   ```powershell
   .\scripts\start_development_session.ps1
   ```

2. Read the `Environment` section and identify missing tools.
3. Read the `Repositories` section and confirm the target repository is available.
4. Read the `Branches` section and check for uncommitted changes or ahead/behind state.
5. Read the `Pull Requests` section and look for overlap with the requested work.
6. Read the `Deployments` section and confirm whether deployment is in scope.
7. Read the `Known Issues` section before diagnosing failures.
8. Update `docs/Build_Registry.md` when starting a named build.
9. Create or switch to the correct build branch.
10. Keep changes scoped to the build mission.

## Before Opening A PR

- Confirm no unrelated files are staged.
- Confirm generated files are intentional.
- Run the most relevant read-only or project checks available.
- Update known issues if the build discovers a new blocker.
- Write a PR body that includes summary, files changed, diagnostics, non-goals, run instructions, limitations, and recommended next build.

## After Merge

- Pull or sync the default branch locally.
- Delete the merged build branch if no longer needed.
- Rerun `.\scripts\start_development_session.ps1`.
- Update `docs/Build_Registry.md` with merge status, completion date, deployment requirement, and notes.
- Start the next build only after the workspace state is understood.
