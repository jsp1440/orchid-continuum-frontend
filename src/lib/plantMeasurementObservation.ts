/**
 * What a grower measured on their own plant, and how they measured it.
 *
 * The acceptance specimen has ruler-backed photographs of a flower whose
 * natural horizontal spread is about 5.6 inches. That is a real observation
 * about a real plant and the collection should hold it — but it is a fact
 * about one flower on one plant in one season, not a published measurement of
 * Phragmipedium kovachii, and the record has to keep saying which it is.
 *
 * Three rules shape this.
 *
 * The recorded value is authoritative and is never rewritten. A grower who
 * measured in inches has 5.6 in stored as 5.6 in. Storing a converted number
 * as the primary value loses the fact that a ruler in inches is what was
 * actually read.
 *
 * A conversion never invents precision. 5.6 in is 14.224 cm arithmetically, and
 * presenting that would claim a ruler resolved tenths of a millimetre. The
 * converted value is rounded to one decimal place — 14.2 cm — and is always
 * labelled as converted rather than measured.
 *
 * A measurement is never overwritten. Flowers open more than once, and last
 * season's spread is not made wrong by this season's. A correction supersedes
 * the entry it corrects and both stay in the record, which is the same shape
 * the plant's event ledger already uses.
 */

const MAX_NOTE_CHARACTERS = 280;
const MAX_INSTRUMENT_CHARACTERS = 80;
const UNSAFE_PUNCTUATION = /[<>{}\\]/;

/**
 * What may be measured, and the dimension each is.
 *
 * A closed list because a free-text variable cannot be compared with anything
 * later, and because "spread" measured two different ways is two different
 * numbers wearing one name.
 */
export const MEASURABLE_TRAITS: Readonly<Record<string, { label: string; dimension: 'length' }>> =
  Object.freeze({
    natural_spread_horizontal: { label: 'Natural spread, horizontal', dimension: 'length' },
    natural_spread_vertical: { label: 'Natural spread, vertical', dimension: 'length' },
    dorsal_sepal_width: { label: 'Dorsal sepal width', dimension: 'length' },
    dorsal_sepal_length: { label: 'Dorsal sepal length', dimension: 'length' },
    petal_width: { label: 'Petal width', dimension: 'length' },
    petal_length: { label: 'Petal length', dimension: 'length' },
    pouch_length: { label: 'Pouch length', dimension: 'length' },
    inflorescence_length: { label: 'Inflorescence length', dimension: 'length' },
  });

/** Units a grower's ruler or calipers actually read in. */
export const MEASUREMENT_UNITS = Object.freeze(['cm', 'mm', 'in'] as const);
export type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number];

/**
 * How the number was obtained.
 *
 * `ruler_photograph` is the acceptance specimen's case: a ruler held beside the
 * flower and photographed. It is more checkable than a direct reading, because
 * the photograph can be looked at again, and less precise than calipers.
 */
export const MEASUREMENT_METHODS = Object.freeze([
  'ruler_photograph',
  'ruler_direct',
  'calipers',
  'estimated',
] as const);
export type MeasurementMethod = (typeof MEASUREMENT_METHODS)[number];

export type PlantMeasurementInput = {
  trait: string;
  value: number | string;
  unit: string;
  method: string;
  /** The day it was measured. A measurement is about a moment. */
  measuredOn: string;
  /** Which flowering this belongs to, when the grower recorded one. */
  floweringEventId?: string | null;
  /** The photograph the ruler is in, when there is one. */
  photographId?: string | null;
  instrument?: string | null;
  note?: string | null;
  /** The entry this corrects. The corrected one stays in the record. */
  supersedesId?: string | null;
};

export type PlantMeasurement = {
  trait: keyof typeof MEASURABLE_TRAITS;
  /** Exactly what was read, in the unit it was read in. */
  value: number;
  unit: MeasurementUnit;
  method: MeasurementMethod;
  measured_on: string;
  flowering_event_id: string | null;
  photograph_id: string | null;
  instrument: string | null;
  note: string | null;
  supersedes_id: string | null;
  /**
   * A grower's measurement of their own plant. Not a published description of
   * the species, and not an occurrence record.
   */
  is_scientific_evidence: false;
};

const TO_CENTIMETRES: Readonly<Record<MeasurementUnit, number>> = Object.freeze({
  cm: 1,
  mm: 0.1,
  in: 2.54,
});

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function boundedText(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > limit || hasControlCharacter(text) || UNSAFE_PUNCTUATION.test(text)) {
    return null;
  }
  return text;
}

function measuredDay(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return Number.isNaN(Date.parse(day)) ? null : day;
}

/**
 * Build a measurement, or nothing.
 *
 * A partial measurement is worse than none: a value with no unit, or no method,
 * is a number nobody can act on and everybody will assume something about.
 */
