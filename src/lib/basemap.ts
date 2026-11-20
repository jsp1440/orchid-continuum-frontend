/**
 * Shared Leaflet basemap tile source.
 *
 * CARTO retired its keyless `basemaps.cartocdn.com` service: every tile now
 * returns an "API KEY REQUIRED" placeholder image instead of geography, which
 * left the Atlas, the genus maps and the homepage map on a blank, watermarked
 * canvas. OpenStreetMap's standard tile layer needs no key and matches the
 * light cartography these maps were designed around.
 */
export const BASEMAP_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const BASEMAP_TILE_OPTIONS = {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
} as const;
