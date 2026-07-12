# BUILD-MEDIA-001 Frontend Evidence

The active `DailyGenusFeatureV5` renders `DailyGenusFeatureV4` as its image block. This build replaces that active V4 block in place and leaves the surrounding V5 research and ecology sections intact.

The only media request path is Calyx:

`GET ${CALYX_BACKEND_BASE_URL}/api/media/genus/{genus}?limit=12`

The replacement block no longer imports or calls the legacy harvester client or frontend image fallback utilities. It renders Calyx-approved photos or explicit loading, no-media, invalid-genus, and service-error states.

The deployed Calyx endpoint returned `status: ok` for Cattleya with taxon-linked EOL photo records and license metadata before this frontend branch was opened.
