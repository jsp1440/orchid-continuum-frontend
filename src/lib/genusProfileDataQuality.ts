/**
 * genusProfileDataQuality — shared, server-authoritative-safe repairs for the
 * public Featured Genus / genus-profile surfaces (FRONTEND-DATA-QUALITY-003).
 *
 * Every function here is PURE. Nothing in this module fetches, infers, or
 * invents scientific content: it only normalises how canonical backend
 * evidence is *displayed*, and it makes the difference between
 * "no linked evidence" and "evidence service unavailable" explicit.
 *
 * Scope rules encoded here:
 *   • A displayed scientific name is genus + specific epithet. The authored
 *     name (author strings, infraspecific ranks) is preserved separately for
 *     provenance/detail — never mixed into the display binomial.
 *   • Representative media is deduplicated by normalised taxon identity AND by
 *     normalised media URL, so one species or one photograph cannot dominate a
 *     gallery.
 *   • Ecological claims carry an evidence state (`available` / `provisional` /
 *     `unavailable`) plus the reason that produced it. `unavailable` never
 *     means zero, and `provisional` never means verified.
 */

/** Author strings, sensu/aff. qualifiers and infraspecific ranks to strip. */
const INFRASPECIFIC_RANK_RE = /\b(var|subsp|ssp|subvar|f|fo|forma|cv|nothovar|grex)\b\.?/i;
const QUALIFIER_RE = /^(cf|aff|sp|spp|nr)\.?$/i;
const HYBRID_MARKER_RE = /^[×x]$/i;

/**
 * A token counts as the specific epithet only when its casing is unambiguous:
 * entirely lower case (`labiata`) or entirely upper case (`LABIATA`, a common
 * source-formatting artefact). Title-case tokens (`Lindl`, `Luer`, `Rchb.f.`)
 * and anything containing punctuation or digits are treated as authorship and
 * are never promoted into the display binomial.
 */
function isEpithetToken(token: string): boolean {
  if (!/^[A-Za-zß-öø-ÿ][A-Za-zß-öø-ÿ-]*$/.test(token)) return false;
  return token === token.toLowerCase() || token === token.toUpperCase();
}

