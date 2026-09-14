# Autonomous convergence supervisor

The frontend convergence supervisor is `.github/workflows/oc-convergence-supervisor.yml`.

It exists to finish validated integration work instead of leaving green draft PRs parked or opening parallel replacement lineages.

A PR is eligible only when all of the following are true:

- it targets `oc-autonomous-integration`;
- its body explicitly contains `OC-AUTO-CONVERGENCE: true`;
- it is not explicitly held with `OC-AUTO-HOLD: true`;
- exact-head Frontend CI is successful;
- exact-head CALYX-MATRIX validation is successful;
- its head SHA and base are rechecked immediately before merge;
- its merge state is not dirty or blocked.

The supervisor processes exactly one PR per run. If a PR is behind integration, it updates the branch and waits for fresh exact-head validation rather than merging stale evidence. A resulting integration push starts the supervisor again, allowing a controlled chain of validated convergence work.

This workflow never targets `main`, deploys, mutates production data, publishes scientific state, or overrides owner/security/production gates.