export function buildPlantMeasurement(input: PlantMeasurementInput): PlantMeasurement | null {
  const trait = String(input.trait ?? '');
  if (!(trait in MEASURABLE_TRAITS)) return null;

  const value = typeof input.value === 'number' ? input.value : Number(String(input.value).trim());
  // A flower with no width is not a measurement, and a negative one is a typo.
  if (!Number.isFinite(value) || value <= 0 || value > 1000) return null;

  const unit = String(input.unit ?? '') as MeasurementUnit;
  if (!(MEASUREMENT_UNITS as readonly string[]).includes(unit)) return null;

  const method = String(input.method ?? '') as MeasurementMethod;
  if (!(MEASUREMENT_METHODS as readonly string[]).includes(method)) return null;

  const measured_on = measuredDay(input.measuredOn);
  if (!measured_on) return null;

  return {
    trait: trait as PlantMeasurement['trait'],
    value,
    unit,
    method,
    measured_on,
    flowering_event_id: boundedText(input.floweringEventId, 64),
    photograph_id: boundedText(input.photographId, 64),
    instrument: boundedText(input.instrument, MAX_INSTRUMENT_CHARACTERS),
    note: boundedText(input.note, MAX_NOTE_CHARACTERS),
    supersedes_id: boundedText(input.supersedesId, 64),
    is_scientific_evidence: false,
  };
}

/**
 * The same length in another unit, rounded so the conversion claims no more
 * precision than the reading did.
 *
 * One decimal place, always. 5.6 in becomes 14.2 cm, not 14.224 cm — a ruler
 * did not resolve tenths of a millimetre, and printing digits it could not
 * produce turns a grower's careful reading into a false claim.
 */
export function convertedMeasurement(
  measurement: Pick<PlantMeasurement, 'value' | 'unit'>,
  to: MeasurementUnit,
): { value: number; unit: MeasurementUnit; converted: true } | null {
  if (measurement.unit === to) return null;
  const centimetres = measurement.value * TO_CENTIMETRES[measurement.unit];
  const value = Math.round((centimetres / TO_CENTIMETRES[to]) * 10) / 10;
  return { value, unit: to, converted: true };
}

/** How a measurement should read to a person, with its provenance attached. */
export function describeMeasurement(measurement: PlantMeasurement): string {
  const trait = MEASURABLE_TRAITS[measurement.trait].label;
  const converted = convertedMeasurement(measurement, measurement.unit === 'in' ? 'cm' : 'in');
  const both = converted
    ? `${measurement.value} ${measurement.unit} (${converted.value} ${converted.unit} converted)`
    : `${measurement.value} ${measurement.unit}`;
  const how = measurement.method.replace(/_/g, ' ');
  return `${trait}: ${both}, by ${how}, on ${measurement.measured_on}`;
}

/**
 * What can be said about where a photograph-read measurement came from.
 *
 * `ruler_photograph` is ranked above `estimated` for one reason: the
 * photograph can be looked at again. That is only true if the record says
 * which photograph. A reading marked as read off a photograph that names no
 * photograph is not re-checkable, and presenting it as though it were would
 * be claiming a provenance the record does not have — so it is stated as a
 * gap the grower can close, not left silent.
 *
 * `unidentified` is deliberately not a refusal. Growers measure before they
 * upload, and a reading is worth keeping; what is not acceptable is letting
 * it pass as verifiable.
 */
export type MeasurementPhotographProvenance =
  | { state: 'not_from_photograph' }
  | { state: 'identified'; photographId: string }
  | { state: 'unidentified'; note: string };

export function measurementPhotographProvenance(
  measurement: Pick<PlantMeasurement, 'method' | 'photograph_id'>,
): MeasurementPhotographProvenance {
  if (measurement.photograph_id) {
    return { state: 'identified', photographId: measurement.photograph_id };
  }
  if (measurement.method !== 'ruler_photograph') return { state: 'not_from_photograph' };
  return {
    state: 'unidentified',
    note: 'read from a photograph that is not named here, so it cannot be checked against one',
  };
}

/**
 * The measurements that still stand, and the ones a correction replaced.
 *
 * Nothing is dropped. A superseded reading is part of what the collection
 * knows — that somebody measured, then measured again — and later flowerings
 * add entries rather than replacing earlier ones.
 */
export function partitionMeasurements<T extends { id: string; supersedes_id?: string | null }>(
  measurements: T[],
): { standing: T[]; superseded: T[] } {
  const replaced = new Set(
    measurements.map((entry) => entry.supersedes_id).filter((id): id is string => Boolean(id)),
  );
  return {
    standing: measurements.filter((entry) => !replaced.has(entry.id)),
    superseded: measurements.filter((entry) => replaced.has(entry.id)),
  };
}
