# Orchid Continuum — Release 1 Acceptance Ledger

This is the authoritative record of the Release 1 acceptance matrix. Release 1 is
judged on `oc-autonomous-integration` in both repositories. It is accepted when
every required journey is **PASS**, **OWNER_GATED** or **NOT APPLICABLE**, and no
engineering (P0) or security/privacy blocker remains open.

Statuses:

- **PASS**
- **FAIL/REPAIRING**
- **OWNER_GATED**: engineering is complete up to the safe boundary; an owner
  decision or production action remains.
- **NOT APPLICABLE**: not a Release 1 surface, and no Release 1 journey depends
  on it.

## Disposition

**Release 1 is ACCEPTED on `oc-autonomous-integration`, on local evidence, with
the owner gates listed below.**

- No journey is FAIL.
- No security or privacy blocker is open as of the `r1-post-hardening` run.
  Six were found and fixed after the first acceptance; see "Security and
  privacy findings after acceptance".
- This is not a claim about production: production hosts cannot be reached from
  the build environment. Deployment, verification against production data and
  the listed decisions remain owner actions.

## Accepted integration identities

| Repository | Integration head accepted | Last acceptance run |
|---|---|---|
| Backend `jsp1440/orchid-calyx-backend` | `b4adfae2e9ee48158aeac8b752a15686b9dd915a` | `r1-post-hardening`, 2026-09-27T05:44Z |
| Frontend `jsp1440/orchid-continuum-frontend` | `f31421a1f4e2c3dafeb791e5f40c3d94a0a0d2aa` | `r1-post-hardening`, 2026-09-27T05:44Z |

BE #1643 and FE #858, #859 and #860 were merged to `main` earlier on 2026-09-26, under the
owner-authorised sprint that preceded the Release 1 directive. They reached
integration through syncs BE #1644 and FE #862. Nothing has changed `main` since
the directive: main tips are backend `f6f1c04` and frontend `f59493ab`, both
ancestors of integration. Merging `oc-autonomous-integration` into `main` is
owner-gated.

## How the evidence was produced

- **Local end-to-end harness.**
  - The real backend runs locally under uvicorn from the exact integration SHA.
    It has no production database, no provider/model keys and no owner secrets.
  - Each run generates its own throwaway local API key and owner code.
  - The frontend production bundle is built from the exact integration SHA,
    served with `vite preview`, and driven in Chromium by Playwright.
- **Local stand-ins.**
  - Supabase identity is a local stand-in.
  - The public species API and the image services point at a closed port, so
    they count as unavailable.
  - Matrix data is a registry clearly labelled SYNTHETIC.
  - J12 durability was also run against a disposable local PostgreSQL 16 cluster.
- **Security spot-check.**
  - Every run signs up two throwaway members and probes member, anonymous and
    owner access with curl.
  - A member-token audit logs every Calyx request that carries a member token
    and checks it against the allowed routes.
- **Per-PR gates.** Exact-head CI was green on every listed head. How each
  merge was checked and integrated differs by PR:

  | PR(s) | Independent checker on exact head | Factory gate | Merged by | Post-merge readback |
  |---|---|---|---|---|
  | BE #1644, #1647, #1649, #1650; FE #862, #868 | Yes, before merge (session checker agents; #1647 and #868 after a repair round; #1650 after a PR-description correction) | `AUTO_INTEGRATE`, evaluated by the coordinator from the recorded checker verdict and exact heads | Coordinator | Tree identical to checked head |
  | BE #1646, #1648 | Yes, but after the owner had already merged them | Not evaluated | Owner | Blobs identical to checked head |
  | BE #1663, #1664, #1666; FE #869, #872, #873 | Exact-head CI and focused negative/live controls recorded on each PR | Not recorded in this document | Owner | Clean integration merges; #1666 verified as a whole-tree identity |
  | BE #1645; FE #856, #861, #864, #865, #866 | Owner's own lineage: exact-head CI plus the readback in the PR comments; no independent checker record from this session | Not recorded | Owner | Blobs identical (FE #865, #866 verified by this session) |
  | BE #1643; FE #858, #859, #860 | Yes, before merge | Not applicable: these merged to `main` under the earlier owner-authorised sprint, before the Release 1 directive, and reached integration only through syncs #1644 and #862 | Coordinator | Tree/blobs identical |

  Checker PASS records and gate results for the coordinator-merged PRs live
  in this session's transcript, as checker subagent reports and gate tool
  output, not in GitHub comments. The factory gate takes the checker verdict
  and heads as inputs, so it confirms policy eligibility, not independent proof.
