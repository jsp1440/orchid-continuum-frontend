# Orchid subscription worker

Issue: #608

## Purpose

Provide a reasoning-capable worker for the Orchid Continuum autonomous control plane without restoring metered model API keys.

The GitHub-side scheduler remains deterministic and provider-free. Model execution happens only on a trusted local machine where Codex is authenticated with the owner's ChatGPT subscription.

## Why this is a local pull worker

Repository workflow policy forbids persistent self-hosted GitHub Actions runners. The subscription worker therefore does **not** run as a GitHub Actions runner and does not weaken that guard.

Instead, a local Orchid worker process will pull a bounded task from GitHub, create an isolated Git worktree, run Codex locally, and push only the resulting branch/PR back to GitHub. Hosted GitHub Actions remains responsible for deterministic validation.

This keeps ChatGPT credentials on the local machine and out of GitHub Actions.

## Authentication invariant

The worker is admitted only when all of these are true:

1. Codex CLI is installed locally.
2. Codex app-server `account/read` reports account type `chatgpt`.
3. None of these model API variables is populated in the worker environment:
   - `OPENAI_API_KEY`
   - `CODEX_API_KEY`
   - `ANTHROPIC_API_KEY`
   - `GEMINI_API_KEY`
   - `GOOGLE_API_KEY`

The worker must never fall back to API-key authentication.

Run the local preflight with:

```bash
npx --no-install tsx scripts/subscription-worker-preflight.ts
```

A successful receipt reports `allowed: true` and `authMode: "chatgpt-subscription"`. It must not print access tokens or the contents of Codex authentication files.

## Target execution loop

```text
GitHub deterministic queue
  -> local Orchid worker claims one bounded task
  -> subscription preflight
  -> isolated issue worktree/branch from oc-autonomous-integration
  -> Codex local agent with workspace-write sandbox
  -> deterministic local tests
  -> commit/push/draft PR
  -> hosted GitHub CI
  -> provider-free event continuation/reconciliation
  -> next safe task
```

## Worker boundaries

The first execution canary is intentionally one task at a time. The worker may edit only its isolated worktree. Packaging Git operations should be owned by the wrapper rather than delegated to the model whenever practical.

The worker may not merge to `main`, deploy production, mutate production databases or knowledge graphs, change authoritative taxonomy/scientific data, publish sensitive locality, alter credentials, spend funds, force-push, delete branches/repositories, or bypass protected scientific/governance paths.

A run must have a timeout and produce a durable receipt containing the issue, branch, head SHA, worker kind, auth mode, elapsed time, validation result, outcome, and owner gate if any. Subscription usage limits are not to be reported as dollar cost.

## Scaling path

Prove one reliable canary before adding concurrency. After that, each concurrent worker gets a separate worktree and task lease. The orchestration adapter should remain model-agnostic so Claude Code subscription workers or local models can be added later without changing queue semantics.

The provider-free control plane remains authoritative regardless of which worker adapter is active.
