/**
 * atlasColor — colour-by schemes for the Living Atlas homepage map.
 *
 * Each mode maps an AtlasOccurrencePoint to a hex colour and provides a
 * matching legend. All schemes degrade gracefully: a point with no data for
 * the active dimension falls into a neutral "Unknown / other" bucket.
 */

import type { AtlasOccurrencePoint } from './orchidContinuum';

export type ColorMode = 'conservation' | 'genus' | 'pollinator' | 'region' | 'climate';

export interface ColorModeDef {
  id: ColorMode;
  label: string;
}

export const COLOR_MODES: ColorModeDef[] = [
  { id: 'conservation', label: 'Conservation status' },
  { id: 'genus', label: 'Genus' },
  { id: 'pollinator', label: 'Pollinator guild' },
  { id: 'region', label: 'Region' },
  { id: 'climate', label: 'Climate zone' },
];

const NEUTRAL = '#8a8478';

// ---------------------------------------------------------------------------
// Genus — curated cycling palette, stable per genus name.
// ---------------------------------------------------------------------------

const GENUS_PALETTE = [
  '#d4b34a', '#7dd3a8', '#9ad6ff', '#fda4af', '#c084fc',
  '#ffd166', '#ff9b6a', '#86efac', '#f0abfc', '#fbbf24',
  '#5eead4', '#fca5a5', '#a5b4fc', '#fdba74', '#bef264',
  '#f9a8d4', '#38bdf8', '#fb7185', '#a3e635', '#e879f9',
  '#2dd4bf', '#f97316', '#818cf8', '#facc15', '#34d399',
  '#fb923c', '#60a5fa', '#c4b5fd',
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function genusColor(genus: string | undefined): string {
  if (!genus) return NEUTRAL;
  return GENUS_PALETTE[hashString(genus) % GENUS_PALETTE.length];
}

// ---------------------------------------------------------------------------
// Conservation status
// ---------------------------------------------------------------------------

function conservationColor(p: AtlasOccurrencePoint): string {
  const s = `${p.iucnCode ?? ''} ${p.conservationStatus ?? ''}`.toLowerCase();
  if (/critically|^cr\b|\bcr\b/.test(s)) return '#dc2626'; // CR red
  if (/endangered|\ben\b/.test(s)) return '#f97316'; // EN orange
  if (/vulnerable|\bvu\b/.test(s)) return '#f59e0b'; // VU amber
  if (/near.?threatened|\bnt\b/.test(s)) return '#a3e635'; // NT yellow-green
  if (/least.?concern|\blc\b/.test(s)) return '#22c55e'; // LC green
  if (/data.?deficient|\bdd\b/.test(s)) return '#9ca3af'; // DD grey
  return '#6b7280';
}

// ---------------------------------------------------------------------------
// Pollinator guild
// ---------------------------------------------------------------------------

function pollinatorColor(p: AtlasOccurrencePoint): string {
  const text = p.pollinators
    .flatMap((pl) => [pl.taxon, pl.name, pl.mechanism])
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!text) return NEUTRAL;
  if (/deceiv|mimic|pseudocopul|sexual/.test(text)) return '#7f1d1d'; // deceptive dark red
  if (/bee|euglossin|melipona|bombus|apis|carpenter|halictid/.test(text)) return '#eab308'; // bees gold
  if (/moth|sphinx|hawkmoth|lepidopter|butterfl/.test(text)) return '#a855f7'; // moths purple
  if (/fly|flies|gnat|diptera|midge|carrion/.test(text)) return '#84a98c'; // flies grey-green
  if (/bird|hummingbird|sunbird/.test(text)) return '#fb7185'; // birds coral
  if (/wind|anemophil|self|autogam/.test(text)) return '#60a5fa'; // wind blue
  return '#eab308';
}

// ---------------------------------------------------------------------------
// Region (from country)
// ---------------------------------------------------------------------------

type RegionKey = 'Americas' | 'Asia' | 'Africa' | 'Europe' | 'Oceania' | 'Other';

const REGION_COLORS: Record<RegionKey, string> = {
  Americas: '#d4b34a',
  Asia: '#2dd4bf',
  Africa: '#e07856',
  Europe: '#9caf88',
  Oceania: '#fb7185',
  Other: NEUTRAL,
};

