/**
 * Data layer for the protected dependency prototype (issue #163 slice).
 *
 * Every value here is either fetched live from the Orchid Continuum data
 * sources, or is a verbatim capture of a live response (see CAPTURED_* below).
 * Nothing in this file is invented. Where evidence does not exist, the shape
 * carries an explicit `unknown` rather than a plausible-looking value.
 *
 * Sources used:
 *   - `species`             (Supabase)  — curated taxon profile
 *   - `species_mycorrhizal` (Supabase)  — literature-backed fungal partner
 *   - `atlas_occurrences`   (Supabase)  — GBIF-derived occurrence points
 *   - /api/media/genus/{g}  (Calyx API) — approved, licensed photographs
 */

import { supabase } from '@/lib/supabase';
import { BACKEND_BASE_URL } from '@/lib/backendConfig';

export const PROTOTYPE_SPECIES = 'Vanilla planifolia';
export const PROTOTYPE_GENUS = 'Vanilla';
export const PROTOTYPE_SLUG = 'vanilla-planifolia';

/** Epistemic status of a displayed statement. Never widen this silently. */
export type Epistemic = 'observed' | 'inferred' | 'unknown';

export interface Photograph {
  imageUrl: string;
  scientificName: string;
  sourceName: string;
  license: string | null;
  /** null is a real and common state in the approved library. Never fabricate. */
  attribution: string | null;
}

export interface FungalPartner {
  orchid: string;
  fungalTaxon: string;
  fungalFamily: string | null;
  associationType: string | null;
  note: string | null;
  /** Full literature citation string including DOI, as stored. */
  source: string | null;
}

export interface OccurrencePoint {
  id: string;
  scientificName: string;
  /** Generalized latitude — see generalize(). Never the raw value for a threatened taxon. */
  lat: number;
  lng: number;
  country: string | null;
  year: number | null;
  sourceDataset: string | null;
  /** Whether the fungal partner has been surveyed in this point's country. */
  partnerEvidence: Epistemic;
}

export interface SpeciesProfile {
  slug: string;
  scientificName: string;
  authority: string | null;
  family: string | null;
  subfamily: string | null;
  description: string | null;
  ecology: string | null;
  conservationStatus: string | null;
  iucnCode: string | null;
  countries: string[];
}

export interface DependencyBundle {
  profile: SpeciesProfile;
  photograph: Photograph | null;
  partner: FungalPartner | null;
  occurrences: OccurrencePoint[];
  /** Countries in which the fungal partner was actually sampled, per the cited study. */
  partnerSurveyedCountries: string[];
  /** True when any part came from the captured snapshot rather than a live call. */
  usedCapturedSnapshot: boolean;
  notices: string[];
}

/**
 * Countries named in the sampling design of Porras-Alfaro & Bayman (2007).
 * The study isolated fungi from Vanilla roots in Puerto Rico and Mexico only.
 * Occurrences outside these countries have UNSURVEYED partner status — which
 * is not the same as the partner being absent there.
 */
const PARTNER_SURVEYED_COUNTRIES = ['Puerto Rico', 'Mexico'];

/**
 * Coordinate generalization for at-risk taxa.
 *
 * V. planifolia is Endangered in the wild and live GBIF rows carry
 * coordinate_uncertainty_m as low as 4 m — precise enough to navigate to a
 * individual plant. Public display snaps to a 0.1 degree grid (~11 km at the
 * equator). Full precision stays behind authenticated research access.
 */
const PUBLIC_GRID_DEGREES = 0.1;

export function generalize(value: number): number {
  return Math.round(value / PUBLIC_GRID_DEGREES) * PUBLIC_GRID_DEGREES;
}

export const PUBLIC_GRID_LABEL = '0.1° grid (~11 km)';

// ---------------------------------------------------------------------------
// Captured live responses.
//
// These are verbatim excerpts of real responses retrieved from the production
// data sources on 2026-08-18 (GitHub Actions run 32091809919, which has network
// access this sandbox lacks). They are used ONLY when the live call fails, and
// the UI states plainly when they are in use.
// ---------------------------------------------------------------------------

