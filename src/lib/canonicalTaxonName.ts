/**
 * One bounded shape for a canonical taxon name carried between Continuum
 * surfaces (Species Dossier → Atlas, Research, Calyx).
 *
 * Accepted, and nothing else:
 *   - a binomial                      `Cattleya labiata`
 *   - a nothotaxon with a hybrid sign `Phalaenopsis × intermedia` (or `x`)
 *   - one infraspecific rank          `Dendrobium nobile var. alba`,
 *                                     `Ophrys apifera subsp. jurana`
 *
 * This mirrors the backend's shared name split (orchid-calyx-backend
 * `species_exhibit.service._split_scientific_name`), which since #1481/#1483
 * presents `accepted_name` in exactly these shapes. Authorship, route ids,
 * taxonomy ids, locality material and free text never match, so a malformed
 * identity still fails closed rather than widening into a search.
 */

const GENUS = '[A-Z][A-Za-z-]+';
const EPITHET = '[a-z][a-z-]+';
const CULTIVAR_EPITHET = '[A-Z][A-Za-z-]+';
const HYBRID_SIGN = '(?:×|x)';

export type CanonicalTaxonRank = 'species' | 'hybrid' | 'subspecies' | 'variety' | 'subvariety' | 'form' | 'subform' | 'nothosubspecies' | 'nothovariety' | 'cultivar';

const RANK_LABEL = {
  'subsp.': 'subspecies',
  'ssp.': 'subspecies',
  'var.': 'variety',
  'subvar.': 'subvariety',
  'f.': 'form',
  'fo.': 'form',
  forma: 'form',
  'subf.': 'subform',
  'nothosubsp.': 'nothosubspecies',
  'nothovar.': 'nothovariety',
  'cv.': 'cultivar',
} as const satisfies Record<string, CanonicalTaxonRank>;

const RANK_MARKERS = Object.keys(RANK_LABEL) as Array<keyof typeof RANK_LABEL>;
const AUTHOR_CONNECTIVES = new Set(['ex', 'et', 'in', 'and', 'nec', 'non', 'emend', 'sensu']);

/** `var.` -> `[vV][aA][rR]\.` — case-insensitive for this token only. */
function anyCase(marker: string): string {
  return [...marker]
    .map(character => {
      if (character === '.') return '\\.';
      const lower = character.toLowerCase();
      const upper = character.toUpperCase();
      return lower === upper ? lower : `[${lower}${upper}]`;
    })
    .join('');
}

/**
 * Only the rank marker is case-insensitive, matching the backend's
 * `token.lower() in INFRASPECIFIC_RANKS`. A source row spelled
 * `Dendrobium nobile VAR. alba` keeps its accepted name on the backend, so the
 * frontend must not silently drop every continuation for it. Genus and epithet
 * stay case-sensitive: a capitalised epithet is not a valid epithet, and a
 * lowercase genus is not a genus.
 */
const NON_CULTIVAR_RANK = `(?:${RANK_MARKERS.filter(marker => marker !== 'cv.').map(anyCase).join('|')})`;
const CULTIVAR_RANK = anyCase('cv.');

