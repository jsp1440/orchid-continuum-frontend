# OC-BUDGET-001 / OC-EXECUTOR-001

PR #663 upgrades the existing continuous-completion entrypoint and deterministic
fan-out. It uses `selectAdmissibleLeaf` from #301/#313 through the existing graph
plan adapter. `orchid-no-api-scheduler.yml` is a manual compatibility alias with
no second schedule. The #608 subscription preflight is preserved; no subscription
worker or provider is launched by this change.

The canonical path is graph plan → immutable shared wave artifact → up to eight
independent budgeted reusable lanes → fenced reservation → real worker start →
settlement and immediate per-lane refill. All selected lanes must produce receipts;
the final audit fails for missing, duplicate or mismatched receipts. Untracked
leaves stay surfaced in the plan and are never turned into invented issues.

Provider authorization is **false**, the existing NO-API governor remains hard
parked, and no provider secrets are forwarded by the dispatcher. Direct worker
calls and both provider canaries also fail closed. A denied lane produces a
zero-call, zero-cost receipt and acquires no lease or `oc-running` label.

The durable accounting adapter uses `.oc/dispatch-ledger.json` on the dedicated
`oc-dispatch-state` branch. GitHub's contents API checks the previous file SHA on
every update, so simultaneous reservations cannot claim the same issue/graph leaf
or spend the same balance. The ledger schema is `Ledger` in
`scripts/oc-dispatch-control.ts`: program start, total reserved/spent amount, daily
amounts, and fenced leases with run ID, attempt, context fingerprint and expiry.
A missing or corrupt accounting record never authorizes spending. This change
does not initialize an assumed-zero paid budget or activate that branch.

Reservations consume the approved allowance immediately and are not refunded for
unknown provider outcomes. Ordinary/difficult ceilings remain $0.50/$2, daily
soft/hard ceilings $5/$10, and the 14-day program ceiling $100. Expiry alone does
not release an execution lease: GitHub must confirm its owning run completed.
The real executor alone transitions a reservation to running. Terminal receipts
release capacity; unchanged attempts remain suppressed.

PR publication remains held with `OC-AUTO-HOLD: true`. Deployment, integration
merge, paid execution, credentials and scientific/taxonomy activation are outside
this change. A future paid-provider activation requires separate owner spending
authorization, reviewed initial accounting, and verified provider-side cost bounds;
changing lane capacity never supplies that authorization.
