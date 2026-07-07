# Troubleshooting Common Failures

## Git not recognized
Close all PowerShell windows. Run `scripts/check_git.ps1`. If Git exists at `C:\Program Files\Git\cmd\git.exe`, rerun Git for Windows installer with command-line support or add that folder to user PATH, then open a new PowerShell.

## GitHub CLI / authentication
Install GitHub CLI, reopen PowerShell, run `gh auth login`, then `gh auth status`. If `gh` is unavailable, use HTTPS Git and create the PR in the browser. Never commit or paste access tokens into repository files.

## Connector 404
Confirm exact repository URL and connector installation permission. Then use local HTTPS Git to clone, branch, commit, push, and browser PR. Report the exact action, repo name, response, and fallback result.

## Push denied
Run `git remote -v`, `gh auth status`, and `git status`; confirm write access and branch policy. Do not force-push or bypass protection.

## Node/npm missing or dependencies broken
Install Node LTS, reopen PowerShell, then use this repository's committed `package-lock.json` with npm. For a repair, confirm `git status`, remove only `node_modules`, run `npm cache verify`, and reinstall with `npm ci`; never delete lockfiles or generate a pnpm lockfile to make an install pass.

## Optional pnpm diagnostic
`pnpm --version` may be useful as a workstation diagnostic for other projects, but pnpm is not the package-manager workflow for this repository while `package-lock.json` is the committed lockfile.

## Python or Drive unavailable
Install Python with Add Python to PATH and reopen PowerShell. For Drive, confirm desktop sign-in or browser access; request sharing from the document owner for private folders.

## Report format

```text
Environment blocker: <tool/access>
Repository: <owner/repo>
Branch: <branch>
Command: <exact command>
Result: <first complete error>
Checks attempted: <what was tried>
Safe next step: <specific action>
```