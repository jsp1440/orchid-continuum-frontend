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
- No security or privacy blocker is known to be open as of the `r1-0930b`
  run.
  - Six were found and fixed after the `r1-refresh` acceptance; see "Security
    and privacy findings after acceptance".
  - A seventh was fixed after `r1-post-hardening`: member Matrix explanation
    rows could carry a withheld character's state. See "Hardening after
    `r1-post-hardening`".
- This is not a claim about production: production hosts cannot be reached from
  the build environment. Deployment, verification against production data and
  the listed decisions remain owner actions.

## Accepted integration identities

| Repository | Integration head accepted | Last acceptance run |
|---|---|---|
| Backend `jsp1440/orchid-calyx-backend` | `3db7cecb76f762ee64947b229349de63b2e5f7d8` | `r1-0930b`, 2026-09-30T10:17Z |
| Frontend `jsp1440/orchid-continuum-frontend` | `b9d7745a88b0bbbe0ba759b2ba88e13ba050fe8a` | `r1-0930b`, 2026-09-30T10:17Z |

Between 2026-09-27 and 2026-09-30 the owner lineage merged further work into
both integration branches: backend #1566 (decision fabric), #1547, #1642 (show-day QR, scan, class
results and judging lock), #1660, #1681 (Matrix corpus-first acquisition), #1688,
#1689, a `main` merge and `9ce07655`; frontend #678, #883, #884 and #886. The
`r1-0930b` run at 10:17Z re-verified Release 1 on the heads above:

- all 17 journey tests passed;
- the security spot-check had 0 failures;
- the member-token audit found no unexpected routes;
- axe findings are colour contrast only (rated serious), with none critical;
- J12 on a disposable local PostgreSQL 16 cluster (10:26Z) passed durability,
  with 0 security-check failures.

An independent audit of every route added between `fdc3ec8f` and `9ce07655`
found no release blocker: each show-day, judging and acquisition route returns
401 to anonymous callers, bogus bearers and wrong API keys, and a member cannot
trigger a paid acquisition. See owner gates 8–10 for what it did find.

The `r1-post-hardening` run at 05:44Z recorded J03 as **FAIL**. The harness
assertion expected "unavailable" or "not yet" and did not recognise the product's
outage copy, "Record not confirmed" / "Could not confirm". The harness assertion
(`r1-journeys.spec.ts`, local to this session) was widened to accept that copy;
the product did not change. J03 was then re-run alone at 05:53Z on the same two
SHAs and passed.

The `r1-post-matrix` run at 07:24Z used the widened assertion from the start. On
those two SHAs:

- all 17 journey tests passed;
- the security spot-check had 0 failures;
- the member-token audit found no unexpected routes;
- axe found 0 critical violations;
- J12 on a disposable local PostgreSQL 16 cluster (07:33Z) passed durability,
  with 0 security-check failures.

Frontend `00bac0b7` differs from `f31421a1` only in this document.

BE #1643 and FE #858, #859 and #860 were merged to `main` earlier on 2026-09-26, under the
owner-authorised sprint that preceded the Release 1 directive. They reached
integration through syncs BE #1644 and FE #862. Since then the owner merged BE
#1683, #1693 and #1694 to backend `main` (tip `46887089`, 2026-09-29), and
integration merged `main` at `16af5eea`. Frontend `main` is still `f59493ab`.
Both `main` tips are ancestors of integration. Merging
`oc-autonomous-integration` into `main` is owner-gated.

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
  | BE #1644, #1647, #1649, #1650, #1663, #1664, #1671, #1674, #1675, #1677, #1678, #1680, #1695, #1696, #1697; FE #862, #868, #869, #870, #872, #873, #877, #879, #881 | Yes, before merge (session checker agents; #1647, #868, #869, #1678, #1695 and #1697 after repair rounds; #1650 after a PR-description correction) | `AUTO_INTEGRATE`, evaluated by the coordinator from the recorded checker verdict and exact heads | Coordinator | Tree identical to checked head, except BE #1675, #1695, #1697 and FE #869: clean merges of the checked head onto a base that had moved (tree equals `git merge-tree` of the checked head) |
  | BE #1646, #1648 | Yes, but after the owner had already merged them | Not evaluated | Owner | Blobs identical to checked head |
  | BE #1666, #1672, #1673; FE #874, #875, #876 | No checker verdict recorded in this document before merge | Not evaluated | Owner lineage | Second parents match the PR heads; covered by the `r1-post-hardening` run |
  | BE #1676 at `b0f410ad`; FE #878 at `0a68e841`; FE #880 at `93bdff3f` | Independent check **FAILED** at these heads | Not evaluated | Owner lineage, after the FAIL | Repaired by BE #1677, FE #879 and FE #881 |
  | BE #1679 at `aa8207db` | Not checked at the merged head: the owner lineage added two commits to the maker head `124d02b7` and merged before the verdict; the check of `124d02b7` then FAILED | Not evaluated | Owner lineage, before the verdict | Repaired by BE #1680 |
  | BE #1645; FE #856, #861, #864, #865, #866 | Owner's own lineage: exact-head CI plus the readback in the PR comments; no independent checker record from this session | Not recorded | Owner | Blobs identical (FE #865, #866 verified by this session) |
  | BE #1643; FE #858, #859, #860 | Yes, before merge | Not applicable: these merged to `main` under the earlier owner-authorised sprint, before the Release 1 directive, and reached integration only through syncs #1644 and #862 | Coordinator | Tree/blobs identical |

  All merges appear on GitHub under the same account, so "merged by" comes from
  this session's own merge calls, not from GitHub's `merged_by` field.
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
| 13 | Mobile / tablet + accessibility | **PASS** (tested core routes) | No sideways scroll at 390 or 820; the menu, skip link and Tab order work; controls have accessible names; axe (WCAG 2 A/AA) finds 0 critical violations on 10 core routes at both widths; the only findings left are colour contrast, rated serious | — | FE #866; FE #875 `b002ef10` → `7f5f79c6`; FE #876 `87fb969a` → `4d45fd99` | — |
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
integration. The `r1-post-hardening` security spot-check probes the route-guard
fixes: anonymous requests get 401; members get 403, except 401 on the Mission
Control chat routes (owner or API key, `verify_owner_or_api_key`) and on
`GET /api/shows` (API key only, `verify_api_key`); and no refused body contains
the data keys the check looks for. The constant-time comparisons, the redaction and the
malformed-input handling rest on unit tests, not on the harness.