function tokenize(name: string): string[] {
  return String(name ?? '')
    .replace(/[×]/g, '× ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Display binomial: `Genus epithet`, with the genus capitalised and the
 * epithet lower-cased. Author strings ("Lindl.", "(Rchb.f.) Schltr."),
 * infraspecific ranks and cf./aff. qualifiers are removed.
 *
 * When a specific epithet cannot be identified (genus-only records, unparsable
 * strings) the cleaned genus token is returned rather than a fabricated name.
 */
export function displayScientificName(name: string): string {
  const tokens = tokenize(name);
  if (tokens.length === 0) return '';

  let genus = '';
  let epithet = '';

  for (const token of tokens) {
    if (HYBRID_MARKER_RE.test(token)) continue;
    if (!genus) {
      // The genus is the first alphabetic token; keep its canonical casing.
      if (!/^[A-Za-zß-öø-ÿ][A-Za-zß-öø-ÿ-]*$/.test(token)) continue;
      genus = token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
      continue;
    }
    if (QUALIFIER_RE.test(token)) return genus;
    if (INFRASPECIFIC_RANK_RE.test(token)) break;
    if (!isEpithetToken(token)) break; // authorship or a parenthetical author
    epithet = token.toLowerCase();
    break;
  }

  return epithet ? `${genus} ${epithet}` : genus;
}

/**
 * The full authored scientific name exactly as the canonical source supplied
 * it, whitespace-normalised. This is what provenance/metadata must show so no
 * authorship is lost when the display name is shortened.
 */
export function authoredScientificName(name: string): string {
  return String(name ?? '').replace(/\s+/g, ' ').trim();
}

/** True when the display binomial actually drops information from the source. */
export function hasAuthorship(name: string): boolean {
  const authored = authoredScientificName(name);
  return Boolean(authored) && authored !== displayScientificName(name);
}

/** Normalised taxon identity used for de-duplication and media matching. */
export function normalizedTaxonKey(name: string): string {
  return displayScientificName(name).toLowerCase();
}

/**
 * Normalised media identity. Two records that resolve to the same host + path
 * are the same photograph even when their query strings differ, so the same
 * image can never be shown twice in one gallery.
 */
export function normalizedMediaKey(url: string): string {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.host.toLowerCase()}${path.toLowerCase()}`;
  } catch {
    return raw.toLowerCase().split(/[?#]/)[0].replace(/\/+$/, '');
  }
}

export type RepresentativeMediaCandidate = {
  scientific_name: string;
  image_url: string;
};

export type SelectRepresentativeMediaOptions = {
  /** Maximum tiles to return. */
  limit?: number;
  /** Maximum tiles a single normalised taxon may occupy. */
  maxPerTaxon?: number;
  /** Media keys already rendered elsewhere on the page (e.g. the hero). */
  exclude?: Iterable<string>;
  /**
   * Normalised taxon keys already represented elsewhere on the page. The hero
   * species belongs here so the gallery beneath it shows OTHER species instead
   * of repeating the one the visitor is already looking at.
   */
  excludeTaxa?: Iterable<string>;
};

/**
 * Choose representative media for a gallery.
 *
 * Drops: blank/invalid records, repeated photographs (normalised URL), and
 * repeats of a taxon beyond `maxPerTaxon`. Ordering from the canonical source
 * is preserved — this only removes, it never re-ranks or substitutes.
 */
export function selectRepresentativeMedia<T extends RepresentativeMediaCandidate>(
  items: readonly T[],
  options: SelectRepresentativeMediaOptions = {},
): T[] {
  const { limit = 6, maxPerTaxon = 1 } = options;
  if (limit <= 0 || maxPerTaxon <= 0) return [];

  const seenMedia = new Set<string>(options.exclude ?? []);
  const excludedTaxa = new Set<string>(options.excludeTaxa ?? []);
  const perTaxon = new Map<string, number>();
  const selected: T[] = [];

  for (const item of items ?? []) {
    if (selected.length >= limit) break;
    if (!item || typeof item.image_url !== 'string') continue;

    const mediaKey = normalizedMediaKey(item.image_url);
    if (!mediaKey || seenMedia.has(mediaKey)) continue;

    const taxonKey = normalizedTaxonKey(item.scientific_name);
    if (!taxonKey || excludedTaxa.has(taxonKey)) continue;
    const used = perTaxon.get(taxonKey) ?? 0;
    if (used >= maxPerTaxon) continue;

    seenMedia.add(mediaKey);
    perTaxon.set(taxonKey, used + 1);
    selected.push(item);
  }

  return selected;
}

/** De-duplicate species entries by normalised taxon identity, keeping order. */
export function dedupeByTaxonIdentity<T>(
  entries: readonly T[],
  nameOf: (entry: T) => string,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const entry of entries ?? []) {
    const key = normalizedTaxonKey(nameOf(entry));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Evidence states                                                     */
/* ------------------------------------------------------------------ */

export type EcologicalEvidenceState = 'available' | 'provisional' | 'unavailable';

export type EcologicalEvidenceReason =
  | 'linked-evidence'
  | 'curated-genus-summary'
  | 'no-linked-evidence'
  | 'service-unavailable';

export type EcologicalEvidence = {
  state: EcologicalEvidenceState;
  reason: EcologicalEvidenceReason;
  /** Scope the claim is true at. Species-level claims require species evidence. */
  scope: 'genus' | 'none';
  /** Human copy that never asserts more than the reason supports. */
  detail: string;
};

export type EcologicalEvidenceInput = {
  /** False when the canonical evidence service did not answer at all. */
  serviceAnswered: boolean;
  /** Canonical linked-evidence summary, when the service returned one. */
  linkedSummary?: string | null;
  /** True only when the canonical service reported linked records. */
  hasLinkedEvidence?: boolean;
  /** True when the summary came from a client-side placeholder, not the graph. */
  isFallback?: boolean;
  /** Curated, genus-scope field-guide text held in this repository. */
  curatedGenusSummary?: string | null;
};

const NON_EVIDENCE_SUMMARY_RE = /^(no data( yet)?|unknown|n\/?a|none|null|-)$/i;

function usableSummary(value: string | null | undefined): string {
  const text = String(value ?? '').trim();
  return text && !NON_EVIDENCE_SUMMARY_RE.test(text) ? text : '';
}

/**
 * Derive a truthful evidence state for an ecological relationship claim.
 *
 * `available`   — the canonical Continuum service returned linked evidence.
 * `provisional` — only a curated genus-level summary exists. It describes the
 *                 genus, is not verified per species, and is not Continuum
 *                 evidence.
 * `unavailable` — nothing can be claimed. The `reason` separates "the service
 *                 answered and holds no link yet" from "the service could not
 *                 be reached"; neither means the relationship is biologically
 *                 absent, and neither is a zero.
 */
export function deriveEcologicalEvidence(input: EcologicalEvidenceInput): EcologicalEvidence {
  const linked = usableSummary(input.linkedSummary);
  const curated = usableSummary(input.curatedGenusSummary);

  if (input.serviceAnswered && input.hasLinkedEvidence && !input.isFallback && linked) {
    return {
      state: 'available',
      reason: 'linked-evidence',
      scope: 'genus',
      detail: linked,
    };
  }

  if (curated) {
    return {
      state: 'provisional',
      reason: 'curated-genus-summary',
      scope: 'genus',
      detail: curated,
    };
  }

  if (!input.serviceAnswered) {
    return {
      state: 'unavailable',
      reason: 'service-unavailable',
      scope: 'none',
      detail: 'The Continuum evidence service did not respond. No claim is made either way.',
    };
  }

  return {
    state: 'unavailable',
    reason: 'no-linked-evidence',
    scope: 'none',
    detail: 'The Continuum holds no linked records for this relationship yet. That is a knowledge gap, not biological absence.',
  };
}

/** Short label for an evidence state, safe for badges. */
export const EVIDENCE_STATE_LABEL: Record<EcologicalEvidenceState, string> = {
  available: 'Evidence available',
  provisional: 'Provisional · genus-level',
  unavailable: 'Evidence unavailable',
};

/* ------------------------------------------------------------------ */
/* Representative species plates                                       */
/* ------------------------------------------------------------------ */

export type RepresentativePlate<T> = {
  entry: T;
  /** Candidate media for this plate, with photographs claimed earlier removed. */
  urls: string[];
  /** Display binomial (genus + specific epithet). */
  displayName: string;
  /** Authored name as supplied, for provenance/detail. */
  authoredName: string;
};

/**
 * Build the representative species gallery.
 *
 * One tile per normalised taxon identity, and one tile per photograph: a URL
 * already claimed by an earlier tile is removed from every later tile's
 * candidate list, so neither a repeated species nor a repeated photograph can
 * dominate the gallery. Source ordering is preserved.
 */
export function buildRepresentativePlates<T>(
  entries: readonly T[],
  options: {
    nameOf: (entry: T) => string;
    urlsOf: (entry: T) => readonly string[];
    limit?: number;
  },
): Array<RepresentativePlate<T>> {
  const { nameOf, urlsOf, limit } = options;
  const seenTaxa = new Set<string>();
  const seenMedia = new Set<string>();
  const out: Array<RepresentativePlate<T>> = [];

  for (const entry of entries ?? []) {
    if (limit !== undefined && out.length >= limit) break;

    const authoredName = authoredScientificName(nameOf(entry));
    const taxonKey = normalizedTaxonKey(authoredName);
    if (!taxonKey || seenTaxa.has(taxonKey)) continue;
    seenTaxa.add(taxonKey);

    const urls: string[] = [];
    for (const candidate of urlsOf(entry) ?? []) {
      const url = String(candidate ?? '').trim();
      if (!url) continue;
      const mediaKey = normalizedMediaKey(url);
      if (!mediaKey || seenMedia.has(mediaKey)) continue;
      seenMedia.add(mediaKey);
      urls.push(url);
    }

    out.push({
      entry,
      urls,
      displayName: displayScientificName(authoredName),
      authoredName,
    });
  }

  return out;
}
