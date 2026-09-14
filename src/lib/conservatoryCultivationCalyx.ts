/**
 * The Conservatory → Calyx cultivation handoff.
 *
 * The existing "Ask Calyx" action on a plant deliberately sends nothing but the
 * species name, and says so: a grower's own bench, readings and notes stay
 * private. That is right for a question about the species. It is useless for a
 * question about *this plant*, which is what a grower actually wants to ask —
 * whether where they are keeping it matches what the plant needs.
 *
 * This contract carries the second kind of question, under three rules.
 *
 * Nothing private travels in the address. A URL is written to browser history,
 * leaks through `Referer`, and is pasted into chat windows. So the address
 * carries only the public taxon and the governed markers, and the observations
 * are handed over through same-origin session storage under a single-use token.
 *
 * Observations are not evidence. A grower's thermometer reading is a fact about
 * their greenhouse, not a scientific record of the species, and it is not an
 * occurrence. Both denials are explicit fields rather than an absence, because
 * a receiver cannot distinguish "not evidence" from "nobody said" when the flag
 * is merely missing.
 *
 * Only vocabulary crosses, never prose. Values are matched against fixed
 * allow-lists — the variable, the unit, how it was obtained, the kind of place.
 * A location's *name* is free text a grower may well have written their home
 * address into, so the name never leaves; only its kind does.
 */

import { resolveCultivatedIdentity } from '@/lib/cultivatedTaxonIdentity';

export const CONSERVATORY_CULTIVATION_ORIGIN = 'conservatory-cultivation';
export const CONSERVATORY_CULTIVATION_CALYX_PATH = '/calyx';

/** Where the single-use observation payload is left for the Calyx route. */
export const CULTIVATION_HANDOFF_STORAGE_PREFIX = 'oc.cultivation-handoff.';

const MAX_TAXON_CHARACTERS = 160;
const MAX_OBSERVATIONS = 12;
const SAFE_GENUS = /^[A-Z][A-Za-z-]+$/;
const SAFE_BINOMIAL = /^[A-Z][A-Za-z-]+\s+[a-z][A-Za-z-]+$/;
const SAFE_TOKEN = /^[a-z0-9]{8,64}$/;

/**
 * The environmental variables that may cross, and the unit each must carry.
 *
 * Pinning the unit here is what stops 21 °C being read as 21 °F on the other
 * side. `conservatoryCultivationVocabulary.test.ts` asserts this list still
 * matches the one the Conservatory form offers.
 */
export const PERMITTED_OBSERVATION_VARIABLES: Readonly<Record<string, string>> = Object.freeze({
  temperature_c: '°C',
  relative_humidity_pct: '%',
  light_ppfd_umol_m2_s: 'µmol/m²/s',
  daily_light_integral_mol_m2_d: 'mol/m²/d',
});

/** How a number came to be known. Never flattened away, never inferred. */
export const PERMITTED_OBSERVATION_ORIGINS = Object.freeze([
  'measured',
  'manual',
  'inferred',
  'unknown',
] as const);

/** The kinds of place a plant may be kept. A controlled list, never free text. */
export const PERMITTED_LOCATION_KINDS = Object.freeze([
  'greenhouse',
  'greenhouse_bench',
  'shade_house',
  'lath_house',
  'outdoor',
  'windowsill',
  'indoor_growing_area',
  'shelf',
  'zone',
  'custom',
] as const);

export type CultivationObservation = {
  variable: keyof typeof PERMITTED_OBSERVATION_VARIABLES;
  value: number;
  unit: string;
  /** measured | manual | inferred | unknown */
  origin: (typeof PERMITTED_OBSERVATION_ORIGINS)[number];
  /** The day it was observed. Deliberately coarse — a timestamp is a movement record. */
  observed_on: string;
};

export type CultivationAlternative = {
  /** A, B, C… in the grower's own ordering. Never a name, never an id. */
  ref: string;
  kind: (typeof PERMITTED_LOCATION_KINDS)[number];
  observations: CultivationObservation[];
};