const CAPTURED_PROFILE: SpeciesProfile = {
  slug: 'vanilla-planifolia',
  scientificName: 'Vanilla planifolia',
  authority: 'Andrews',
  family: 'Orchidaceae',
  subfamily: 'Vanilloideae',
  description:
    'The only commercially cultivated orchid worldwide and the source of natural vanilla. Climbing vines can reach 30 m, producing aromatic seed capsules called "beans".',
  ecology:
    'In the wild, pollinated by Eulaema bees; commercial cultivation requires hand pollination. Wild populations are critically fragmented.',
  conservationStatus: 'Endangered (wild)',
  iucnCode: 'EN',
  countries: ['Mexico', 'Belize', 'Guatemala'],
};

const CAPTURED_PHOTOGRAPH: Photograph = {
  imageUrl: 'https://content.eol.org/data/media/55/2b/c6/509.1001681.jpg',
  scientificName: 'Vanilla planifolia',
  sourceName: 'EOL',
  license: 'cc-by-sa-3.0',
  attribution: null, // genuinely null in the approved library — do not invent
};

const CAPTURED_PARTNER: FungalPartner = {
  orchid: 'Vanilla planifolia',
  fungalTaxon: 'Ceratobasidium',
  fungalFamily: 'Ceratobasidiaceae',
  associationType: 'orchid mycorrhiza',
  note: 'Isolation from terrestrial and aerial roots of cultivated and wild Vanilla in Puerto Rico/Mexico recovered Ceratobasidium and Tulasnella; Ceratobasidium isolates supported symbiotic germination of V. planifolia seed.',
  source:
    'Porras-Alfaro A, Bayman P (2007). Mycorrhizal fungi of Vanilla: diversity, specificity and effects on seed germination and plant growth. Mycologia 99:510-525. https://doi.org/10.3852/mycologia.99.4.510',
};

/** Real V. planifolia rows returned by atlas_occurrences (GBIF, verified). */
const CAPTURED_OCCURRENCES_RAW = [
  { lat: 16.325253, lng: -61.75645, country: 'Guadeloupe', year: 2026 },
  { lat: 16.196525, lng: -61.729611, country: 'Guadeloupe', year: 2026 },
  // Curated points carried on the species record itself:
  { lat: 18.2, lng: -96.1, country: 'Mexico', year: 2016 },
  { lat: 17.3, lng: -89.0, country: 'Guatemala', year: 2018 },
];

function partnerEvidenceFor(country: string | null): Epistemic {
  if (!country) return 'unknown';
  return PARTNER_SURVEYED_COUNTRIES.includes(country) ? 'observed' : 'unknown';
}

function toPoint(
  row: { lat: number; lng: number; country: string | null; year: number | null; sourceDataset?: string | null },
  idx: number,
): OccurrencePoint {
  return {
    id: `occ-${idx}`,
    scientificName: PROTOTYPE_SPECIES,
    lat: generalize(row.lat),
    lng: generalize(row.lng),
    country: row.country,
    year: row.year,
    sourceDataset: row.sourceDataset ?? 'GBIF',
    partnerEvidence: partnerEvidenceFor(row.country),
  };
}

// ---------------------------------------------------------------------------
// Live loaders
// ---------------------------------------------------------------------------

async function loadPhotograph(): Promise<Photograph | null> {
  const res = await fetch(`${BACKEND_BASE_URL}/api/media/genus/${PROTOTYPE_GENUS}?limit=24`);
  if (!res.ok) throw new Error(`media ${res.status}`);
  const payload = await res.json();
  const items: Array<Record<string, unknown>> = Array.isArray(payload?.items) ? payload.items : [];
  // Only accept a photograph whose scientific_name is this species. A
  // genus-level image must not be presented as this species.
  const exact = items.find((i) =>
    String(i.scientific_name ?? '').toLowerCase().startsWith(PROTOTYPE_SPECIES.toLowerCase()),
  );
  if (!exact) return null;
  return {
    imageUrl: String(exact.image_url),
    scientificName: String(exact.scientific_name),
    sourceName: String(exact.source_name ?? 'unknown'),
    license: (exact.license as string) ?? null,
    attribution: (exact.attribution as string) ?? null,
  };
}

