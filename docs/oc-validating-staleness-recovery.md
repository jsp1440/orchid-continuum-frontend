# Stale `oc-validating` slot recovery — manual validation (issue #283)

## What changed

`.github/workflows/orchid-continuous-completion.yml`, "Supervise autonomous PRs and
recover stale slots" step: added a second staleness sweep, mirroring the existing
`oc-running` sweep, for issues stuck in `oc-validating`.

- Same age source: issue `updatedAt`.
- Same threshold: `age > 4800` seconds (~80 minutes).
- On staleness: `remove-label oc-validating --add-label oc-queued --add-label oc-repair`,
  matching the exact fail-closed pattern already used when CI reports a failure
  (line ~132) or the PR goes `DIRTY` (line ~142) — never a silent drop.
- Runs *after* the per-PR loop in the same step, not before. The per-PR loop
  unconditionally re-applies `oc-validating` on every run for any open PR whose body
  still carries `OC-AUTO-ISSUE: #N` and whose issue isn't `oc-running` (line ~114).
  Re-applying a label the issue already has is a no-op against GitHub's API — it does
  not touch `updatedAt` — but running the staleness sweep first would still race a
  same-run label flip back to `oc-validating` for any item whose PR loop iteration
  hasn't reached that line yet. Sequencing the new sweep after the loop avoids the
  race entirely and only escalates items the PR loop itself could not resolve this run.
- `MAX_ACTIVE_LANES` capacity logic in the `prepare` job is untouched. Recovered issues
  re-enter through the existing `oc-repair` path (`prepare` job's `repair=true`
  candidate handling), which already authorizes one bounded repair pass.

## Why this can't be a Vitest/unit test

This logic is inline `bash` inside a GitHub Actions workflow step, invoked only by
`gh`/`jq` against live repository state. There is no harness in this repo for
executing workflow YAML steps in isolation. Validation below is a manual trace plus
GitHub-side syntax checks performed in CI once this PR opens (`actions/checkout` +
the workflow's own YAML must parse for any job to run at all).

## Manual trace

Given an issue `#N` whose PR (marker `OC-AUTO-ISSUE: #N`) had `calyx-matrix-005-validation.yml`
fail to trigger via `workflow_dispatch` (e.g. permissions error), so `matrix` never
becomes non-empty at line ~121 on any run:

1. Run 1 (t=0): PR loop finds no `oc-running` label, sets `oc-queued → oc-validating`,
   dispatches `frontend-ci.yml`/`calyx-matrix-005-validation.yml`, `matrix` stays empty
   (`[[ -n "$ci" && -n "$matrix" ]] || continue`) — no further action this run. Issue
   `updatedAt` reflects this run's edit.
2. Runs 2..N (t=5m, 10m, ...): PR loop re-applies `oc-validating` (already present →
   no-op, `updatedAt` unchanged), re-dispatches (still fails to report), `continue`s
   again. Without this change the issue is stuck here forever, permanently occupying
   one of two lanes.
3. New sweep, first run where `now - updatedAt > 4800`: issue matches the
   `oc-validating` list, age check trips, labels become `oc-queued + oc-repair`,
   `oc-validating` removed.
4. Next `prepare` job run: issue is a candidate with `repair=true`; since it's no
   longer `oc-validating`/`oc-blocked`/`oc-owner-gate`/`oc-done`, it's eligible and
   (capacity permitting) promoted back to `oc-running` for a bounded repair pass —
   the lane is recovered instead of leaked.

## Non-goals confirmed unaffected

- `oc-running` staleness sweep: untouched, same threshold, runs first as before.
- `MAX_ACTIVE_LANES` / capacity math in `prepare`: untouched.
- Merge-on-success, `BEHIND`/`DIRTY` handling, blocked/requeue/done label transitions
  on successful merge: untouched.