function regionKey(p: AtlasOccurrencePoint): RegionKey {
  const c = (p.country || p.countries[0] || p.region || '').toLowerCase();
  if (!c) return 'Other';
  const has = (arr: string[]) => arr.some((x) => c.includes(x));
  if (has(['united states', 'usa', 'canada', 'mexico', 'brazil', 'brasil', 'colombia', 'ecuador', 'peru', 'bolivia', 'venezuela', 'argentina', 'chile', 'guatemala', 'costa rica', 'panama', 'cuba', 'guyana', 'suriname', 'honduras', 'nicaragua', 'paraguay', 'uruguay', 'belize', 'caribbean'])) return 'Americas';
  if (has(['china', 'japan', 'korea', 'india', 'nepal', 'bhutan', 'thailand', 'vietnam', 'viet nam', 'laos', 'cambodia', 'malaysia', 'indonesia', 'philippines', 'myanmar', 'borneo', 'sri lanka', 'taiwan', 'singapore', 'bangladesh', 'pakistan', 'asia'])) return 'Asia';
  if (has(['madagascar', 'south africa', 'kenya', 'tanzania', 'uganda', 'cameroon', 'gabon', 'congo', 'nigeria', 'ethiopia', 'mozambique', 'angola', 'reunion', 'réunion', 'mauritius', 'ghana', 'africa'])) return 'Africa';
  if (has(['united kingdom', 'germany', 'france', 'italy', 'spain', 'portugal', 'sweden', 'norway', 'poland', 'greece', 'austria', 'switzerland', 'netherlands', 'belgium', 'ireland', 'russia', 'ukraine', 'romania', 'europe'])) return 'Europe';
  if (has(['australia', 'new zealand', 'papua', 'new guinea', 'solomon', 'fiji', 'vanuatu', 'samoa', 'caledonia', 'polynesia', 'oceania', 'pacific'])) return 'Oceania';
  return 'Other';
}

// ---------------------------------------------------------------------------
// Climate zone (from latitude + elevation)
// ---------------------------------------------------------------------------

type ClimateKey = 'Tropical' | 'Montane' | 'Mediterranean' | 'Temperate';

const CLIMATE_COLORS: Record<ClimateKey, string> = {
  Tropical: '#15803d',
  Montane: '#64748b',
  Mediterranean: '#d4b34a',
  Temperate: '#9caf88',
};

function climateKey(p: AtlasOccurrencePoint): ClimateKey {
  const absLat = Math.abs(p.lat);
  if ((p.elevation_m ?? 0) >= 1500) return 'Montane';
  if (absLat <= 23.5) return 'Tropical';
  if (absLat <= 38) return 'Mediterranean';
  return 'Temperate';
}

// ---------------------------------------------------------------------------
// Public: colour + legend
// ---------------------------------------------------------------------------

export function colorForPoint(p: AtlasOccurrencePoint, mode: ColorMode): string {
  switch (mode) {
    case 'genus':
      return genusColor(p.genus);
    case 'conservation':
      return conservationColor(p);
    case 'pollinator':
      return pollinatorColor(p);
    case 'region':
      return REGION_COLORS[regionKey(p)];
    case 'climate':
      return CLIMATE_COLORS[climateKey(p)];
    default:
      return NEUTRAL;
  }
}

export interface LegendEntry {
  label: string;
  color: string;
}

/**
 * Static legend per mode. For genus the legend is data-dependent, so callers
 * pass the visible genera; everything else has a fixed key.
 */
export function legendFor(
  mode: ColorMode,
  topGenera: string[] = [],
): LegendEntry[] {
  switch (mode) {
    case 'conservation':
      return [
        { label: 'LC · Least concern', color: '#22c55e' },
        { label: 'NT · Near threatened', color: '#a3e635' },
        { label: 'VU · Vulnerable', color: '#f59e0b' },
        { label: 'EN · Endangered', color: '#f97316' },
        { label: 'CR · Critically endangered', color: '#dc2626' },
        { label: 'DD · Data deficient', color: '#9ca3af' },
      ];
    case 'pollinator':
      return [
        { label: 'Bees', color: '#eab308' },
        { label: 'Moths', color: '#a855f7' },
        { label: 'Flies', color: '#84a98c' },
        { label: 'Birds', color: '#fb7185' },
        { label: 'Wind / self', color: '#60a5fa' },
        { label: 'Deceptive', color: '#7f1d1d' },
        { label: 'Unrecorded', color: NEUTRAL },
      ];
    case 'region':
      return [
        { label: 'Americas', color: REGION_COLORS.Americas },
        { label: 'Asia', color: REGION_COLORS.Asia },
        { label: 'Africa', color: REGION_COLORS.Africa },
        { label: 'Europe', color: REGION_COLORS.Europe },
        { label: 'Oceania', color: REGION_COLORS.Oceania },
        { label: 'Other / unknown', color: REGION_COLORS.Other },
      ];
    case 'climate':
      return [
        { label: 'Tropical', color: CLIMATE_COLORS.Tropical },
        { label: 'Montane (>1500 m)', color: CLIMATE_COLORS.Montane },
        { label: 'Mediterranean', color: CLIMATE_COLORS.Mediterranean },
        { label: 'Temperate', color: CLIMATE_COLORS.Temperate },
      ];
    case 'genus':
      return topGenera.slice(0, 12).map((g) => ({ label: g, color: genusColor(g) }));
    default:
      return [];
  }
}