export type CultivationHandoff = {
  origin: typeof CONSERVATORY_CULTIVATION_ORIGIN;
  /**
   * What the grower actually has, in full.
   *
   * The acceptance specimen is labelled `Phragmipedium kovachii 'Daniela' x
   * Phragmipedium kovachii 'Maria'`, and that is the plant being asked about.
   * Reducing it to the species would ask about a different thing.
   */
  cultivated_identity: string;
  /** The species published cultivation evidence is actually about. */
  taxon: string;
  /**
   * How the species relates to the plant, so an answer can never present
   * evidence about the species as evidence about this exact cross.
   */
  taxon_relationship: 'species' | 'cultivar_of_species' | 'cross_within_species';
  featured_taxon: { rank: 'genus'; accepted_name: string };
  /** The subject is navigation context, not a scientific determination. */
  taxon_is_evidence: false;
  location: { kind: (typeof PERMITTED_LOCATION_KINDS)[number] };
  observations: CultivationObservation[];
  /**
   * The grower's other places, so a recommendation to move can name one.
   *
   * Each carries a short reference rather than its name, for the same reason
   * the current location does: a name is free text somebody may have written
   * an address into. The reference is the grower's own ordering of their
   * locations, and the Conservatory shows them the legend before they send, so
   * "B is cooler" is something they can act on without B's name ever leaving
   * their collection.
   */
  alternatives: CultivationAlternative[];
  /** A grower's readings are facts about their greenhouse, not about the species. */
  observations_are_evidence: false;
  /** And they are not occurrence records. Absence of a locality is not enough to say so. */
  observations_are_occurrence_data: false;
};

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function boundedGenus(value: string | null | undefined): string | null {
  const genus = value?.trim() ?? '';
  if (!genus || genus.length > MAX_TAXON_CHARACTERS || !SAFE_GENUS.test(genus)) return null;
  return genus;
}

function boundedTaxon(value: string | null | undefined): string | null {
  const taxon = value?.trim() ?? '';
  if (
    !taxon ||
    taxon.length > MAX_TAXON_CHARACTERS ||
    hasControlCharacter(taxon) ||
    !SAFE_BINOMIAL.test(taxon)
  ) {
    return null;
  }
  return taxon;
}

/** An instant reduced to the day it fell on. */
function observedDay(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return Number.isNaN(Date.parse(day)) ? null : day;
}

function boundedObservation(candidate: unknown): CultivationObservation | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const row = candidate as Record<string, unknown>;

  const variable = String(row.variable ?? '');
  const unit = PERMITTED_OBSERVATION_VARIABLES[variable];
  if (!unit) return null;

  // A reading with no number is not an observation. It is the absence of one,
  // and forwarding it as a value would invent a measurement.
  const value = typeof row.value === 'number' ? row.value : Number.NaN;
  if (!Number.isFinite(value)) return null;

  const origin = String(row.origin ?? '');
  if (!(PERMITTED_OBSERVATION_ORIGINS as readonly string[]).includes(origin)) return null;

  const observed_on = observedDay(row.observed_at ?? row.observed_on);
  if (!observed_on) return null;

  return {
    variable: variable as CultivationObservation['variable'],
    value,
    unit,
    origin: origin as CultivationObservation['origin'],
    observed_on,
  };
}

/**
 * Build the payload from what the plant dossier already holds.
 *
 * Returns `null` rather than a partial handoff. A cultivation question with no
 * taxon cannot be answered against requirements, and one with no readings would
 * ask Calyx to assess conditions nobody recorded.
 */
const SAFE_ALTERNATIVE_REF = /^[A-Z]$/;
const MAX_ALTERNATIVES = 8;

/** Bound a reading list, keeping one standing value per variable. */
function boundedObservations(readings: Array<Record<string, unknown>> | undefined): CultivationObservation[] {
  const observations: CultivationObservation[] = [];
  for (const reading of readings ?? []) {
    const bounded = boundedObservation(reading);
    // One per variable: the caller passes standing readings, and a superseded
    // value arriving beside its correction would have Calyx compare against a
    // number the grower has already withdrawn.
    if (bounded && !observations.some((existing) => existing.variable === bounded.variable)) {
      observations.push(bounded);
    }
    if (observations.length >= MAX_OBSERVATIONS) break;
  }
  return observations;
}