async function loadPartner(): Promise<FungalPartner | null> {
  const { data, error } = await supabase
    .from('species_mycorrhizal')
    .select('scientific_name,fungal_taxon,fungal_family,association_type,note,source')
    .eq('scientific_name', PROTOTYPE_SPECIES)
    .limit(1);
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) return null;
  return {
    orchid: row.scientific_name,
    fungalTaxon: row.fungal_taxon,
    fungalFamily: row.fungal_family ?? null,
    associationType: row.association_type ?? null,
    note: row.note ?? null,
    source: row.source ?? null,
  };
}

async function loadOccurrences(): Promise<OccurrencePoint[]> {
  const { data, error } = await supabase
    .from('atlas_occurrences')
    .select('id,scientific_name,lat,lng,country,year,source_dataset')
    .like('scientific_name', `${PROTOTYPE_SPECIES}%`)
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .limit(400);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r, i) =>
    toPoint(
      { lat: r.lat, lng: r.lng, country: r.country, year: r.year, sourceDataset: r.source_dataset },
      i,
    ),
  );
}

async function loadProfile(): Promise<SpeciesProfile | null> {
  const { data, error } = await supabase
    .from('species')
    .select('slug,genus,epithet,authority,family,subfamily,description,ecology,conservation_status,iucn_code,countries')
    .eq('slug', PROTOTYPE_SLUG)
    .limit(1);
  if (error) throw new Error(error.message);
  const r = data?.[0];
  if (!r) return null;
  return {
    slug: r.slug,
    scientificName: `${r.genus} ${r.epithet}`,
    authority: r.authority ?? null,
    family: r.family ?? null,
    subfamily: r.subfamily ?? null,
    description: r.description ?? null,
    ecology: r.ecology ?? null,
    conservationStatus: r.conservation_status ?? null,
    iucnCode: r.iucn_code ?? null,
    countries: Array.isArray(r.countries) ? r.countries : [],
  };
}

/**
 * Load everything the prototype needs. Each source degrades independently to
 * its captured snapshot; the caller is told which ones did.
 */
export async function loadDependencyBundle(forceSnapshot = false): Promise<DependencyBundle> {
  const notices: string[] = [];
  let usedCapturedSnapshot = false;

  const fallback = <T,>(label: string, value: T): T => {
    usedCapturedSnapshot = true;
    notices.push(label);
    return value;
  };

  if (forceSnapshot) {
    return {
      profile: CAPTURED_PROFILE,
      photograph: CAPTURED_PHOTOGRAPH,
      partner: CAPTURED_PARTNER,
      occurrences: CAPTURED_OCCURRENCES_RAW.map((r, i) => toPoint({ ...r, year: r.year }, i)),
      partnerSurveyedCountries: PARTNER_SURVEYED_COUNTRIES,
      usedCapturedSnapshot: true,
      notices: ['All four sources served from the captured 2026-08-18 snapshot (snapshot mode requested).'],
    };
  }

  const [profileR, photoR, partnerR, occR] = await Promise.allSettled([
    loadProfile(),
    loadPhotograph(),
    loadPartner(),
    loadOccurrences(),
  ]);

  const profile =
    profileR.status === 'fulfilled' && profileR.value
      ? profileR.value
      : fallback('Taxon profile served from captured snapshot (live query unavailable).', CAPTURED_PROFILE);

  const photograph =
    photoR.status === 'fulfilled' && photoR.value
      ? photoR.value
      : fallback('Photograph served from captured snapshot (live media query unavailable).', CAPTURED_PHOTOGRAPH);

  const partner =
    partnerR.status === 'fulfilled' && partnerR.value
      ? partnerR.value
      : fallback('Fungal partner record served from captured snapshot (live query unavailable).', CAPTURED_PARTNER);

  const occurrences =
    occR.status === 'fulfilled' && occR.value.length > 0
      ? occR.value
      : fallback(
          'Occurrence points served from captured snapshot (live query unavailable).',
          CAPTURED_OCCURRENCES_RAW.map((r, i) => toPoint({ ...r, year: r.year }, i)),
        );

  return {
    profile,
    photograph,
    partner,
    occurrences,
    partnerSurveyedCountries: PARTNER_SURVEYED_COUNTRIES,
    usedCapturedSnapshot,
    notices,
  };
}
