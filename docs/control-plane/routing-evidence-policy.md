# Routing evidence policy

## NO-GUESS invariant

A worker declaration of provider necessity is not routing authority. Ordinary
work may use the cheapest adequate provider already enabled by repository
policy, without special evidence. Omitting `adequateProviders` or declaring the
full provider set preserves this behavior. Priority represents repository
policy ordering, not an inferred model capability or a live price estimate.

Every non-default restriction, including a restriction to the cheapest provider,
requires independently verified evidence. Importance, urgency, confidence,
elapsed time, provider availability, and statements such as "Claude is required"
cannot establish that evidence. Urgent P0 work may cross the batching threshold;
it cannot bypass evidence, NO-API, disabled-provider policy, or budgets.

## Evidence and verification are separate inputs

Worker-supplied `WorkUnit.routingEvidence` contains references with:

- `kind`: `repository-policy`, `verified-tool-result`,
  `authoritative-documentation`, or `tested-precedent`;
- `reference`: the source policy, reproducible tool result, authoritative document,
  or tested precedent;
- `sha256`: the lowercase SHA-256 digest of the source/result content.

These fields identify a claim; correct formatting alone does not verify it.
Blank, malformed, unsupported, or unregistered evidence fails closed with
`routing-evidence-required`. Invalid provider lists fail closed with
`invalid-provider-restriction`. Every supplied evidence entry must verify;
adding an assertion beside a verified entry does not make the assertion valid.

The governor matches evidence against `DispatchRequest.verifiedRoutingRules`, a
separate trusted policy input. Each rule binds the evidence kind, reference, and
content digest to `changedWorkFingerprint([{ ...unit, routingEvidence: [] }])`.
This binds the issue, head, acceptance state, material revision, urgency, and
exact provider restriction. A verified result for another task, head, provider
set, or source revision cannot authorize this task.

The policy caller is responsible for independently inspecting the immutable
source/result and proving that it supports that exact restriction before
registering a rule. A URL, digest, worker `verified: true` flag, or self-authored
verification record is insufficient. Rules must never be derived from worker
JSON. `WorkflowGovernorConfig` is trusted repository configuration; the workflow
CLI reads no verification rules from its work/environment payload. The runtime
passes trusted rules separately from work. Missing rules mean deny, not guess.

**This change registers no production evidence rules and enables no providers.**
Positive tests use synthetic verifier fixtures. There is no automatic URL fetch,
model judge, provider-specific complexity threshold, or spending authorization.

Evidence identity and content digest participate in the material work fingerprint.
Changing either invalidates old decisions. Rule verification also runs before
the unchanged-work guard, so revocation cannot preserve stale authorization.
Set ordering is immaterial; malformed evidence is not silently dropped.

## Economic boundaries

1. NO-API mode denies paid dispatch before evidence evaluation. Provider-free
   inventory, refill, and subscription-policy checks remain independent.
2. Evidence proves adequacy only. The selected provider must still be enabled by
   trusted policy and satisfy call/token/cost ceilings and cooldowns. Enabled is
   a policy state, not a health probe or a worker claim of availability.
3. The governor selects the cheapest authorized adequate route before checking
   capacity. Exhaustion, unknown required usage, or cooldown parks that route
   with `no-provider-within-governor`; it does not select a costlier fallback.
4. `executeGovernedProviderTick` requires a durable `persistState` sink before it
   invokes a provider. It reserves the call and fingerprint first, with unknown
   cost/token usage. A missing or failing sink prevents invocation.
5. A provider exception retains the durable reservation and returns
   `provider-invocation-failed`. It does not retry, change provider policy, or
   select an alternate provider. Repeated identical work stays parked; changing
   the fingerprint still cannot evade the call ceiling.
6. Successful telemetry replaces the reservation without double-counting. If
   that write fails, the durable unknown reservation remains conservative.
   Callers must serialize ticks, load current durable state, and reject stale
   writes. An invocation attempt (`dispatched: true`) is not proof of success;
   callers must inspect `reason`.

## Coverage and remaining frontend boundary

`routingEvidence.test.ts` covers all four evidence categories, malformed and
asserted evidence, work/source binding, revocation, fingerprint changes, explicit
policy disablement, and exhaustion without paid fallback. Runtime tests cover
pre-call persistence, failures, repeated ticks, changing work, and failed usage
writes. Existing NO-API/refill tests cover provider-free progress.

The legacy `orchid-completion-lane.yml` still contains a paid fallback chain, but
the current governed/continuous NO-API wrappers do not call it. Separate
`orchid-claude-runtime-recovery.yml` and `frontend-openai-runtime-canary.yml`
canaries in the integration tree do not pass through this governor. They were
not executed or changed for #607. Current `main` already parks Anthropic recovery
at commit `16af712aa28b48dd54d954f5602cb4b784221b45`; that circuit breaker has not
converged into integration. Frontend PR #506 owns overlapping Claude recovery
work. The next frontend safety task is to converge these legacy entry points on
fail-closed NO-API/governor admission before any paid reactivation, preserving
the existing circuit breaker and #506 lineage.
This PR establishes the governor invariant, not a claim that every historical
workflow already uses it.
