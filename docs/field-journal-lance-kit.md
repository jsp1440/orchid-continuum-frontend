# Lance Field Kit v0.1 — Field Journal

Offline-first field observation capture for the Orchid Continuum, built for
Lance Peck's iPad field work (Peru). Lives at the existing `/field` route
(`src/pages/CalyxField.tsx`), behind the normal account boundary.

## Architecture (no parallel system)

- **Capture/local:** draft records in localStorage, original photos/videos
  byte-for-byte in IndexedDB (`fieldMediaStore.ts`).
- **Sync target:** the existing Calyx backend endpoint
  `POST /api/field-observations` (contract `field-observations/v1`,
  `orchid-calyx-backend/app/field_observation/`). No new backend was created.
- **Idempotency:** the durable local draft UUID is sent as
  `client_draft_id`; the backend derives the observation id deterministically
  from (observer, client_draft_id) and answers replays with the existing
  record. A draft that holds `backendObservationId` is never re-posted.
- **Taxonomy:** when online, the tentative label is matched against canonical
  taxonomy via the public API (`/api/species/search`, exact case-insensitive
  match only). A match is stored as `taxonomyMatch`; the observer's label
  stays tentative forever and UNIDENTIFIED observations sync untouched.
- **Atlas:** `fieldAtlas.ts` projects a draft to an Atlas-compatible
  occurrence only when `locality_visibility = public`, with the already
  coarsened (~11 km) fix and `scientific_status: observer_report`. Private
  and research-restricted records do not exist for the Atlas.

## Sync behavior

- Statuses: Saved locally / Sync pending / Synced / Sync error — always
  visible per observation.
- "Sync now" per observation, "Sync all now", and automatic upload of queued
  observations when connectivity returns.
- Payload is built from an explicit allow-list (`buildSyncPayload`): the
  backend contract rejects coordinate keys, so none are ever sent. Precise
  coordinates stay on-device and in the export bundle.
- Media bytes are not uploaded (no governed byte-storage endpoint exists
  yet). Originals are never deleted after sync; the per-observation export
  bundle remains the media recovery path.

## Auth on the iPad

`/api/field-observations` requires the owner session or the API key — member
(Supabase) tokens are read-only on four GET routes. For Saturday: Jeff signs
in once on Lance's iPad with the owner access code (Mission Control). The
frontend's owner-session transport then attaches the bearer to sync requests
automatically.

## Saturday setup (Jeff)

1. Merge/deploy this branch, then on Lance's iPad open the site in Safari.
2. Sign in with the owner access code (Mission Control sign-in).
3. Navigate to **/field** (Calyx Field → Field Journal).
4. Optional: Share → **Add to Home Screen** for one-tap access.
5. Grant **location** and **camera/photos** permissions when asked.
6. Offline test: airplane mode → save an observation with a photo → confirm
   it shows **Saved locally**.
7. Sync test: disable airplane mode → **Sync now** → confirm **Synced** and
   a backend id (`fo-…`) appears on the card.
8. After field work, media bytes come home via **Export bundle** per
   observation (AirDrop/iCloud Drive).

## Known limits (v0.1)

- Photo/video bytes stay on-device; the backend stores media metadata +
  observation record only (PhotoAttachRequest needs a storage layer that has
  no upload endpoint yet).
- 100 drafts per account on-device; 20 media files per observation.
- Ecology/relationships fields ride in the note appendix because the backend
  contract forbids extra keys; structured fields await a contract v2.

## Tests

`npx vitest run src/lib/fieldDrafts.test.ts src/lib/fieldExport.test.ts src/lib/fieldMediaStore.test.ts src/lib/fieldSync.test.ts src/lib/fieldAtlas.test.ts`

Covers: offline persistence round-trip, v1→v2 migration, sync retry and
idempotency (no re-post of confirmed records, 200-replay handling, error
recovery without data loss), payload coordinate-leak guard, taxonomy match
rules, Atlas locality withholding, base64 media byte integrity.