export function buildCultivationHandoff(input: {
  acceptedScientificName: string | null | undefined;
  locationKind: string | null | undefined;
  readings: Array<{ variable?: unknown; value?: unknown; origin?: unknown; observed_at?: unknown }>;
  alternatives?: Array<{ ref?: unknown; kind?: unknown; readings?: unknown }>;
}): CultivationHandoff | null {
  // The stored record may be a cross or a named clone. The species is what may
  // be looked up; the full name is what is being asked about. A plant with no
  // resolvable species — a cross between two species, a grex — is refused here
  // rather than asked about against some other plant's requirements.
  const identity = resolveCultivatedIdentity(input.acceptedScientificName);
  if (!identity || !identity.species || identity.relationship === 'none') return null;
  const taxon = boundedTaxon(identity.species);
  if (!taxon) return null;
  const genus = boundedGenus(taxon.split(/\s+/)[0]);
  if (!genus) return null;

  const kind = String(input.locationKind ?? '');
  if (!(PERMITTED_LOCATION_KINDS as readonly string[]).includes(kind)) return null;

  const observations = boundedObservations(input.readings as Array<Record<string, unknown>>);
  if (!observations.length) return null;

  // A place nobody has measured cannot be compared, so it is dropped rather
  // than offered as a destination with unknown conditions.
  const alternatives: CultivationAlternative[] = [];
  for (const candidate of input.alternatives ?? []) {
    const ref = String(candidate?.ref ?? '');
    const kind = String(candidate?.kind ?? '');
    if (!SAFE_ALTERNATIVE_REF.test(ref)) continue;
    if (!(PERMITTED_LOCATION_KINDS as readonly string[]).includes(kind)) continue;
    if (alternatives.some((existing) => existing.ref === ref)) continue;
    const theirs = boundedObservations(
      Array.isArray(candidate?.readings) ? (candidate.readings as Array<Record<string, unknown>>) : [],
    );
    if (!theirs.length) continue;
    alternatives.push({ ref, kind: kind as CultivationAlternative['kind'], observations: theirs });
    if (alternatives.length >= MAX_ALTERNATIVES) break;
  }

  return {
    origin: CONSERVATORY_CULTIVATION_ORIGIN,
    cultivated_identity: identity.cultivated,
    taxon,
    taxon_relationship: identity.relationship,
    featured_taxon: { rank: 'genus', accepted_name: genus },
    taxon_is_evidence: false,
    location: { kind: kind as CultivationHandoff['location']['kind'] },
    observations,
    alternatives,
    observations_are_evidence: false,
    observations_are_occurrence_data: false,
  };
}

/** The address the button navigates to. Public identity and markers only. */
export function cultivationCalyxHref(taxon: string, token: string): string | null {
  const bounded = boundedTaxon(taxon);
  if (!bounded || !SAFE_TOKEN.test(token)) return null;
  const genus = bounded.split(/\s+/)[0];
  const params = new URLSearchParams({
    genus,
    taxon: bounded,
    origin: CONSERVATORY_CULTIVATION_ORIGIN,
    context_is_evidence: 'false',
    cultivation: token,
  });
  return `${CONSERVATORY_CULTIVATION_CALYX_PATH}?${params.toString()}`;
}

/**
 * Leave the payload for the Calyx route to collect.
 *
 * Session storage, not local: a handoff should not outlive the tab that made
 * it. Storage that refuses to write — a private window, a browser with site
 * data blocked — yields `null`, and the caller must not navigate, because the
 * arrival would then be a cultivation question with no observations.
 */
export function seedCultivationHandoff(
  storage: Pick<Storage, 'setItem'>,
  token: string,
  handoff: CultivationHandoff,
): boolean {
  if (!SAFE_TOKEN.test(token)) return false;
  try {
    storage.setItem(`${CULTIVATION_HANDOFF_STORAGE_PREFIX}${token}`, JSON.stringify(handoff));
    return true;
  } catch {
    return false;
  }
}

