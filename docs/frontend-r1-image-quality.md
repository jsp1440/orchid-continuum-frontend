# FRONTEND-R1 — Homepage Image Quality Policy

## Goal

The v0.1 Preview Release homepage should show living orchid photographs, not herbarium sheets, specimen labels, scanned plates, PDFs, logos, placeholder graphics, or society badges.

## Current implementation

Image filtering now has two release-facing layers:

1. `src/lib/imageQuality.ts`
   - Central classifier for homepage-safe image URLs and metadata.
   - Rejects herbarium/specimen/document/plate/scan/logo/non-photo assets.
   - Scores likely flowers, whole plants, habitat, and pollinator context images.

2. `src/components/orchid/FallbackImage.tsx`
   - Final rendering safety net.
   - Runs every candidate URL through `filterRankUrls()` before rendering.
   - Automatically advances through remaining safe URLs if one fails to load.

A third diagnostic helper has been added:

3. `src/lib/imageQualityAudit.ts`
   - Side-effect-free audit helper for release diagnostics and reports.
   - Returns accepted/rejected counts plus per-URL reasons.

## Policy

For public homepage surfaces:

- Accept likely living orchid flower photographs.
- Accept likely living whole-plant orchid photographs.
- Accept in-situ habitat photographs when clearly botanical/ecological.
- Accept pollinator context photographs when clearly relevant.
- Reject herbarium sheets.
- Reject specimen/voucher/type images.
- Reject scanned plates, botanical illustrations, line art, PDFs, TIFFs, and BHL/archive/botanicus-style document assets.
- Reject logos, badges, society graphics, banners, watermarks, and placeholders.

## Next code target

The remaining deeper integration target is `src/lib/genusData.ts`, specifically the candidate-image fetch/cache path:

- localStorage genus image cache
- Supabase `genus-images` cache
- harvester `/images/genus/{genus}` results
- iNaturalist fallback path

That path should eventually normalize and audit image candidates before caching them. For now, `FallbackImage` prevents unsafe assets from rendering even if stale cache rows remain.
