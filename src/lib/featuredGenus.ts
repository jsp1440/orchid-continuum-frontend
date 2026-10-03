/**
 * featuredGenus — the SINGLE SOURCE OF TRUTH for the "Genus of the Day" system.
 *
 * Every homepage element that must stay synchronized (the DailyGenusFeature
 * panel, the SpeciesInFocus species cards, and the HomeAtlas occurrence map)
 * derives its genus from THIS module so all four are guaranteed to show the
 * same genus within the same 12-hour window.
 *
 * ROTATION CONTRACT
 * -----------------
 *   • Deterministic — derived purely from the current UTC clock, so every
 *     visitor worldwide sees the same genus at the same moment.
 *   • Changes every 12 hours (two distinct genera per UTC day).
 *   • Cycles predictably through a fixed list of genus NAMES. This module
 *     carries no taxon facts; consumers resolve every factual field from the
 *     live Continuum backend and show honest unavailable states otherwise.
 *
 * The window index is: floor(epochMillis / 12h) mod LIST.length.
 */

/** Length of one rotation window, in milliseconds (12 hours). */
export const WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * Fixed, ordered rotation list of homepage-safe genera.
 *
 * Names only (identity / navigation context, not evidence).
 */
export const FEATURED_GENERA: string[] = [
  'Cattleya',
  'Dracula',
  'Masdevallia',
  'Dendrobium',
  'Bulbophyllum',
  'Catasetum',
  'Vanilla',
  'Phalaenopsis',
];

/**
 * Index into {@link FEATURED_GENERA} for the current 12-hour UTC window.
 * `now` is injectable for testing; defaults to the live clock.
 */
export function featuredGenusIndex(now: number = Date.now()): number {
  const windowNumber = Math.floor(now / WINDOW_MS);
  const len = FEATURED_GENERA.length;
  return ((windowNumber % len) + len) % len;
}

/** The featured genus NAME for the current 12-hour UTC window. */
export function featuredGenusName(now: number = Date.now()): string {
  return FEATURED_GENERA[featuredGenusIndex(now)];
}

/** Milliseconds remaining until the featured genus rotates to the next one. */
export function msUntilNextRotation(now: number = Date.now()): number {
  return WINDOW_MS - (now % WINDOW_MS);
}
