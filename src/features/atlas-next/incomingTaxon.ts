/**
 * Atlas Next incoming taxon subject.
 *
 * A Research Station (or any other) handoff into Atlas Next arrives on the
 * shared AtlasFilterContext URL contract: `genera` for a genus, `species` for a
 * canonical binomial. Occurrence records carry a binomial `canonicalName` and
 * no infraspecific rank, so an infraspecific subject travels as its binomial in
 * `species` plus a separate `infraspecific` qualifier (for example `var. alba`)
 * that Atlas Next discloses rather than silently drops.
 *
 * The parser is deliberately strict. A name is accepted only when every token
 * matches a bounded shape; anything else is rejected outright rather than being
 * trimmed, re-cased or partially matched into a query. Locality, coordinates,
 * occurrence ids and free text have no channel here.
 */

export const ATLAS_INFRASPECIFIC_PARAM = 'infraspecific';

const MAX_TAXON_NAME_LENGTH = 180;
const GENUS_TOKEN = /^[A-Z][A-Za-z-]+$/;
const EPITHET_TOKEN = /^[a-z][A-Za-z-]+$/;
/** Botanical infraspecific rank markers accepted verbatim (ICN abbreviations). */
const INFRASPECIFIC_MARKERS = ['subsp.', 'var.', 'subvar.', 'f.'] as const;

export type AtlasInfraspecificMarker = (typeof INFRASPECIFIC_MARKERS)[number];

export type AtlasInfraspecificQualifier = {
  marker: AtlasInfraspecificMarker;
  epithet: string;
  /** `marker epithet`, e.g. `var. alba`. */
  label: string;
};

export type AtlasTaxonName =
  | { rank: 'genus'; genus: string; name: string }
  | { rank: 'species'; genus: string; epithet: string; binomial: string; name: string }
  | {
      rank: 'infraspecific';
      genus: string;
      epithet: string;
      binomial: string;
      qualifier: AtlasInfraspecificQualifier;
      name: string;
    };

/**
 * Split a bounded name into single-space separated tokens, or null when the
 * value carries anything other than printable tokens separated by one space.
 */
function tokens(value: unknown): string[] | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_TAXON_NAME_LENGTH) return null;
  const parts = trimmed.split(' ');
  if (parts.some((part) => !part || /\s/.test(part))) return null;
  return parts;
}

function isMarker(value: string): value is AtlasInfraspecificMarker {
  return (INFRASPECIFIC_MARKERS as readonly string[]).includes(value);
}

function qualifierFromTokens(parts: string[]): AtlasInfraspecificQualifier | null {
  if (parts.length !== 2) return null;
  const [marker, epithet] = parts;
  if (!isMarker(marker) || !EPITHET_TOKEN.test(epithet)) return null;
  return { marker, epithet, label: `${marker} ${epithet}` };
}

/** Parse an infraspecific qualifier such as `var. alba`; null when malformed. */
export function parseAtlasInfraspecificQualifier(value: unknown): AtlasInfraspecificQualifier | null {
  const parts = tokens(value);
  return parts ? qualifierFromTokens(parts) : null;
}

/**
 * Parse a canonical genus, binomial, or binomial + one infraspecific rank.
 * Returns null for every other shape (authorities, hybrids, opaque ids,
 * route-shaped or locality-shaped strings, extra whitespace, oversize input).
 */
export function parseAtlasTaxonName(value: unknown): AtlasTaxonName | null {
  const parts = tokens(value);
  if (!parts) return null;

  const [genus, epithet, ...rest] = parts;
  if (!GENUS_TOKEN.test(genus)) return null;
  if (parts.length === 1) return { rank: 'genus', genus, name: genus };

  if (!EPITHET_TOKEN.test(epithet)) return null;
  const binomial = `${genus} ${epithet}`;
  if (parts.length === 2) return { rank: 'species', genus, epithet, binomial, name: binomial };

  const qualifier = qualifierFromTokens(rest);
  if (!qualifier) return null;
  return {
    rank: 'infraspecific',
    genus,
    epithet,
    binomial,
    qualifier,
    name: `${binomial} ${qualifier.label}`,
  };
}

export type AtlasNextIncomingSubject =
  /** A single canonical binomial filters the Atlas. */
  | {
      kind: 'species';
      genus: string;
      binomial: string;
      /** Present when an infraspecific rank arrived; records resolve only to the binomial. */
      qualifier: AtlasInfraspecificQualifier | null;
      name: string;
    }
  /** Only a genus is available: the view is explicitly genus-level. */
  | { kind: 'genus'; genus: string }
  /** No single taxon subject (no filter, or a legitimate multi-genus filter). */
  | { kind: 'none' }
  /** A taxon filter arrived but is malformed or contradictory: nothing is applied. */
  | { kind: 'rejected' };

export type AtlasNextIncomingTaxonFilters = {
  genera?: readonly string[];
  species?: readonly string[];
  infraspecific?: string | null;
};

function supplied(values: readonly string[] | undefined): boolean {
  return Boolean(values && values.length > 0);
}

/**
 * Resolve the single taxon subject Atlas Next may name from the shared filter
 * contract. Rules, all fail-closed:
 *
 * - `species` must be exactly one canonical binomial; a malformed value, more
 *   than one value, or a `genera` filter naming any other genus is rejected
 *   rather than silently widened to the genus or narrowed to the first value.
 * - `infraspecific` is honoured only beside a valid `species` and must parse as
 *   a single rank marker + epithet (malformed → rejected); without `species`
 *   it is ignored and never names the view.
 * - Without `species`, exactly one canonical genus is a genus-level subject;
 *   several genera or a non-canonical genus yield no named subject (the same
 *   contract `resolveAtlasNextIncomingGenus` has always applied).
 */
export function resolveAtlasNextIncomingSubject(
  filters: AtlasNextIncomingTaxonFilters,
): AtlasNextIncomingSubject {
  const { genera, species } = filters;
  const infraspecific = filters.infraspecific ?? null;
  const infraspecificSupplied = infraspecific !== null && infraspecific.trim().length > 0;

  if (supplied(species)) {
    if (species!.length !== 1) return { kind: 'rejected' };
    const parsed = parseAtlasTaxonName(species![0]);
    if (!parsed || parsed.rank !== 'species') return { kind: 'rejected' };

    if (supplied(genera) && (genera!.length !== 1 || genera![0] !== parsed.genus)) {
      return { kind: 'rejected' };
    }

    let qualifier: AtlasInfraspecificQualifier | null = null;
    if (infraspecificSupplied) {
      qualifier = parseAtlasInfraspecificQualifier(infraspecific);
      if (!qualifier) return { kind: 'rejected' };
    }

    return {
      kind: 'species',
      genus: parsed.genus,
      binomial: parsed.binomial,
      qualifier,
      name: qualifier ? `${parsed.binomial} ${qualifier.label}` : parsed.binomial,
    };
  }

  // An infraspecific qualifier has no meaning without its binomial and applies
  // no filter of its own, so it is ignored here: the view is named by whatever
  // genus filter remains, never as the infraspecific taxon.
  if (!supplied(genera)) return { kind: 'none' };

  // Genus-only filters keep their existing contract: the shared filter still
  // applies as written, but only exactly one canonical genus becomes a named
  // subject. A multi-genus or non-canonical genus filter is not promoted.
  if (genera!.length !== 1) return { kind: 'none' };
  const parsed = parseAtlasTaxonName(genera![0]);
  if (!parsed || parsed.rank !== 'genus') return { kind: 'none' };
  return { kind: 'genus', genus: parsed.genus };
}
