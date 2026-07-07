# Git and PowerShell Setup

## Test Git

```powershell
git --version
where.exe git
Get-Command git -ErrorAction SilentlyContinue | Format-List Source,Version
```

Expected locations include:

- `C:\Program Files\Git\cmd\git.exe`
- `C:\Program Files\Git\bin\git.exe`
- GitHub Desktop bundled Git below `%LocalAppData%\GitHubDesktop\app-*\resources\app\git\cmd\git.exe`

If Git exists but is not found, rerun Git for Windows installer with command-line integration (preferred), or add `C:\Program Files\Git\cmd` to user PATH through Windows Environment Variables. Close all PowerShell windows and open a new one after changing PATH.

## Local Git workflow

```powershell
git switch main
git pull --ff-only origin main
git switch -c build-descriptive-name
# inspect focused changes
git diff --check
git add <specific files>
git commit -m "docs: describe change"
git push -u origin build-descriptive-name
```

Inspect `git status` before every commit. Do not blindly use `git add .`; never commit `.env`, keys, tokens, confidential Drive exports, or `node_modules`. Never force-push a shared branch.

Use `scripts/check_git.ps1` for read-only diagnostics.