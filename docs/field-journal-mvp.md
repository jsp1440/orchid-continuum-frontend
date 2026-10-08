# Field Journal MVP — offline-first scientific field capture

Branch: `field-journal/offline-mvp`
Repositories: `jsp1440/orchid-continuum-frontend`, `jsp1440/orchid-calyx-backend`

## Scope

This MVP implements the approved capture flow as an additive layer on the existing Journey 5 field-observation contract:

`Photos → Location → Identification → Habitat & Ecology → Relationships → Notes & Save`

It does not create a parallel observation, occurrence, taxonomy, Atlas, media, or provenance system.

## Reused Orchid Continuum components

Frontend:

- `src/pages/CalyxField.tsx` — existing `/field` page, now backed by durable offline storage.
- `src/lib/backendConfig.ts` — Calyx origin allowlist and owner-session bearer transport.
- `src/lib/atlasLocalitySafety.ts` — existing public Atlas generalization policy; Field Journal does not weaken it.
- `src/contexts/AuthContext.tsx` — Supabase account boundary for the protected `/field` route.

Backend:

- `app/field_observation/routes.py` — authenticated `/api/field-observations` router.
- `app/field_observation/schemas.py` — `field-observations/v1` contract; rejects coordinate/locality keys.
- `app/field_observation/service.py` — durable record layout over the Research Station record store.
- `runtime/research_station_store.py` — `oc_admin.research_station_records` when `DATABASE_URL` exists; in-process memory otherwise.
- `app/calyx_flywheel/locality.py` — shared fail-closed sensitive-locality guard.
- `app/storage.py` — immutable content-addressed original-byte storage adapter.
- `app/security.py` — owner session / API key boundary.
- `darwin_core_export.py` — existing Darwin Core export posture: exact coordinates omitted unless explicitly authorized.

## Data contract: Field Journal → Orchid Continuum

Local durable record (`src/lib/fieldJournal.ts`) keeps the field source of truth on the iPad:

- durable local UUID: `FieldObservation.id`
- observer account boundary: `accountId`
- `observedAt`, `deviceCapturedAt`
- optional private capture location: latitude, longitude, accuracy, elevation, captured-at, and device-local locality notes entered in the Location step
- optional taxon label; absent means `identificationStatus = "unresolved"`
- observer certainty, habitat, substrate, ecology, associated organisms, pollinator and mycorrhizal notes, phenology
- original media blobs with SHA-256, capture timestamp, local id, upload state
- sync state: `local_only`, `queued`, `syncing`, `synchronized`, `failed`

Backend upload payload (`toFieldObservationUploadPayload`) is deliberately explicit and excludes private coordinates/locality notes:

- `client_draft_id` = local UUID → server idempotency key
- `observed_at` → Darwin Core `eventDate` direction
- `device_captured_at` → device capture timestamp
- `note` → free-form field notes
- `taxon_hint` → observer hint only; no invented taxon assignment
- `epistemic_certainty` → observer confidence/status, not a determination
- `locality_visibility` → governed disclosure class (`private`, `research_restricted`, `public`)
- `habitat`, `substrate`, `ecological_notes`, `associated_organisms`, `pollinator_observations`, `mycorrhizal_observations`, `phenology`
- `media[]` metadata only: name, size, type

Original media bytes then upload once per observation to `/api/field-observations/{id}/media`; the backend preserves bytes through `LocalImmutableStorage`, computes SHA-256, and attaches provenance idempotently by content hash.

## Offline and sync behavior

- Offline create/edit/save uses IndexedDB (`src/lib/fieldJournalStore.ts`), including original media blobs.
- The production app registers `public/field-journal-sw.js`, which caches the app shell and hashed static assets after the first online load so `/field` can reopen without a network.
- Closing/reopening the app reloads observations and media from IndexedDB.
- Save while offline → `local_only`; save while online → `queued`, then a sync attempt.
- Retry uses the same `client_draft_id`; backend `POST /api/field-observations` returns the existing record instead of duplicating it.
- Media retry uses the same SHA-256/content-addressed storage and `attach_photo` idempotency; re-uploading the same bytes does not create a second media record.
- Sync success never deletes the local original.
- Observation acceptance and every media receipt are checkpointed to IndexedDB before continuing. A partial retry reuses the accepted server id and skips media with saved durable receipts; local originals remain intact.
- A media upload succeeds only with the exact original SHA-256 plus a nonempty server media id and opaque storage key. Missing or mismatching receipts leave the observation unsynchronized.
- Reopening or returning to the page immediately makes interrupted `syncing` records retryable when no browser-owned Web Lock remains. The same exclusive lock covers sync, edits, deletion, durable checkpoints and recovery; an active tab is never reclaimed by age. Every attempt rereads IndexedDB under ownership, so stale cards cannot resend confirmed media or erase accepted receipts. Network requests time out after five minutes and preserve retry keys and originals. Recovery itself performs no network writes.
- Web Locks require a supported secure browser. If unavailable, synchronization and edits/deletion of existing drafts fail closed; new offline capture, reading, and export remain available. Closing a stalled tab releases its lock; a suspended but still living tab is never forcibly stolen.
- Editing any server-accepted record (including one with incomplete media upload) is disabled until an authenticated server-update contract exists. Local records not yet accepted by the server can still be edited.

