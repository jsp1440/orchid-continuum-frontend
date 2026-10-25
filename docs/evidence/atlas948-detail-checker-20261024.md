# #948 Atlas selection-identity child — scoped checker receipt

October 24, 2026 PDT. Tested child535f56b81d23d0d4d6291f9bc29fcdcd1a939b56, sole parentc97385dfb39f38eeae9395f940cc2ea04324b33f. Canonical #948 remainscd9b2aaa60edff079c47c1e472978f323ad9b8e7.

Codex root did not author535f or its new test. Root authored earlier empty-media childe2b in this ancestry, so this is independent of the selection-detail repair only, NOT independent whole-stack acceptance. Shared jsp1440 does not authenticate different principals.

Source compare1ahead/0behind/exactly2paths: page d62119f48d6f70dfb67540c5736f065e04e23a11 and supplied testd0aaad4b7aaf56b9e85be0d64b0dde0aa2f8ccf0. Page renders detail only for matching selected occurrence, clears previous detail on a new request, retains cancelled-response protection. No map projection/filter/rights/auth/source-admission contract change in this delta.

NEW checker scenarios (fixture scaffolding adapted from the committed test, assertions/scenarios newly added):
1. Mock-map callback selects B after resolved A: A detail/photo/taxonomy link withheld; resolving B restores B fields/link.
2. Close while A pending: late A cannot resurrect card; subsequent B remains independent.
3. Select A again after resolved B: B evidence immediately withheld, including when the new A result is absent.

Actual Node24.22.1/npm11.9.0, React/DOM18.3.1, Router6.30.4, Vitest3.2.6, jsdom30.0.1, Vite5.4.21, NO_API_MODE=true PROVIDER_AUTHORIZED=false:
- Same NEW3 cases on exact parent page891d791b2a5ddbd751b13ef7800290a99f86e74d:2FAIL/1PASS,1.13s; failures show stale ResolvedA/B.
- Restored exact child:3PASS/0SKIP,1.16s (241ms tests). An initial child3PASS established valid fixture before baseline switching; final restored control passed. These are one three-case suite, not6distinct passing cases.
- Supplied maker3cases, old18/137/full build/type/lint/static suites NOT rerun.
- npm ci --ignore-scripts --no-audit --no-fund installed533packages from canonical locka0289854c12f9197261cdabcdc3ef446343ad64f. No package/config edits.
- Original Atlas, AtlasFilterProvider and locality projection execute; services are synthetic deferred DTO mocks, map/UI inert mocks, fetch fenced. This is real React DOM/router component execution, NOT original service/real map/browser/live backend acceptance.

Twenty canonical source/config/package blobs Git-framedSHA1 verified before baseline substitution and after restoration (see manifest).
Sorted blob/path manifestSHA2567ca1137f3fb3c7d1973b904850fc307919c5a6cf597a7933c1ab875da758f859.
Checker harnessSHA256fe3c8b5515b51732b152f3305a5fe7aab8826e2b2cdcffd8039a8eafae42e6d3.
Parent logSHA2563c02977050f7ef7ce09094878b1fa8704c4bf8e294244082b2e841ddafc9fe95.
Final logSHA2561e2caaa8b0e3e9fe29db4b17d12b22f8fc064b1df27b191333142f1239a7dc93.
Partial materialization, no full Git checkout or fake history.

Reproduce: copy this evidence's atlas948-detail-checker.tsx to repository-root reviewer-additional.test.tsx, then:
NO_API_MODE=true PROVIDER_AUTHORIZED=false node node_modules/vitest/vitest.mjs run reviewer-additional.test.tsx --pool=forks --maxWorkers=1 --minWorkers=1

Scoped child SOURCE/COMPONENT acceptance only. Canonical finding stays open until owner adoption/final-tree checks. Existing active review, hosted/visual/Google/producer/base/deployment/privacy/scientific gates remain. No product edit, head movement, review retrigger, merge/deploy, credential/provider/DB or suspended-service action. This evidence-only branch is not a new product PR or adoption destination.