- **Evidence strength.** Results below are local, with no production data,
  unless stated. The fixture-backed Playwright suites in CI are a second, weaker
  layer.

## Journey ledger

| # | Journey | Final | Frontend evidence | Backend evidence | Lineage (PR, exact head → integration) | Security / privacy |
|---|---|---|---|---|---|---|
| 1 | Launch + primary navigation | **PASS** | All 7 primary nav items open the right page and are real links with `aria-current`; Lexicon, Literature and Identification are linked from nav and footer | Home widget returns 503, not 500, with no database | FE #866 `0fb3477c` → `c204ec5b`; FE #875 `b002ef10` → `7f5f79c6`; FE #876 `87fb969a` → `4d45fd99`; BE #1649 `f20c4501` → `d65aa007` | Guarded routes stay guarded |
| 2 | Authentication / member | **PASS** (local identity stand-in) | Sign-up, account, sign-out and the gate work; a wrong password gets an honest error | Members can read exactly 4 schema-defined GETs and use 7 member Matrix routes | BE #1643 (main `f6f1c04`), synced by #1644 `00e62860` → `1d7e35d1`; BE #1645 → `a7e254de`; FE #858 (main `35d6df2`), synced by #862 `03adf883` → `8a66ef7b` | Trait output fails closed on locality; the locality test was made deterministic in BE #1648 `20321ffd` → `92e381c5` |
| 3 | Species search + taxon pages | **OWNER_GATED** (verify production data) | A search outage shows "Search unavailable", not "0 results"; a known taxon's dossier degrades honestly; a positively confirmed unknown taxon shows "No taxon record found", while an outage says "Could not confirm" with retry; `/species?q=` is shareable and prefilled from dossier links, with bidi/format characters removed | Search, dossier taxonomy and Atlas data come from the separate public API and Supabase, which cannot be reached from here | FE #865 `e3315afc` → `b092ada5`; FE #869 `247edb9c` → `c42d892b`; FE #877 `2cfee189` → `91fcf7bc`; FE #879 `060563c3` → `f31421a1` | No locality rendered; absence is claimed only with positive evidence from every applicable source |
| 4 | Matrix identification | **PASS** | Anonymous visitors get a sign-in prompt; a member goes registry → session → answers → ranking → explanation; member B gets 404 on member A's session; owner-only panels are shown as owner-only | Members use their own sessions on 7 routes; every other Matrix route returns 403; member responses follow a fixed schema and planted locality is withheld | BE #1647 `7613ed03` → `3fb6a92a`; FE #868 `0ba7c363` → `6264d82a` (supersedes #867) | The member-token audit found tokens only on allowed routes, none unexpected; no paid model calls for members |
| 5 | Image-based identification | **NOT APPLICABLE** | Release 1 has no visitor photo-identification journey | Matrix vision routes return 403 to members | — | — |
| 6 | Lexicon / Illustrated Glossary | **PASS** (local, no data) | Home, A–Z, search, entry and not-found work; the migration fallback is disclosed; the header fits at 320–414px | `/api/lexicon` returns 503 without a database | FE #866 | — |
| 7 | Literature + evidence | **PASS** | Anonymous visitors get a sign-in gate with accurate copy; a member's paper-list request carries the member token and loads | Papers list returns 200 for members; paper detail returns 403 | FE #865; BE #1643 | Full paper text stays owner-only |
| 8 | Research Station | **OWNER_GATED** (member access to projects) | Member traits load; projects show "owner access only"; the "live data" badge appears only after data loads | Traits return 200 for members; all 25 project, scientific-memory, epistemic-memory and project-ledger routes fail closed with 403 `OWNER_ACCESS_REQUIRED` before validation or lookup | FE #865; BE #1645; BE #1666 `243800b1` → `f93cee37` | Trait locality fails closed; project existence is not disclosed |
| 9 | Atlas / distribution | **OWNER_GATED** (verify production data) | Honest empty states; no coordinates on any page | Served by the public API and Supabase | Existing integration | No coordinates rendered |
| 10 | Conservation information | **PASS** (local, no data) | Shows "Not yet assessed"; no category is made up | — | Existing integration | — |
| 11 | Calyx / Brain interactions | **OWNER_GATED** (member access to Speak) | Reasoning map, homepage and capabilities render; outages get a plain-language message | Speak conversations are owner-only | FE #866 | — |
| 12 | Contextual feedback / correction | **PASS** for owner submission and review; member submission **OWNER_GATED** | Anonymous visitors get honest sign-in copy; owners can list cases, inspect exact object versions and append decisions; duplicate clicks and stale case-detail races are suppressed | Frontend and backend share `/api/evidence-feedback`; cases survive restart; the owner-only review API supports reject, governed-review routing and bounded trivial correction without publishing to the knowledge graph | BE #1646 `3c12bce9` → `807746b9`; BE #1650 `86eabee0` → `88e57957`; BE #1663 `902faf88` → `95edfe01`; BE #1664 `d1da6eea` → `36d0e4c1`; FE #856, #861, #872 `37d18a1a` → `ca494111`, #873 `35285e5b` → `f2f57473`, #876 `87fb969a` → `4d45fd99` | Review is owner-session-only; actor references are keyed and opaque; nested identity keys are stripped; decisions remain append-only and non-publication |
| 13 | Mobile / tablet + accessibility | **PASS** (tested core routes) | No sideways scroll at 390 or 820; the menu, skip link and Tab order work; controls have accessible names; axe (WCAG 2 A/AA) finds 0 critical violations on 10 core routes at both widths, with only near-4.5:1 colour-contrast findings left | — | FE #866; FE #875 `b002ef10` → `7f5f79c6`; FE #876 `87fb969a` → `4d45fd99` | — |
| 14 | Failure states | **PASS** | Backend down, API 500, auth failure, unknown route and Supabase down all show honest states; no raw error text; unknown-taxon absence is distinguished from service failure | Widgets return 503 with stable error codes; malformed Unicode and non-finite JSON values return renderable 422 responses instead of 500 or connection reset | FE #865, #866, #869; BE #1649; BE #1666 `243800b1` → `f93cee37` | Unrenderable or oversized validation inputs are sanitized or omitted; ordinary 422 bodies remain compatible |

