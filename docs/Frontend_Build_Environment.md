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

This repository currently commits `package-lock.json`, so use **npm** for normal install and validation. Do not mix npm and pnpm in the same clone or create a new pnpm lockfile unless the repository policy changes.

```powershell
npm ci
npm run lint
npm run build
```

## Repair broken `node_modules`

This is manual, never performed by diagnostics:

```powershell
git status
Remove-Item -Recurse -Force .\node_modules
npm cache verify
npm ci
```

Confirm repository root and preserve work first. Do not delete lockfiles to make an install pass.

Use project-local tooling through npm:

```powershell
npx tsc --version
npx vite --version
npx esbuild --version
```

`esbuild` may be transitive; a warning is acceptable if Vite builds. Report Node/npm/pnpm versions, detected lockfile, command, and first full error for environment blockers.