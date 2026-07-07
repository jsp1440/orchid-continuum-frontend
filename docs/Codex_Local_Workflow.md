# Local AI-Assisted Workflow

Run this before development:

```powershell
git status
git switch main
git pull --ff-only origin main
.\scripts\check_dev_environment.ps1
```

Do not start work when Git, authentication, repository access, or Node reports `FAIL`.

Checklist:

- State the target repository, base branch, requested feature branch, and whether merge is allowed.
- Inspect `git status` and preserve unrelated local work.
- Make only requested changes on one focused branch.
- Run the smallest applicable validation and `git diff --check`.
- Commit specific files, push the branch, and open a pull request.
- Report files changed, checks run, branch, PR URL, deployment implication, and blockers.

Fallback when a connector cannot write:

```powershell
git switch -c build-identifier
git add <specific files>
git commit -m "docs: concise change"
git push -u origin build-identifier
gh pr create --base main --head build-identifier --fill
```

If `gh` is unavailable, push the branch and create the pull request in GitHub’s browser interface. A handoff must include exact relative paths, full contents or patch, and validation commands.