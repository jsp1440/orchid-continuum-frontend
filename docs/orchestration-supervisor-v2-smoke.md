# Orchestration supervisor v2 smoke contract

This file exists only to make the orchestration control-plane PR exercise the normal frontend pull-request validation path while keeping product code untouched.

Expected control-plane behavior after activation:
- three worker lanes refill continuously;
- workers target `oc-autonomous-integration`;
- worker heads receive explicit Frontend CI and CALYX-MATRIX validation dispatches;
- failed validation requeues the issue;
- successful worker PRs merge only into the integration branch;
- partial work requeues itself;
- genuine external blockers release their lane;
- stale running slots are reclaimed;
- stale validating slots (CI/validation dispatch that never reported back) are reclaimed to repair rather than left occupying a lane indefinitely;
- a planner refills the backlog before it empties;
- one draft integration-to-main PR remains the explicit owner gate;
- production deployment is never automated by this workflow.