export const CANONICAL_TAXON_NAME = new RegExp(
  `^(${GENUS})\\s+(?:(${HYBRID_SIGN})\\s+)?(${EPITHET})(?:\\s+(?:(${NON_CULTIVAR_RANK})\\s+(${EPITHET})|(${CULTIVAR_RANK})\\s+(${CULTIVAR_EPITHET})))?/**
 * One bounded shape for a canonical taxon name carried between Continuum
 * surfaces (Species Dossier → Atlas, Research, Calyx).
 *
 * Accepted, and nothing else:
 *   - a binomial                      `Cattleya labiata`
 *   - a nothotaxon with a hybrid sign `Phalaenopsis × intermedia` (or `x`)
 *   - one infraspecific rank          `Dendrobium nobile var. alba`,
 *                                     `Ophrys apifera subsp. jurana`
 *
 * This mirrors the backend's shared name split (orchid-calyx-backend
 * `species_exhibit.service._split_scientific_name`), which since #1481/#1483
 * presents `accepted_name` in exactly these shapes. Authorship, route ids,
 * taxonomy ids, locality material and free text never match, so a malformed
 * identity still fails closed rather than widening into a search.
 */

const GENUS = '[A-Z][A-Za-z-]+';
const EPITHET = '[a-z][a-z-]+';
const CULTIVAR_EPITHET = '[A-Z][A-Za-z-]+';
const HYBRID_SIGN = '(?:×|x)';

export type CanonicalTaxonRank = 'species' | 'hybrid' | 'subspecies' | 'variety' | 'subvariety' | 'form' | 'subform' | 'nothosubspecies' | 'nothovariety' | 'cultivar';

const RANK_LABEL = {
  'subsp.': 'subspecies',
  'ssp.': 'subspecies',
  'var.': 'variety',
  'subvar.': 'subvariety',
  'f.': 'form',
  'fo.': 'form',
  forma: 'form',
  'subf.': 'subform',
  'nothosubsp.': 'nothosubspecies',
  'nothovar.': 'nothovariety',
  'cv.': 'cultivar',
} as const satisfies Record<string, CanonicalTaxonRank>;

const RANK_MARKERS = Object.keys(RANK_LABEL) as Array<keyof typeof RANK_LABEL>;
const AUTHOR_CONNECTIVES = new Set(['ex', 'et', 'in', 'and', 'nec', 'non', 'emend', 'sensu']);

/** `var.` -> `[vV][aA][rR]\.` — case-insensitive for this token only. */
function anyCase(marker: string): string {
  return [...marker]
    .map(character => {
      if (character === '.') return '\\.';
      const lower = character.toLowerCase();
      const upper = character.toUpperCase();
      return lower === upper ? lower : `[${lower}${upper}]`;
    })
    .join('');
}

/**
 * Only the rank marker is case-insensitive, matching the backend's
 * `token.lower() in INFRASPECIFIC_RANKS`. A source row spelled
 * `Dendrobium nobile VAR. alba` keeps its accepted name on the backend, so the
 * frontend must not silently drop every continuation for it. Genus and epithet
 * stay case-sensitive: a capitalised epithet is not a valid epithet, and a
 * lowercase genus is not a genus.
 */
,
);

export const MAX_CANONICAL_TAXON_LENGTH = 180;

export type CanonicalTaxonName = {
  genus: string;
  /** The whole bounded name, whitespace-normalised. */
  taxon: string;
  rank: CanonicalTaxonRank;
};

/**
 * Parse a candidate into a bounded canonical taxon name, or `null`.
 * Never trims material away to make a match: the whole value must be the name.
 */
export function boundedCanonicalTaxon(value: unknown): CanonicalTaxonName | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(/\s+/g, ' ');
  if (!text || text.length > MAX_CANONICAL_TAXON_LENGTH) return null;
  const match = text.match(CANONICAL_TAXON_NAME);
  if (!match) return null;
  const [, genus, hybridSign, epithet, regularRank, regularEpithet, cultivarRank, cultivarEpithet] = match;
  const rankMarker = regularRank ?? cultivarRank;
  const infraEpithet = regularEpithet ?? cultivarEpithet;
  if (regularEpithet && AUTHOR_CONNECTIVES.has(regularEpithet.toLowerCase())) return null;
  const parts = [genus, hybridSign, epithet, rankMarker, infraEpithet].filter(Boolean) as string[];
  const rank: CanonicalTaxonName['rank'] = rankMarker
    ? RANK_LABEL[rankMarker.toLowerCase() as keyof typeof RANK_LABEL]
    : hybridSign
      ? 'hybrid'
      : 'species';
  return { genus, taxon: parts.join(' '), rank };
}