| Finding | Exposure before the fix | Fix (PR, exact head → integration) |
|---|---|---|
| `GET /api/feedback` had no authentication | Anyone could read every visitor feedback row, including free text and organization ids | BE #1672 `a07c515c` → `66d00531` |
| `/api/shows/{id}/contacts` had no authentication | Anyone could read contact names, emails, phones and cities, and add contacts | BE #1674 `5c608749` → `8af17fcf` |
| Mission Control chat transcript, messages and replies had no authentication | Anyone could read and append to the transcript | BE #1674 `5c608749` → `8af17fcf` |
| calyx_core show management had no authentication | Anyone could read integration secrets (`config_json`), volunteer tokens and uploader emails; create webhooks, templates and events; inject lines into the ICS export | BE #1675 `c1840260` → `32c911b0`; hardening BE #1676 `b0f410ad` → `3b9f0203`, repaired by BE #1677 `823c299a` → `b4adfae2` |
| Non-constant-time secret comparisons; non-ASCII credentials crashed with 500 | Timing side-channel on several keys; server errors | BE #1671 `7c0f7b23` → `916b7f8a`; BE #1673 `90147ef2` → `785a6a4f` |
| Undecodable request bodies returned 500 on JSON routes | Server errors | BE #1671 `7c0f7b23` → `916b7f8a`, extending BE #1666 `243800b1` → `f93cee37` (malformed Unicode), which was already the `r1-refresh` head |

**Two merges landed code that had failed its independent check.** BE #1676 merged
at `b0f410ad`, which carried a quadratic ReDoS in secret redaction (the #1677
commit measured about 37 s for a 64K uppercase key); BE #1677 repaired it. FE #878 merged
at `0a68e841`, which carried raw Trojan-source bidi control characters in a test
file and a caret regression; FE #879 repaired it and added a repository guard
test that fails on any Unicode format character in text source files under
`src/`, `e2e/` and `scripts/` (it skips dot-directories, `node_modules` and
`dist`).
Both repairs passed an independent check on the exact head with CI green, and
integration holds exactly the checked merge.

### Hardening after `r1-post-hardening`

| Change | What it closes | PR, exact head → integration |
|---|---|---|
| Owner-only secret redaction | HTTP Digest `response`/`cnonce`, `curl -u`/`--user` passwords (including partly quoted, multi-line and over-long values), secret header lines and flat header lists | BE #1678 `3ce06f63` → `a0dc23a8` (checker FAIL twice, PASS on the third head) |
| Member Matrix locality screen | Common forms (not all; see Post-Release-1 items) of: coordinates without degree signs (DMS with prime marks, hemisphere letters, comma decimals, en-dash signs), UTM/MGRS, plus codes, labelled geohashes, Spanish/Portuguese/French locality words, collector abbreviations, elevation character ids such as `elev_m`/`alt_m`, and full-width or zero-width disguises | BE #1679 `aa8207db` → `eaa9d363`; repaired by BE #1680 `23e5b5a7` → `fdc3ec8f` |
| Member Matrix explanation rows | **A member-facing leak:** an explanation row kept the registry-authored `candidate_state` (for example an elevation range) even when its character id was withheld, or when the row had no character | BE #1679 and BE #1680 |

