# Orchid Continuum Frontend — Claude Code Adapter

Always load the shared core: Brain `14_ENGINEERING/LEAN/CORE.md`, then Brain
`14_ENGINEERING/LEAN/STATE.md` and your task card. Read references in Brain
`14_ENGINEERING/LEAN/REFS.md` only when their trigger applies. `.github/copilot-instructions.md`,
`docs/AGENT-OPERATING-MEMORY.md`, `docs/AGENT-SECURITY-BOUNDARIES.md` and
`docs/AGENT-BRANCH-OWNERSHIP.md` remain authoritative but are on-demand, not startup reading.

Repo-specific rules:
- Canonical public/scientific frontend. Converge existing Atlas/Calyx/Matrix/Lexicon lineages.
- Reuse canonical API clients/contracts; fail closed when a backend contract is missing.
  Never fabricate backend capability, service health, evidence or confidence.
- Validation (package.json): focused Vitest → `npm run test` if warranted → `npm run lint`
  → `npm run build` → mission checks (`npm run validate:deployment`) → required CI.
- Default output: a draft PR with acceptance criteria, exact validation evidence and blockers.
- Retry limit: 2 attempts per failure class (core rule), then BLOCKED.
