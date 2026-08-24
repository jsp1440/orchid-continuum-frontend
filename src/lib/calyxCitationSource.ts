import type { CalyxCitation } from '@/lib/calyxWorkspace';

/**
 * Resolve a Calyx citation's persistent identifiers into clickable canonical
 * source links, so a reader can follow the evidence from a Calyx answer to the
 * actual literature rather than reading a bare identifier string.
 *
 * Only well-formed identifiers become links. A malformed value is kept as plain
 * text (fail closed to text, never a broken or attacker-shaped link): the
 * identifier is still shown for the record, but nothing invites a click to a
 * URL the identifier did not actually specify. Every URL is https and points at
 * the identifier's standard resolver — no user- or model-supplied URL is ever
 * followed.
 */
export interface CitationIdentifierPart {
  kind: 'doi' | 'pmid' | 'pmcid';
  /** The human-readable identifier text, e.g. "DOI 10.1234/abc". */
  label: string;
  /** Canonical resolver URL when the identifier is well-formed, else null. */
  url: string | null;
}

// DOI: "10." then a 4-9 digit registrant, "/", then a suffix restricted to a
// conservative URL-safe set. In particular, angle brackets and whitespace are
// rejected rather than echoed into an href; malformed-but-present identifiers
// remain visible as plain text through `url: null`.
const DOI_PATTERN = /^10\.\d{4,9}\/[A-Za-z0-9._;()/:+-]+$/;
const PMID_PATTERN = /^\d{1,9}$/;
const PMCID_PATTERN = /^PMC\d{1,12}$/i;

function doiUrl(doi: string): string | null {
  return DOI_PATTERN.test(doi) ? `https://doi.org/${doi}` : null;
}

function pmidUrl(pmid: string): string | null {
  return PMID_PATTERN.test(pmid) ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : null;
}

function pmcidUrl(pmcid: string): string | null {
  const normalized = pmcid.toUpperCase();
  return PMCID_PATTERN.test(normalized)
    ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${normalized}/`
    : null;
}

/**
 * The present identifiers of a citation, each with a resolver URL when it is
 * well-formed. Absent identifiers are omitted; present-but-malformed ones are
 * returned with `url: null` so callers render them as plain text.
 */
export function citationIdentifierParts(citation: CalyxCitation): CitationIdentifierPart[] {
  const parts: CitationIdentifierPart[] = [];
  const doi = citation.doi?.trim();
  const pmid = citation.pmid?.trim();
  const pmcid = citation.pmcid?.trim();
  if (doi) parts.push({ kind: 'doi', label: `DOI ${doi}`, url: doiUrl(doi) });
  if (pmid) parts.push({ kind: 'pmid', label: `PMID ${pmid}`, url: pmidUrl(pmid) });
  if (pmcid) parts.push({ kind: 'pmcid', label: `PMCID ${pmcid}`, url: pmcidUrl(pmcid) });
  return parts;
}