### Security and privacy result

Every run confirms that a signed-in member gets 403, and never data, on all of these:

- candidate knowledge;
- evidence aggregation, except health and registry;
- Matrix reports, vision, contract and persistence;
- the literature coverage audit and paper detail.

With a member token, members can call exactly the 4 declared member-readable GETs
and the 7 member Matrix routes: 2 registry reads and 5 routes on their own
sessions. Public endpoints stay public to everyone. No coordinates appeared in the 3
member payloads probed (traits, papers, Matrix registry) or on any page the
harness rendered. Matrix session, evaluate and explain responses are covered by
the rendered-page check and by the backend's planted-locality unit tests.

Research projects now use the same default-deny member boundary as other
owner-only product routers: a verified member receives 403 `OWNER_ACCESS_REQUIRED`
before request validation or project lookup, so project existence is not disclosed.

## Security and privacy findings after acceptance

The acceptance above stated that no security or privacy blocker was open. That
was not true at the time: the following were found after acceptance by
independent checkers, on the same integration branch. All are now fixed on
integration and confirmed by the `r1-post-hardening` run (anonymous 401, member
403, bodies contain only the refusal).

| Finding | Exposure before the fix | Fix (PR, exact head → integration) |
|---|---|---|
| `GET /api/feedback` had no authentication | Anyone could read every visitor feedback row, including free text and organization ids | BE #1672 `a07c515c` → `66d00531` |
| `/api/shows/{id}/contacts` had no authentication | Anyone could read contact names, emails, phones and cities, and add contacts | BE #1674 `5c608749` → `8af17fcf` |
| Mission Control chat transcript, messages and replies had no authentication | Anyone could read and append to the transcript | BE #1674 `5c608749` → `8af17fcf` |
| calyx_core show management had no authentication | Anyone could read integration secrets (`config_json`), volunteer tokens and uploader emails; create webhooks, templates and events; inject lines into the ICS export | BE #1675 `c1840260` → `32c911b0`; hardening BE #1676 `b0f410ad` → `3b9f0203`, repaired by BE #1677 `823c299a` → `b4adfae2` |
| Non-constant-time secret comparisons; non-ASCII credentials crashed with 500 | Timing side-channel on several keys; server errors | BE #1671 `7c0f7b23` → `916b7f8a`; BE #1673 `90147ef2` → `785a6a4f` |
| Malformed Unicode or undecodable bodies returned 500 on every JSON route | Crashes and dropped connections | BE #1666 `243800b1` → `f93cee37`; BE #1671 |

