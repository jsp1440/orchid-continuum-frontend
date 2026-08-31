# Orchid Continuum Frontend — Coding Agent Instructions

This is the canonical Orchid Continuum public/scientific frontend.

Read `docs/AGENT-OPERATING-MEMORY.md` at startup. It contains durable corrections learned from repeated convergence failures and applies to every coding agent. Current repository truth and explicit owner decisions outrank stale memory.

Before implementation:
1. Inspect current `main`.
2. Read `docs/AGENT-OPERATING-MEMORY.md` and apply any relevant durable corrections before editing.
3. Search open issues and pull requests touching the same surface.
4. Identify the governing Brain mission/architecture record.
5. Classify work as `NEW`, `CONTINUE`, `CONVERGE`, `SUPERSEDE`, or `ALREADY_DONE`.
6. Prefer convergence over creating another overlapping Calyx/Matrix/Lexicon/Atlas lineage.

Engineering rules:
- Never fabricate backend capability, service health, scientific evidence, provenance, confidence, or completion.
- Preserve server-authoritative scientific state and fail closed when contracts are missing or a governed route violates its trust boundary.
- Reuse canonical API clients/contracts instead of introducing conflicting endpoint conventions.
- Add focused tests for changed behavior.
- Run focused Vitest/build/lint first, then required repository CI.
- Distinguish CI/runner infrastructure failure from code failure. A job with no runner and zero executed steps is infrastructure-blocked, not code-failed and not green validation.
- After three unsuccessful repair iterations on the same deterministic failure class, stop speculative repair commits and diagnose the exact failing command/output before continuing.
- When a repeated correction materially prevents wasted work, scientific error, privacy leakage, branch drift, or governance mistakes, persist it in repository instructions/tests instead of relying on chat memory.
- Completing one bounded PR is not completion of a larger mission when additional safe acceptance criteria remain executable.
- Do not imply a formal NAOCC/Smithsonian partnership unless explicitly confirmed and authorized by the owner.

Output defaults to a draft PR with mission classification, related/superseded PRs, acceptance criteria, validation evidence, and remaining blockers.

Do not merge/auto-merge, deploy production, mutate production scientific/data state, activate taxonomy, publish science, expose credentials, spend funds, force-push, or delete branches/repos without required owner authorization.
