/**
 * ATLAS-NEXT — typed time state.
 *
 * Slice 2 does not build the temporal system. It builds the state that system
 * will need, so Slice 3 is an implementation rather than a rewrite.
 *
 * One rule governs everything here: `atlas_occurrences` stores a collection
 * YEAR, not an event date and not a flowering observation. A year tells you
 * when somebody was standing there with a notebook. It does not tell you when
 * the orchid flowered, and a gap in years does not tell you the orchid left.
 * Every state below is named so that it cannot quietly become the other thing.
 */

export type TimeMode =
  /** No temporal filter. The default, and the only honest default. */
  | 'all-time'
  /** An explicit year window the viewer chose. */
  | 'year-range'
  /** Records collected within the recency window; see RECENT_WINDOW_YEARS. */
  | 'recent'
  /** Records collected before the recency window. */
  | 'historical';

export interface AtlasTimeState {
  mode: TimeMode;
  /** Inclusive bounds, used when mode is 'year-range'. */
  yearMin?: number;
  yearMax?: number;
}

export const DEFAULT_TIME_STATE: AtlasTimeState = { mode: 'all-time' };

/**
 * How much of a temporal question a data source can support.
 *
 * `occurrence-year` is the only level the Continuum currently reaches, and it
 * is a weak one: it supports "when was this recorded" and nothing else.
 */
export type TimeCompatibility =
  | 'none'
  | 'occurrence-year'
  | 'event-date'
  | 'flowering-season'
  | 'environmental-series';

/**
 * The window used to describe a record as recently collected.
 *
 * This is a DISPLAY CONVENTION, not a biological threshold. Twenty-five years
 * is roughly a human working generation of field collecting; it carries no
 * claim about population persistence, and the interface always states the
 * actual year alongside it rather than only the label.
 */
export const RECENT_WINDOW_YEARS = 25;

export const recencyBoundary = (now = new Date()): number =>
  now.getUTCFullYear() - RECENT_WINDOW_YEARS;

export type Recency = 'recent' | 'historical' | 'undated';

export function recencyOf(year: number | undefined, boundary = recencyBoundary()): Recency {
  if (typeof year !== 'number' || !Number.isFinite(year)) return 'undated';
  return year >= boundary ? 'recent' : 'historical';
}

/** Does a record fall inside the active time state? Undated records are never excluded
 *  by a recency filter — absence of a date is not evidence of a date. */
export function withinTime(year: number | undefined, t: AtlasTimeState): boolean {
  switch (t.mode) {
    case 'all-time':
      return true;
    case 'year-range':
      if (typeof year !== 'number') return true;
      if (typeof t.yearMin === 'number' && year < t.yearMin) return false;
      if (typeof t.yearMax === 'number' && year > t.yearMax) return false;
      return true;
    case 'recent':
      return recencyOf(year) !== 'historical';
    case 'historical':
      return recencyOf(year) !== 'recent';
    default:
      return true;
  }
}

/** Human sentence for the current time state, for the panel and for Calyx. */
export function describeTime(t: AtlasTimeState): string {
  switch (t.mode) {
    case 'all-time':
      return 'All records, whenever they were collected.';
    case 'year-range':
      return `Records collected between ${t.yearMin ?? '—'} and ${t.yearMax ?? '—'}.`;
    case 'recent':
      return `Records collected since ${recencyBoundary()}, plus records with no year — a missing year is not an old year.`;
    case 'historical':
      return `Records collected before ${recencyBoundary()}, plus records with no year. Age of a record says nothing about whether the orchid is still there.`;
    default:
      return '';
  }
}
