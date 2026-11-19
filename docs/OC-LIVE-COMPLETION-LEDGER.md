# Orchid Continuum Completion Ledger

This integration slice adds a read-only Mission Control ledger backed by a durable GitHub state snapshot.

## Canonical feed

The dashboard reads:

`https://raw.githubusercontent.com/jsp1440/orchid-continuum-frontend/oc-live-ledger-state/public/data/oc-live-completion-ledger.json`

The browser polls that snapshot every 15 seconds with cache bypass. The generated timestamp is displayed and an old snapshot is explicitly marked stale.

## Evidence semantics

- `oc-running`, `oc-queued`, `oc-owner-gate`, and `oc-blocked` labels populate current execution state.
- A closed `oc-done` issue is a completion receipt, not proof that a production journey is currently healthy.
- Only completion receipts with both a stable GitHub reference and evidence URL contribute to the evidence-linked count.
- Older manually seeded receipts remain visible for audit history but do not contribute to that count when they lack an evidence link.
- Queue admission, planning, or a draft never increases the completion count.

## Refresh boundary

`scripts/generate-live-completion-ledger.mjs` is a provider-free deterministic generator. It can refresh the JSON and CSV mirrors when run with GitHub read access.

Automatic scheduling and publication to the state branch are protected workflow changes and are intentionally not part of this integration PR. Until an owner authorizes that workflow boundary, the UI reports the snapshot age instead of promising a reconciliation cadence.

No production deployment, main merge, credential mutation, scientific/taxonomy activation, paid provider call, or destructive operation is implied by this feed.
