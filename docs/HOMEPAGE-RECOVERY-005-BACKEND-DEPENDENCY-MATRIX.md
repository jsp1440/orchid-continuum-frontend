# HOMEPAGE-RECOVERY-005 — Homepage backend dependency matrix

Parent: #163  
Implementation lane: #168  
Converges: PR #161

This matrix describes the current public-homepage data path. A backend failure must never be presented as scientific absence.

| Surface / contract | Current classification | Evidence / action |
|---|---|---|
| `BACKEND_BASE_URL` / `OC_BACKEND_BASE` → `https://orchid-continuum-public-api.onrender.com` | WORKING_CANONICAL | Both public API clients resolve to the canonical public API by default. The endpoint-audit code incorrectly expected `ocBackend.ts` to use the legacy host; this lane corrects that audit expectation. |
| `/api/atlas/occurrences` | WORKING_CANONICAL after convergence | PR #161 identified the live frontend bug: several clients called bare `/atlas/occurrences`. This branch preserves #161 and uses the canonical `/api` route. |
| bare `/atlas/occurrences` on canonical public API | WRONG_HOST_OR_PREFIX | Legacy path leaked forward when the base host changed. Do not reintroduce it. |
| `/api/species/search` | WORKING_CANONICAL | Retained as a canonical lightweight status probe and species lookup contract. |
| `/api/homepage/genus/{genus}` | WORKING_CANONICAL / not yet wired to homepage | Existing #161 audit identified a real cacheable composite homepage contract with no current frontend caller. #166 should evaluate it as the preferred Featured Genus aggregate before preserving fragmented fetches. |
| `/api/genus/daily` | BACKEND_CONTRACT_GAP | #161 audit found the route absent on both canonical and legacy hosts. Do not use it as a backend-health signal. Existing fallback behavior must not be described as live backend data. |
| `/api/atlas/stats` | BACKEND_CONTRACT_GAP | #161 audit found it absent. Current `fetchGeneraCount()` falls back to a baked value; #167 must either replace the contract or label the fallback honestly. |
| `/api/mycorrhizal/stats` | BACKEND_CONTRACT_GAP | #161 audit found it absent. Current `fetchMycorrhizalStats()` returns a baked count on failure; #167/#169 must not present that fallback as current live evidence. |
| `/api/campaign/stats` | BACKEND_CONTRACT_GAP | #161 audit found it absent. It is removed from the canonical backend-status probes in this lane so an optional missing route cannot make the public database appear broken. |
| homepage `HomeAtlas` occurrence loading through direct Supabase `atlas_occurrences` | INTENTIONALLY_DEFERRED | Current homepage Atlas does not use PR #161's public API client; it pages Supabase directly through `orchidContinuum.ts`. #167 owns the thematic Atlas redesign and should converge onto a clear canonical data contract rather than adding more parallel paths here. |
| Featured Genus image/species fetch paths | INTENTIONALLY_DEFERRED | #166 owns convergence of PR #86, BUILD-039 image work, and the composite homepage genus contract. Do not create a third image/data pipeline in #168. |
| `/api/continuum/graph?genus=...` | UNAVAILABLE_WITH_HONEST_EMPTY_STATE pending contract verification | `ocBackend.ts` consumes it, but this lane did not find enough repository evidence to certify the deployed contract. #169 must verify the backend implementation before treating empty nodes as biological absence. |
| Public Calyx contextual state | INTENTIONALLY_DEFERRED | `/calyx` exists; #170 owns page-context wiring. This lane does not invent a new chat contract. |

## Convergence classifications

- PR #161 Atlas prefix repair — **CONVERGE**.
- Current endpoint health audit — **CONTINUE + REPAIR**: retain the mechanism, remove probes for known-missing optional routes, and stop flagging the canonical `ocBackend.ts` origin as legacy drift.
- Direct-Supabase homepage Atlas — **CONTINUE temporarily / hand off to #167**; do not expand.
- Featured Genus data/media — **hand off to #166**; inspect PR #86 before coding.
- Relationship graph — **hand off to #169** with explicit contract verification requirement.
- Public Calyx — **hand off to #170**.

## Changes in this lane

1. Preserve PR #161's `/api/atlas/occurrences` corrections.
2. Correct `endpointAudit.ts` so `ocBackend.ts` is expected to use the canonical public API, not the legacy host.
3. Remove `/api/genus/daily` from the startup health candidates because it is a known contract gap.
4. Replace the nonexistent campaign-stats status probe with the canonical homepage-genus composite probe.
5. Keep backend failure distinct from scientific no-data states.

## Remaining backend contract gaps

The missing stats/daily/campaign routes are not repaired by fabricating frontend values. If later lanes still require those contracts, they must create governed backend issues/PRs or redesign the UI around contracts that actually exist.
