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
const HYBRID_SIGN = '(?:×|x)';
const INFRASPECIFIC_RANK = '(?:subsp\\.|ssp\\.|var\\.|subvar\\.|f\\.|fo\\.|forma|subf\\.|nothosubsp\\.|nothovar\\.|cv\\.)';

export const CANONICAL_TAXON_NAME = new RegExp(
  `^(${GENUS})\\s+(?:(${HYBRID_SIGN})\\s+)?(${EPITHET})(?:\\s+(${INFRASPECIFIC_RANK})\\s+(${EPITHET}))?$`,
);

export const MAX_CANONICAL_TAXON_LENGTH = 180;

export type CanonicalTaxonName = {
  genus: string;
  /** The whole bounded name, whitespace-normalised. */
  taxon: string;
  rank: 'species' | 'hybrid' | 'subspecies' | 'variety' | 'subvariety' | 'form' | 'subform' | 'nothosubspecies' | 'nothovariety' | 'cultivar';
};

const RANK_LABEL: Record<string, CanonicalTaxonName['rank']> = {
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
  const [, genus, hybridSign, epithet, rankMarker, infraEpithet] = match;
  const parts = [genus, hybridSign, epithet, rankMarker, infraEpithet].filter(Boolean) as string[];
  const rank: CanonicalTaxonName['rank'] = rankMarker
    ? RANK_LABEL[rankMarker]
    : hybridSign
      ? 'hybrid'
      : 'species';
  return { genus, taxon: parts.join(' '), rank };
}
