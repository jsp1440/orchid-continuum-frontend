# Lance Field Kit v0.1 — Field Journal

Offline-first field observation capture for the Orchid Continuum, built for
Lance Peck's iPad field work (Peru). Lives at the existing `/field` route
(`src/pages/CalyxField.tsx`), behind the normal account boundary.

## What it does

- **Capture first, synchronize second.** Observations save locally even with
  no network. Nothing is discarded because the network is unavailable.
- **Originals preserved.** Photos/videos are stored byte-for-byte in IndexedDB
  (`src/lib/fieldMediaStore.ts`). Nothing re-encodes or alters an original.
- **Structured record** (`src/lib/fieldDrafts.ts`, schema v2): observation id,
  timestamp, GPS + elevation, tentative taxon label (blank = UNIDENTIFIED),
  growth habit, substrate, habitat, surrounding vegetation, plant description,
  pollinator/animal interaction, mycorrhizal observation, other relationships,
  free-form notes, observer, provenance.
- **Sync status always visible:** Saved locally / Sync pending / Synced /
  Sync error. Transitions are governed by `transitionFieldDraftSync`.
- **Locality protection.** Precise coordinates are preserved only on
  `private` / `research_restricted` records. Marking a record `public`
  coarsens the stored fix to ~11 km at creation, and the read path re-applies
  the rule so a hand-edited payload cannot leak an exact locality.
- **Export pathway** (`src/lib/fieldExport.ts`): per-observation self-contained
  JSON bundle (record + original media as base64) plus a media-free index of
  all observations. This is the safe synchronization route until the governed
  backend upload exists.

## Saturday setup (Jeff)

1. Deploy/merge this branch when ready, then on Lance's iPad open the site
   in Safari and sign in.
2. Navigate to **/field** (Calyx Field → Field Journal).
3. Optional: Share → **Add to Home Screen** for one-tap access.
4. On first use the iPad will ask for **location** and **camera/photos**
   permissions — grant both.
5. Test offline: enable airplane mode, save a test observation with a photo,
   confirm it appears under "Observations" as **Saved locally**.
6. After field work, on Wi-Fi: open each observation → **Export bundle**, and
   share the `.json` files (AirDrop/iCloud Drive) back for ingestion.

## Known limits (v0.1)

- No server upload yet — "Queue for sync" marks intent; export is the real
  sync path. Smallest next step: a backend endpoint accepting the bundle
  format `orchid-continuum.field-observation` v1.
- Draft records are capped at 100 per account on-device; media at 20 files
  per observation.
- Video is stored as a file reference like photos; no in-app video editing.

## Tests

`npx vitest run src/lib/fieldDrafts.test.ts src/lib/fieldExport.test.ts src/lib/fieldMediaStore.test.ts`
covers: data preservation across sync transitions, locality coarsening
(create + read paths), v1→v2 migration, base64 media round-trip integrity,
and export refusal when media is missing.