Elevation-labelled Matrix characters and their states stay withheld from members; see owner gate 7.

### Hardening after `r1-post-matrix`

| Change | What it closes | PR, exact head → integration |
|---|---|---|
| Show-day judging lock | While a show is locked, every show-scoped judging, entry and award write and show deletion returns 409 until the owner unlocks it; event status is forward-only; judge assignments must match the event's show and class; the legacy results route withholds exhibitor names for blind events | BE #1695 `960e4758` → `b5770464` (checker FAIL twice, PASS on the third head) |
| Acquisition ledger time zones | Stored and caller times compared in UTC; a non-UTC caller time no longer stores a lease early and hands out a duplicate paid Firecrawl lease; test fixtures no longer fail by import order | BE #1696 `6bfa14f7` → `3bd21a1d` |
| Acquisition ledger fencing | A random lease token fences `complete()` and `fail()`, so a stale worker cannot clear a live holder's lease; takeovers compare and swap on the token; retries are bounded; under ordinary contention a paid result is never discarded or marked failed (see Post-Release-1 items for the database-error cases) | BE #1697 `5488349d` → `3db7cecb` (checker FAIL once, PASS on the second head) |

All three were checked on the exact head and merged by the coordinator after
`AUTO_INTEGRATE`; each merged tree equals the checked merge.

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

7. **Elevation for members.** Member Matrix views withhold elevation-labelled
   characters and their states. Allowing a coarse
   elevation-band character in Matrix identification needs an owner and
   scientific decision on whether to allow it and on the band vocabulary.

8. **Show-day judge sign-in (before judges use devices).** Judge identity is
   only an `X-Judge-Id` header behind the shared `CALYX_API_KEY`, which is also
   the owner-tier key. Anyone holding it can read and write any judge's
   scores, read every exhibitor's and judge's contact details, and call owner
   routes, including the paid acquisition. Never put that key on show devices.
   Per-judge signed tokens and a separate show-day key need your design
   decision; #1642 lists them as deferred. The same decision covers blind
   judging: a blind event's plant list still returns `exhibitor_id`, which
   `GET /api/exhibitors` resolves to a name. This also applies to `main`.
9. **Acquisition ledger table.** No migration or startup step creates
   `acquisition_ledger`, which now has a `lease_token` column. Against a table
   without it, acquisition fails closed with no provider call. Creating it in
   production is a database decision.
10. **CI coverage and `main`.** No workflow runs the acquisition-ledger tests on
    push to integration, which is how their earlier failures went unseen;
    adding one is a workflow change. On `main`,
    `app/source_federation/acquisition_ledger.py` has a syntax error; nothing
    imports it at startup, so the app still starts.

## Post-Release-1 items (recorded, not blocking)

- Matrix member views:
  - lint registries when they are authored;
  - screen forms not yet covered: DMS written out in words in Spanish, Portuguese
    or French, lowercase hemisphere letters after a bare number (`18.9s`),
    unlabelled geohashes, single comma-decimal values, `herbier`/`exsiccata`,
    run-together ids (`elevm`, `ELEVmax`), combining marks and homoglyphs,
    lowercase MGRS (`33twn1234567890`), `18d55mS`, French `au-dessus du niveau
    de la mer`, Spanish `ejemplar` and `altura`, German `hoehe`, and `alt m` /
    `Alt [m]` labels;
  - numeric states of a non-withheld character cannot be screened without
    semantics, so registries must not carry locality in numeric states.
- Dossier resolution needs a synonym source.
- When the species services are down, every dossier, including a known
  taxon's, shows "Record not confirmed" with a retry. That is honest, but known
  taxa would need a cached or bundled taxon index to still render.
- Colour-contrast findings (axe, serious) need a design-system decision: Lexicon
  green `#4A7C59` headings, muted `#7a7466` on dark Species/Atlas pages, and
  `text-white/40` on `/conservation`.
- Remaining redaction gaps in owner-only views: an unterminated quote in one
  `curl -u` value can expose part of a later `-u` password in the same string;
  an unquoted `\` line continuation inside a `-u` password exposes the part
  after the break; HTTPie `-a user:pw`; odd-length or nested flat header lists;
  Digest values stored under a non-secret key.
- Show-day: `POST /api/awards` accepts a nonexistent entry (orphan award);
  `create_criterion` and `create_exhibitor` are global and not locked; writes
  to a closed but unlocked event are allowed.
- Acquisition ledger: after three consecutive database errors that follow a
  paid success, the result is logged but not recorded, and the key can be paid
  again after its 120 s lease; a non-transient database error after a paid
  success is not retried and could re-pay every 120 s (no such error was found
  reachable in the current service path); consumer-list bookkeeping can drop a name on
  SQLite.
- A richer local PostgreSQL harness.
