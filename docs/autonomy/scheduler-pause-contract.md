# Canonical scheduler trigger contract during the runner incident

Responsible lineage: frontend #301 (graph-driven scheduler), merged #744 (active
cron syntax), backend #481 (runner incident). University #964 depends on this
baseline repair; it contains no scheduler changes.

## Root cause

On unchanged main 57600f246d1b024b37e40851b866722c4a09b58a,
`src/lib/provider-governor/noApiSchedulerWorkflow.test.ts:13` expected
`on.schedule = [{ cron: '2/5 * * * *' }]`, but the parsed value was undefined.
The original file ran five tests: one failed and four passed.

This is a synchronous committed-YAML contract check. It does not advance a
JavaScript clock; fake timers, races and asynchronous test isolation are not the
cause.

Merged PR #744 established the active single offset five-minute cron contract.
Later incident commit 25b14162e0f6f104e7e85ff4c63741d889678c22 deliberately
removed the canonical schedule while retaining manual/event/reusable triggers,
jobs, permissions and validation. It added the explicit pause notice immediately
under `on:`. The test retained only its active-state expectation. The later
main tip pauses the Featured Genus sentinel, not the canonical scheduler itself.
Issue #481 records the instruction to preserve the incident pauses.

## Smallest repair

Only the test and this explanatory document change. Runtime workflows, scheduler
implementation, provider policy, permissions, leases and cadence remain unchanged.

The test recognizes two valid source configurations:

- Explicit incident pause notice directly below top-level `on:`: no schedule
  registration, while pull_request, issues, workflow_dispatch and workflow_call remain.
- Active configuration without that pause notice: exactly the existing single
  `2/5 * * * *` schedule, with the same retained triggers.

Missing a timer without the explicit pause is still a failure. Registering a timer
while the pause remains is also a failure. Negative controls reject wrong/extra/
empty/null active schedules and deletion of each retained trigger. The manual
compatibility alias still cannot register a second schedule.

Active fixtures are test data only. This repair does not resume a timer or grant
authority to do so. Restoration remains separately governed by the incident
owner; passing these tests is not evidence of a schedule-triggered hosted run.

## Reproduction

```bash
npx vitest run src/lib/provider-governor/noApiSchedulerWorkflow.test.ts src/lib/provider-governor/deterministicPortfolioRefillWorkflow.test.ts src/lib/completion-graph/scheduler.test.ts src/lib/control-plane/supervisorDiscovery.test.ts src/autonomousChain.test.ts src/budgetGovernor.test.ts --maxWorkers=1 --minWorkers=1
npm run typecheck
npm run build
npx eslint src/lib/provider-governor/noApiSchedulerWorkflow.test.ts
```

The focused command passed 97 tests across six files, including all 17 paused/
active trigger-contract cases. Typecheck/build/hosted results and exact reviewed
commit are recorded on the focused PR. A local source snapshot without git
history or pre-existing binary assets cannot certify unrelated git/asset tests;
the full hosted workflow is the broad-suite evidence.

## University dependency and owner boundary

This focused repair is based on frontend main, separate from #964. Until it is
owner-approved and integrated, unchanged University #964 still has the baseline
CI failure. A successful combined-source validation is compatibility evidence,
not a merge or an exception to required checks.

After approved integration of this repair, update #964 from the approved base
and run its current-head required checks. No merge, deployment, scheduler
activation or automatic release exception is authorized by this document.