/**
 * Collect and re-validate the payload on arrival.
 *
 * Everything is checked again on this side. Session storage is writable by any
 * script on the origin, so a payload read back is untrusted input, not
 * something this module put there and may take on faith.
 *
 * The entry is removed whether or not it validates: a single-use token that
 * survives its use is a private observation set sitting in storage waiting for
 * the next thing that can read it.
 */
export function readCultivationHandoff(
  search: string | URLSearchParams,
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
): CultivationHandoff | null {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  if (params.get('origin') !== CONSERVATORY_CULTIVATION_ORIGIN) return null;
  if (params.get('context_is_evidence') !== 'false') return null;

  const token = params.get('cultivation') ?? '';
  if (!SAFE_TOKEN.test(token)) return null;

  const key = `${CULTIVATION_HANDOFF_STORAGE_PREFIX}${token}`;
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
    storage.removeItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const candidate = parsed as Record<string, unknown>;

  // The address and the payload must agree on the subject. If they disagree,
  // one of them was tampered with, and there is no way to tell which.
  const routeTaxon = boundedTaxon(params.get('taxon'));
  const payloadTaxon = boundedTaxon(candidate.taxon as string | undefined);
  if (!routeTaxon || !payloadTaxon || routeTaxon !== payloadTaxon) return null;

  return buildCultivationHandoff({
    // Rebuilt from the recorded identity, not from the species, so the
    // relationship is re-derived here rather than taken from storage.
    acceptedScientificName:
      typeof candidate.cultivated_identity === 'string' ? candidate.cultivated_identity : payloadTaxon,
    locationKind: (candidate.location as { kind?: unknown } | undefined)?.kind as string | undefined,
    readings: Array.isArray(candidate.observations)
      ? (candidate.observations as Array<Record<string, unknown>>)
      : [],
    alternatives: Array.isArray(candidate.alternatives)
      ? (candidate.alternatives as Array<Record<string, unknown>>).map((row) => ({
          ref: row?.ref,
          kind: row?.kind,
          readings: row?.observations,
        }))
      : [],
  });
}


/**
 * The handoff adopted for the current page, keyed by its token.
 *
 * Storage is single-use, but the turn context is built more than once for a
 * single message — the workspace builds it to create the conversation and
 * again to send the turn. A consuming read would hand the observations to one
 * of those and leave the other with a cultivation question carrying nothing.
 *
 * So the route adopts the payload once, moving it out of storage and into
 * memory, and every later build reads it non-destructively. Memory dies with
 * the page, which is the lifetime this context should have.
 */
const adopted = new Map<string, CultivationHandoff>();

/**
 * Move the payload out of storage and hold it for the life of the page.
 *
 * Called once by the Calyx route on arrival. Returns `null` when the arrival
 * is not a governed cultivation handoff, which callers must treat as "no
 * cultivation context", not as an error.
 */
export function adoptCultivationHandoff(
  search: string | URLSearchParams,
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
): CultivationHandoff | null {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const token = params.get('cultivation') ?? '';
  if (!SAFE_TOKEN.test(token)) return null;

  const existing = adopted.get(token);
  if (existing) return existing;

  const handoff = readCultivationHandoff(params, storage);
  if (!handoff) return null;
  adopted.set(token, handoff);
  return handoff;
}

/** The adopted handoff for this address, if one was adopted. Never consumes. */
export function activeCultivationHandoff(
  search: string | URLSearchParams,
): CultivationHandoff | null {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  if (params.get('origin') !== CONSERVATORY_CULTIVATION_ORIGIN) return null;
  if (params.get('context_is_evidence') !== 'false') return null;
  const token = params.get('cultivation') ?? '';
  if (!SAFE_TOKEN.test(token)) return null;
  return adopted.get(token) ?? null;
}

/** Drop everything adopted. Test-only; a page reload does this by existing. */
export function resetAdoptedCultivationHandoffs(): void {
  adopted.clear();
}
