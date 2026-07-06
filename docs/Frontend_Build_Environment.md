# Frontend Build Environment

This repository is Vite + React + TypeScript. Verify:

```powershell
node --version
npm --version
pnpm --version
```

Use Node LTS. `scripts/check_node.ps1` checks package metadata, lockfiles, and local TypeScript/Vite/esbuild executables.

Before dependencies, inspect lockfiles:

```powershell
Get-ChildItem -Force package.json, pnpm-lock.yaml, package-lock.json, yarn.lock -ErrorAction SilentlyContinue
```

Use the package manager indicated by lockfile and team policy. Do not mix npm and pnpm in the same clone. Typical approved workflow after review:

```powershell
pnpm install --frozen-lockfile
pnpm run lint
pnpm run build
```

## Repair broken node_modules

This is manual, never performed by diagnostics:

```powershell
git status
Remove-Item -Recurse -Force .\node_modules
pnpm store prune
pnpm install --frozen-lockfile
```

Confirm repository root and preserve work first. Do not delete lockfiles to make an install pass.

Use local tooling through pnpm:

```powershell
pnpm exec tsc --version
pnpm exec vite --version
pnpm exec esbuild --version
```

esbuild may be transitive; a warning is acceptable if Vite builds. Report Node/npm/pnpm versions, detected lockfile, command, and first full error for environment blockers.