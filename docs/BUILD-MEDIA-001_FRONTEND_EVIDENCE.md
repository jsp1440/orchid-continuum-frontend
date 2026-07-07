# BUILD-MEDIA-001 — Frontend Evidence

## Replaced Featured Genus path

`DailyGenusFeatureV5` now uses `src/lib/genusMediaResolver.ts` as its only media client.

The client calls:

`GET ${CALYX_BACKEND_BASE_URL}/api/media/genus/{genus}?limit=12`

## Removed behavior from the active Featured Genus component

The active Featured Genus component no longer imports or renders:

- `DailyGenusFeatureV4`;
- `publicImageSource.ts`;
- the legacy image harvester client;
- direct iNaturalist, GBIF, Plantae, Wikimedia, or other external-provider fallback behavior.

Those legacy utilities remain in the repository because unrelated pages may still use them; they are not part of this active homepage component.

## User-visible states

- loading verified Calyx media;
- approved media returned;
- no verified media available;
- invalid genus;
- Calyx service unavailable.

The no-media and service-error states explicitly do not substitute an external or unrelated image.

## Deployment verification required

The frontend branch has not been deployed. After backend deployment, verify Cattleya, Dracula, Dendrobium, Bulbophyllum, and Vanilla against the same Calyx endpoint and visually confirm hero/gallery behavior.