**Two merges landed code that had failed its independent check.** BE #1676 merged
at `b0f410ad`, which carried a quadratic ReDoS in secret redaction (a 65K
uppercase key took about 35 s per request); BE #1677 repaired it. FE #878 merged
at `0a68e841`, which carried raw Trojan-source bidi control characters in a test
file and a caret regression; FE #879 repaired it and added a repository guard
test that fails on any Unicode format character in `src/`, `e2e/` or `scripts/`.
Both repairs passed an independent check on the exact head with CI green, and
integration holds exactly the checked merge.

## Owner gates remaining

1. **Deployment.** Deploy both integration heads to Render and set
   `OC_SUPABASE_URL` and `OC_SUPABASE_ANON_KEY` (or the `OCU_*` fallbacks) on
   the backend. Whether to merge `oc-autonomous-integration` into `main` is your
   decision.
2. **Feedback storage in production.** With `DATABASE_URL` set, the first
   feedback request creates the schema `oc_evidence_feedback`. If the runtime
   role lacks CREATE:
   1. Run the `SCHEMA_STATEMENTS` from
      `app/evidence_feedback/postgres_repository.py` once, with a privileged role.
   2. Grant the runtime role, on `oc_evidence_feedback`: USAGE on the schema;
      SELECT, INSERT and UPDATE on all tables; USAGE on all sequences.
3. **Member feedback submission (J12): blocked engineering, needs owner permission.**
   You chose "members submit, owner reviews". The session's permission system refused
   the auth change, so the engineering is unfinished rather than awaiting a
   decision. A saved, unapplied partial patch exists. It stays owner-only until
   that change is permitted.
4. **Production data verification (J3, J9).** Species search, dossier taxonomy
   and Atlas data come from the public API service and Supabase tables, which
   need to be checked against the deployed services.
5. **Research projects and Calyx Speak (J8, J11).** Both stay owner-only unless
   you define a member contract.
6. **Trait tables.** Confirm the production trait tables hold no site-level
   locality traits: type locality, collection site, coordinates, fine elevation.

## Post-Release-1 items (recorded, not blocking)

- Matrix member views:
  - broaden the coordinate and abbreviation screening;
  - lint registries when they are authored;
  - registry character ids that mention elevation or altitude currently come out
    as "withheld".
- Dossier resolution needs a synonym source.
- When the species services are down, a known taxon's dossier also says the
  record is not confirmed; it cannot tell "unknown" from "unreachable" there.
- Colour contrast just under 4.5:1 needs a design-system decision: Lexicon
  green `#4A7C59` headings, muted `#7a7466` on dark Species/Atlas pages, and
  `text-white/40` on `/conservation`.
- Remaining redaction gaps in owner-only views: Digest `response=` in free
  text, `curl -u user:pw`, and header lists of 5 or more items.
- A richer local PostgreSQL harness.
