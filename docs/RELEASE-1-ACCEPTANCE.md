# Orchid Continuum — Release 1 Acceptance

Living record of the finite Release 1 acceptance matrix. Release 1 is judged on
`oc-autonomous-integration` in both repositories. It is ready when every
required journey is **PASS**, **OWNER_GATED**, or deliberately **DEFERRED**, with
no unresolved P0 engineering blocker or security/privacy blocker.

Statuses:

- **PASS** — the currently testable Release 1 contract works.
- **OWNER_GATED** — engineering is complete to the safe boundary, but an owner
  decision or production-only action is required.
- **FAIL** — an engineering blocker remains.
- **DEFERRED** — not part of Release 1 and no Release 1 journey depends on it.

## Evidence method and limits

- The real backend is run locally without a production database, provider/model
  keys, owner secrets, or production mutation. The frontend production bundle
  is driven in Chromium against it.
- GitHub CI is required on each exact persisted PR head before integration.
- After merge, changed blob identities are read back from
  `oc-autonomous-integration` and compared with the verified head.
- Fixture-backed browser tests are useful for UI contracts but are not
  production-data evidence.
- This report does not claim a production deployment. External services and
  production data must be verified separately under owner authorization.

## Integration identities

| Repository | Current tested integration identity | Evidence |
|---|---|---|
| Backend | `807746b9bf4c31e9a2c93097bac387e4f554269c` | PR #1646 exact head `3c12bce97ceed126375f47a192e40fcff5ca3f0e`; 2 required workflows green; 5/5 changed blobs identical after merge |
| Frontend | `c204ec5bb92eaaeab277034a8f089a522fbf8224` | PR #866 exact head `0fb3477c21771dc389c793d505a21fad1feef163`; all applicable workflows green; 12/12 changed blobs identical after merge |

The frontend identity contains PR #862 (main-to-integration convergence), PR
#865 (J3/J4/J7/J8 honest states), and PR #866 (J1/J13/J14). The backend identity
contains PR #1645 (member trait privacy) and PR #1646 (J12 API contract).

No merge to `main` is authorized by this record.

## Matrix

| # | Journey | Status | Current evidence | Exact lineage | Remaining blocker |
|---|---|---|---|---|---|
| 1 | Launch + primary navigation | **PASS (local)** | Lexicon, Literature, and Orchid Identification are linked from site navigation and footer; guarded routes remain guarded | FE #866: `0fb3477c…` → `c204ec5b…` | Production deployment not claimed |
| 2 | Authentication / member | **PASS (local stand-in)** | Sign-up/account/sign-out and guarded member reads work with the local Supabase stand-in; trait output fails closed for locality | BE #1645: `d70ea7ed…` → `a7e254de…`; FE #858/#862 | Owner must configure and verify production Supabase settings |
| 3 | Species search + taxon pages | **OWNER_GATED (external verification)** | Search failure is no longer reported as zero matches; the UI shows an honest unavailable state and retry | FE #865: `e3315afc…` → `b092ada5…` | Verify orchid-continuum-public-api and production data |
| 4 | Matrix identification | **OWNER_GATED** | 401/403, expired-owner-session, and outage states are distinct; raw API text is not shown | FE #865: `e3315afc…` → `b092ada5…` | Decide whether Release 1 Matrix access is public, member, or owner-only |
| 5 | Image-based identification | **DEFERRED** | No visitor photo-identification journey is declared for Release 1 | — | Post-Release-1 unless explicitly promoted |
| 6 | Lexicon / Illustrated Glossary | **PASS (local, no data)** | Home, A–Z, search, entry, not-found, and migration fallback render; phone header fits tested widths | FE #866: `0fb3477c…` → `c204ec5b…` | Production data not claimed |
| 7 | Literature + evidence | **PASS (local, no data)** | Anonymous gate and member paper-list contract work; gate copy accurately distinguishes list from owner-only full-paper access | FE #865: `e3315afc…` → `b092ada5…` | Full-paper access remains intentionally limited |
| 8 | Research Station | **OWNER_GATED** | Member traits are privacy-safe; project refusal is shown as owner-only and the page claims live data only after load | BE #1645; FE #865 | Decide whether research projects become member-readable |
| 9 | Atlas / distribution | **OWNER_GATED (external verification)** | Empty/no-data states are honest and no protected coordinates are rendered in the local harness | Existing integration | Verify production public API/Supabase data |
| 10 | Conservation information | **PASS (local, no data)** | Missing assessment is shown as not yet assessed; no conservation category is invented | Existing integration | Production data not claimed |
| 11 | Calyx / Brain interactions | **OWNER_GATED (Speak)** | Homepage/capabilities/reasoning surfaces render; backend outage is named without raw browser exceptions | FE #866 | Decide member access to Calyx Speak |
| 12 | Contextual feedback / correction | **OWNER_GATED (member submission)** | Frontend and backend now share `/api/evidence-feedback`; exact-version registration, repeat feedback, and duplicate suppression work; conflicting lineage fails closed | BE #1646: `3c12bce…` → `807746b9…`; FE #856/#861 | Decide whether signed-in members may submit; owner/API-key access remains unchanged |
| 13 | Mobile / tablet + accessibility | **PASS (tested core routes)** | No sideways scrolling across the tested Release 1 routes at 390px; Lexicon controls fit at 320/360/390/414/820 and have accessible names | FE #866 | Broader formal accessibility audit is post-Release-1 |
| 14 | Failure states | **PASS (local)** | Backend-down, HTTP failure, auth refusal, and missing-data states are plain-language; raw `TypeError: Failed to fetch` is suppressed | FE #865/#866 | Production outage behavior not yet observed |

## Owner decisions remaining

1. Matrix access: public, signed-in member, or owner-only.
2. Feedback submission: keep owner/API-key only or permit signed-in members.
3. Research projects and Calyx Speak: retain owner-only or define a safe member
   contract.
4. External services: authorize production verification for species search and
   Atlas data.
5. Deployment: authorize and perform the Render/Supabase production deployment
   and environment configuration when ready.

An owner gate affects only its journey. It does not block continued work on
other eligible Release 1 journeys.

## Post-Release-1 items

- Remaining noncritical navigation buttons can become semantic links in a
  separate bounded change.
- `/api/media/genus/{g}` should return an honest unavailable status rather than
  500 when its database is absent.
- Unknown dossier taxa need a dedicated unknown-taxon presentation.
- Research Center query building remains incomplete.
- Provision a richer local PostgreSQL harness.
- Expand accessibility evidence beyond the tested core journeys.
- Move the file-backed evidence-feedback store to owner-approved durable
  storage before relying on it across ephemeral redeploys.
