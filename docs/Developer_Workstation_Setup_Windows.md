# Windows Developer Workstation Setup

## Install tools

1. **Git for Windows:** install from the official Git site and select the option that enables Git from the command line. Open a **new** PowerShell, then run `git --version` and `where.exe git`.
2. **GitHub CLI:** install `gh`, reopen PowerShell, then run `gh --version`, `gh auth login`, and `gh auth status`. Choose GitHub.com, HTTPS, and browser authentication.
3. **Node.js:** install current Node LTS, reopen PowerShell, then run `node --version` and `npm --version`.
4. **pnpm:** run `corepack enable`, `corepack prepare pnpm@latest --activate`, then `pnpm --version`. Use official pnpm Windows instructions if Corepack is unavailable.
5. **Python:** install Python 3 with **Add Python to PATH** selected. Reopen PowerShell and run `py --version` or `python --version`.

## Workspace and clone

Keep Git clones outside OneDrive sync, e.g. `C:\OrchidContinuum`:

```powershell
New-Item -ItemType Directory -Force C:\OrchidContinuum
Set-Location C:\OrchidContinuum
git clone https://github.com/jsp1440/orchid-continuum-frontend.git
Set-Location .\orchid-continuum-frontend
git status
```

## Verify

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\check_dev_environment.ps1
```

Do not begin a build with a material `FAIL`; use the troubleshooting guide and preserve exact command output.