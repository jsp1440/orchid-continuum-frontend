# PaperBotanica frontend Phase 2

Bounded maker repair child of PR #958 at `08aa8991fe0d6ec239f7e666df29c021319fddfc`; Kimi retains the authoritative branch. Paired backend starting head: `f11e451734747a0cce12d38e2deec6cf46fa853c`. No merge or deployment.

Fixed: incomplete collection/profile parsing, orphan provenance, unreviewed raw PNG loading, stale package results after species changes, GLB accessor overreads, unsupported independent position buffers, keyboard controls, metre-scale framing and Y-up view rotation. The authenticated route inventory now includes `/paperbotanica`, repairing the reproduced route-policy CI failure. Species Dossier links use its existing canonical-subject helper and the gallery selects by exact profile/accepted name. Unknown species show an explicit unsupported message. No canonical taxon ID is invented.

Validation: 31 committed source/route tests pass, plus one transient test consuming all eight actual backend profile payloads (32 total); ESLint on changed source, focused TypeScript and a feature-only Vite build pass. See `docs/evidence/paperbotanica-phase2/` for logs and source blob hashes. Node 24.22.1, React 18.3.1, TypeScript 5.5.3, Vitest 3.2.6, Vite 5.4.21. DOM regression used jsdom 26.1.0, while the repository requests jsdom 30.x. Full repository tests/build, a real-browser journey and hosted acceptance remain UNVERIFIED; this was a partial source checkout. Original focused feature suite: 5 passed; combined baseline with route policy: 10 passed, 1 route classification failure. Hosted #958 had 2 failed tests / 3728 passed / 2 skipped; scheduler expectation was not changed or independently reproduced on main.

```sh
npm test -- src/features/paperbotanica src/lib/routeAccessPolicy.test.ts
npx eslint src/features/paperbotanica src/lib/routeAccessPolicy.ts src/pages/SpeciesDossier.tsx
npx tsc --noEmit --jsx react-jsx --target ES2021 --module ESNext --moduleResolution bundler --skipLibCheck --types vite/client src/features/paperbotanica/*.tsx src/features/paperbotanica/*.ts
npx vite build --config verification/vite.paperbotanica.config.ts
```

The transient producer-payload compatibility fixture is not a second production registry. Regenerate it from backend `collection_payload()` and `profile_payload()` for contract checks. The canonical backend and owner-session transport remain unchanged.

Backend repaired profiles still contain HYPOTHETICAL geometry, unsupported diagnostic anatomy and untested paper joins. Every preview/download requires botanical-review state and digest; none is a publication approval. Candidate KG relationships remain model-only, with unresolved canonical taxon identity and no mutation. Separate independent checker, complete repository/browser validation, botanical review and physical assembly are required. Production readiness: NOT READY.
