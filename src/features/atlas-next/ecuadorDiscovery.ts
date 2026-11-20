import { supabase } from '@/lib/supabase';
import { displayScientificName } from '@/lib/genusProfileDataQuality';
import { parseAtlasTaxonName } from './incomingTaxon';

export const ECUADOR_DISCOVERY_URL = '/atlas-next?expedition=ecuador';
export const ECUADOR_PASSPORT_KEY = 'orchid-continuum.ecuador-passport.v1';

// Only the governed view proposed in #894 is admissible. Even its public
// coordinates, record IDs, locality strings and relationship JSON stay out of
// this journey. Never fall back to the raw table or another occurrence API.
const DISPLAY_COLUMNS = 'accepted_name,genus,country,habitat,elevation_m,source_dataset,verified,locality_withheld,published_precision_reason';
const ELIGIBLE_REASONS = ['exact', 'source-imprecision', 'curated-release'];
const SOURCE_LABELS: Record<string, string> = {
  gbif: 'GBIF', inaturalist: 'iNaturalist', 'world plants': 'World Plants',
};
const HABITAT_LABELS: Record<string, string> = {
  'cloud forest': 'Cloud forest',
  'montane forest': 'Montane forest',
  'montane cloud forest': 'Montane cloud forest',
  'tropical forest': 'Tropical forest',
  'tropical rainforest': 'Tropical rainforest',
  'premontane forest': 'Premontane forest',
  'lowland forest': 'Lowland forest',
  'dry forest': 'Dry forest',
  páramo: 'Páramo',
};

export interface DiscoveryRecord {
  name: string;
  genus: string;
  country: 'Ecuador';
  habitat?: string;
  elevationBand?: string;
  source: string;
}

export function selectDiscoveryRecords(rows: unknown): DiscoveryRecord[] {
  if (!Array.isArray(rows)) return [];
  const records = new Map<string, DiscoveryRecord>();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || row.verified !== true
      || typeof row.accepted_name !== 'string' || row.accepted_name.length > 140
      || typeof row.country !== 'string' || row.country.trim().toLowerCase() !== 'ecuador'
      || row.locality_withheld !== false
      || !ELIGIBLE_REASONS.includes(row.published_precision_reason)) continue;
    const taxon = parseAtlasTaxonName(displayScientificName(row.accepted_name));
    if (taxon?.rank !== 'species' || taxon.genus !== row.genus || records.has(taxon.binomial)) continue;
    const publisher = typeof row.source_dataset === 'string'
      ? SOURCE_LABELS[row.source_dataset.trim().toLowerCase()] : undefined;
    const habitat = typeof row.habitat === 'string'
      ? HABITAT_LABELS[row.habitat.trim().toLowerCase()] : undefined;
    const elevation = typeof row.elevation_m === 'number'
      && row.elevation_m >= 0 && row.elevation_m <= 6500 ? row.elevation_m : null;
    const lower = elevation === null ? null : Math.floor(elevation / 500) * 500;
    records.set(taxon.binomial, {
      name: taxon.binomial,
      genus: taxon.genus,
      country: 'Ecuador',
      source: typeof publisher === 'string' ? publisher : 'Orchid Continuum Atlas · governed occurrence view',
      ...(typeof habitat === 'string' ? { habitat } : {}),
      ...(lower !== null ? { elevationBand: `${lower}–${lower + 499} m` } : {}),
    });
    if (records.size === 3) break;
  }
  return [...records.values()];
}

export async function loadDiscoveryRecords(signal: AbortSignal): Promise<DiscoveryRecord[]> {
  const { data, error } = await supabase
    .from('atlas_occurrences_public')
    .select(DISPLAY_COLUMNS)
    .ilike('country', 'Ecuador')
    .eq('verified', true)
    .eq('locality_withheld', false)
    .in('published_precision_reason', ELIGIBLE_REASONS)
    .or(['habitat.is.null', ...Object.keys(HABITAT_LABELS).map((key) => `habitat.ilike.${key}`)].join(','))
    .order('id')
    .limit(240)
    .abortSignal(signal);
  if (error) throw new Error('Governed occurrence view unavailable');
  return selectDiscoveryRecords(data);
}

const COORDINATE_TEXT = /(?:[+-]?\d{1,3}\.\d+\s*[,; ]\s*[+-]?\d{1,3}(?:\.\d+)?|[+-]?\d{1,3}\s*[,; ]\s*[+-]?\d{1,3}\.\d+|\d+(?:\.\d+)?\s*[°º]|\b(?:latitude|longitude|gps)\b)/i;

export type Passport = Record<string, { note?: string }>;

export function safeDiscoveryNote(text: string): string | null {
  const note = text.trim();
  return note && note.length <= 480 && !COORDINATE_TEXT.test(note) ? note : null;
}

export function readDiscoveryPassport(): Passport {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(ECUADOR_PASSPORT_KEY) ?? '{}');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).flatMap(([name, entry]) => {
      if (parseAtlasTaxonName(name)?.rank !== 'species' || !entry || typeof entry !== 'object') return [];
      const note = typeof entry.note === 'string' ? safeDiscoveryNote(entry.note) : null;
      return [[name, note ? { note } : {}]];
    }));
  } catch {
    return {};
  }
}

export function writeDiscoveryPassport(name: string, entry: Passport[string]): Passport {
  const current = readDiscoveryPassport();
  const passport = { ...current, [name]: { ...current[name], ...entry } };
  localStorage.setItem(ECUADOR_PASSPORT_KEY, JSON.stringify(passport));
  return passport;
}