## Device-local metadata export

Use **Export metadata** on one saved observation or **Export all saved metadata** for every saved observation in the signed-in device account, regardless of the search filter. Downloads work offline and do not contact the backend or change draft/sync state.

Default JSON downloads omit the structured private capture location, GPS, accuracy, elevation and locality notes. They retain observation notes, ecology, unresolved identification state, timestamps, local/server ids and photo/video metadata including hashes and accepted receipts. Account identity, private storage keys, media bytes and embedded EXIF are excluded.

Only select **Include private capture GPS and locality notes in this metadata backup** when you intend to save that sensitive location data privately. This explicit option adds the structured private capture location to the JSON. Treat both modes as private working copies: free-text notes and filenames may identify a site even when captured GPS is omitted. Neither mode is a public-safe Atlas projection, a media backup or an import/restore file. Original photo/video blobs remain on the device unchanged; preserve them separately before clearing browser storage.

## Locality protection

Exact coordinates are captured only into the device-local `privateLocation` object. The sync payload does not include latitude, longitude, elevation, locality notes, geohash, site, or similar keys. The backend contract still rejects those keys at any nesting depth through `assert_no_sensitive_locality`. Atlas/public exposure remains a downstream consumer concern and must continue to pass through the existing Atlas locality-safety projection before any public map display.

## Tests added

Backend (`tests/test_field_observation_field_journal_mvp.py`):

- unresolved observation with ecology fields and no coordinates
- fail-closed rejection of latitude/locality/nested coordinate keys
- original photo upload preserves bytes and is idempotent by SHA-256
- original video upload is accepted as video
- non-media and oversized uploads are rejected

Frontend (`src/lib/fieldJournal.test.ts`):

- unresolved observation saves locally with private capture location
- upload payload carries ecology/idempotency key but never coordinates or locality notes
- sync state machine labels and transitions
- unsynchronized edit keeps the durable local id
- SHA-256 of original media bytes
- Darwin Core mapping remains documentation, not a public coordinate mapping

## iPad acceptance runbook

1. On Wi‑Fi, open the Orchid Continuum frontend and sign in to the protected `/field` route.
2. Sign in to the Calyx owner/Mission Control session so the frontend’s Calyx transport can authorize the field-observation write.
3. Open `/field` once while online so the app shell and static assets are cached for offline reopening.
4. Turn on airplane mode / disable Wi‑Fi.
5. Create Observation A: attach at least two photos and one video, capture private location, add an optional private locality note, leave identification blank, add habitat/ecology/relationships/notes.
6. Save. Confirm the observation appears as **Local only** with media thumbnails.
7. Close the browser/tab and reopen `/field`. Confirm Observation A and media are still present.
8. Edit Observation A while still offline; save and confirm the local UUID did not change.
9. Restore network access.
10. Tap **Sync all**. Confirm the status moves through **Syncing** to **Synchronized** and shows a server `fo-…` id.
11. Tap sync again. Confirm no duplicate observation is created and media count stays the same.
12. Confirm the local original photos/video still open from the observation card.
13. On the backend, retrieve `GET /api/field-observations/{server_id}` with the same authorized session and confirm the record exists with `identification_status: "unresolved"` and no coordinate fields.

## Remaining limitations

- Production media durability depends on the backend storage mount. `FIELD_MEDIA_STORAGE_DIR` must point to durable private storage before this is production-ready; the default is suitable only for a bounded field test.
- Exact coordinates are not uploaded because the existing backend contract rejects them without a DataPolicy consent path. They remain on the iPad in this MVP.
- Atlas display is not wired to field observations yet. Atlas must remain a consumer of canonical/reviewed records and must use generalized/protected locality only.
- Taxonomic binding is unresolved by design when no identification is supplied; no taxon is invented.
- Server-side update of an accepted observation is deferred. The acceptance flow edits before server acceptance; interrupted uploads resume without changing accepted notes.
- Public API/Darwin Core export of field observations is not enabled by this MVP.
