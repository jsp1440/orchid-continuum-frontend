# Orchid Continuum Frontend — Coding Agent Instructions

This is the canonical Orchid Continuum public/scientific frontend.

Before implementation:
1. Inspect current `main`.
2. Search open issues and pull requests touching the same surface.
3. Identify the governing Brain mission/architecture record.
4. Classify work as `NEW`, `CONTINUE`, `CONVERGE`, `SUPERSEDE`, or `ALREADY_DONE`.
5. Prefer convergence over creating another overlapping Calyx/Matrix/Lexicon/Atlas lineage.

Engineering rules:
- Never fabricate backend capability, service health, scientific evidence, provenance, confidence, or completion.
- Preserve server-authoritative scientific state and fail closed when contracts are missing.
- Reuse canonical API clients/contracts instead of introducing conflicting endpoint conventions.
- Add focused tests for changed behavior.
- Run focused Vitest/build/lint first, then required repository CI.
- Distinguish CI/runner infrastructure failure from code failure.
- After three unsuccessful repair iterations on the same deterministic failure class, escalate instead of consuming additional model budget.

Output defaults to a draft PR with mission classification, related/superseded PRs, acceptance criteria, validation evidence, and remaining blockers.

Do not merge/auto-merge, deploy production, mutate production scientific/data state, activate taxonomy, publish science, expose credentials, spend funds, force-push, or delete branches/repos without required owner authorization.
