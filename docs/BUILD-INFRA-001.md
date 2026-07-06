# BUILD-INFRA-001 — Orchid Continuum Developer Workstation

## Scope
A reproducible Windows setup for Orchid Continuum development. This build adds documentation and read-only PowerShell diagnostics only; it does not modify application code, dependencies, or deployments.

## Safety
All scripts under `scripts/` only inspect commands, paths, and repository metadata. They never install software, alter PATH, authenticate, delete files, overwrite repositories, run dependency installs, or change application code.

## Run

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\check_dev_environment.ps1
```

## Acceptance checklist

- [ ] Git works in a new PowerShell session.
- [ ] GitHub CLI authentication works, or HTTPS Git + browser PR fallback is available.
- [ ] A feature branch can be committed, pushed, and PR’d.
- [ ] Node, npm, pnpm, Python, and Google Drive workflow are available.
- [ ] The complete diagnostic suite has no `FAIL` status.

Read the setup, Git, GitHub, frontend, Codex, Drive, and troubleshooting guides in `docs/` before development.

## Stop-and-report rule
Stop application work when Git is unavailable, no authenticated push path exists, local and connector access both fail, Node cannot run project tooling, or a required Drive source cannot be accessed. Report the command, exact first error, repository, branch, and safe next action.