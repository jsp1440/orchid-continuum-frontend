# Orchid Continuum Frontend — Claude Code Adapter

This repository is the canonical Orchid Continuum public/scientific frontend.

Claude Code is an executor, not the source of truth for project state.

## Authority

- Orchid Continuum Brain owns architecture, governance, mission intent, scientific-integrity rules, and durable completion records.
- GitHub owns code, issues, branches, pull requests, CI, reviews, and merge state.
- Read `.github/copilot-instructions.md` first; it is the repository-local adapter to the shared Brain engineering policy.
- When a mission references Brain records, inspect those records before implementation.

## Startup sequence

Before editing:
1. Inspect current `main`.
2. Inspect the linked issue/mission and its acceptance criteria.
3. Search open issues and pull requests touching the same surface.
4. Identify the governing Brain mission/architecture record.
5. Classify the work as `NEW`, `CONTINUE`, `CONVERGE`, `SUPERSEDE`, or `ALREADY_DONE`.
6. Reuse an existing authoritative branch/PR whenever technically sound.

## Implementation posture

- Prefer convergence over creating another overlapping Calyx/Matrix/Lexicon/Atlas lineage.
- Never fabricate backend capability, service health, scientific evidence, provenance, confidence, test results, or completion.
- Preserve server-authoritative scientific state and fail closed when contracts are missing.
- Reuse canonical API clients/contracts instead of introducing conflicting endpoint conventions.
- Add focused tests for changed behavior.

## Validation

Use repository-native commands from `package.json`.

Default order:
1. focused Vitest for the changed surface when possible;
2. `npm run test` when broader validation is warranted;
3. `npm run lint`;
4. `npm run build`;
5. mission-specific validation such as `npm run validate:deployment` or `npm run verify:university-production` when relevant;
6. required GitHub Actions checks.

Distinguish implementation failure from CI/runner/infrastructure failure. Never claim a pass without execution evidence.

## Completion

Default output is a draft PR containing:
- mission classification;
- acceptance criteria;
- related/superseded issues and PRs;
- exact validation evidence;
- known limitations/blockers;
- whether owner action is required.

Continue routine implementation, testing, and repair autonomously. Stop after three unsuccessful attempts on the same deterministic failure class and escalate rather than consuming additional model budget.

Do not merge/auto-merge, deploy production, mutate production DB/KG or scientific state, activate taxonomy, publish science, expose credentials, spend funds, force-push, or delete branches/repos without required owner authorization.
