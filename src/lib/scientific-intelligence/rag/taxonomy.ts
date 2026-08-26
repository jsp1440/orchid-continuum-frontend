/**
 * Taxonomic reconciliation against a World Plants / Hassler-style backbone.
 *
 * The name as published is always preserved alongside the accepted/current name.
 * Materially ambiguous names are never silently resolved: the claim is retained,
 * flagged for review, and prevented from activating authoritative graph state.
 *
 * The backbone here is a small deterministic fixture standing in for the
 * canonical taxonomy service; it carries a release version so downstream records
 * can track which taxonomy release resolved them, and so a later release can
 * reprocess only the affected records.
 */

export const TAXONOMY_SOURCE = 'world-plants'
export const TAXONOMY_VERSION = '2024.1'

export type TaxonReconciliation = {
  originalName: string
  status: 'resolved' | 'ambiguous' | 'unresolved'
  acceptedName: string | null
  acceptedTaxonId: string | null
  authorship: string | null
  synonymOf: string | null
  relationship: 'accepted' | 'synonym' | 'unknown'
  method: 'exact' | 'synonym_map' | 'none'
  confidence: number
  reviewRequired: boolean
  candidates: Array<{ taxonId: string; acceptedName: string; authorship: string }>
  taxonomySource: string
  taxonomyVersion: string
}

type BackboneEntry = {
  taxonId: string
  acceptedName: string
  authorship: string
  /** Accepted names and synonyms that resolve to this entry. */
  names: string[]
}

const BACKBONE: BackboneEntry[] = [
  {
    taxonId: 'wp:phalaenopsis-lowii',
    acceptedName: 'Phalaenopsis lowii',
    authorship: 'Rchb.f.',
    names: ['phalaenopsis lowii'],
  },
  {
    taxonId: 'wp:phalaenopsis-amabilis',
    acceptedName: 'Phalaenopsis amabilis',
    authorship: '(L.) Blume',
    names: ['phalaenopsis amabilis', 'phalaenopsis grandiflora', 'phalaenopsis gloriosa'],
  },
]

/**
 * A deliberately ambiguous name: it matches more than one accepted taxon and
 * must fail closed. This models a genuine homonym / unresolved usage.
 */
const AMBIGUOUS_NAMES: Record<string, Array<{ taxonId: string; acceptedName: string; authorship: string }>> = {
  'phalaenopsis intermedia': [
    { taxonId: 'wp:phalaenopsis-intermedia-a', acceptedName: 'Phalaenopsis × intermedia', authorship: 'Lindl.' },
    { taxonId: 'wp:phalaenopsis-amabilis', acceptedName: 'Phalaenopsis amabilis', authorship: '(L.) Blume' },
  ],
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/\s*×\s*/g, ' ').replace(/\s+/g, ' ').trim()
}

export function reconcileTaxon(originalName: string): TaxonReconciliation {
  const key = normalize(originalName)
  const base = {
    originalName,
    taxonomySource: TAXONOMY_SOURCE,
    taxonomyVersion: TAXONOMY_VERSION,
  }

  if (AMBIGUOUS_NAMES[key]) {
    return {
      ...base,
      status: 'ambiguous',
      acceptedName: null,
      acceptedTaxonId: null,
      authorship: null,
      synonymOf: null,
      relationship: 'unknown',
      method: 'none',
      confidence: 0,
      reviewRequired: true,
      candidates: AMBIGUOUS_NAMES[key],
    }
  }

  const entry = BACKBONE.find((candidate) => candidate.names.includes(key))
  if (!entry) {
    return {
      ...base,
      status: 'unresolved',
      acceptedName: null,
      acceptedTaxonId: null,
      authorship: null,
      synonymOf: null,
      relationship: 'unknown',
      method: 'none',
      confidence: 0,
      reviewRequired: true,
      candidates: [],
    }
  }

  const isAccepted = normalize(entry.acceptedName) === key
  return {
    ...base,
    status: 'resolved',
    acceptedName: entry.acceptedName,
    acceptedTaxonId: entry.taxonId,
    authorship: entry.authorship,
    synonymOf: isAccepted ? null : entry.acceptedName,
    relationship: isAccepted ? 'accepted' : 'synonym',
    method: isAccepted ? 'exact' : 'synonym_map',
    confidence: isAccepted ? 0.99 : 0.9,
    reviewRequired: false,
    candidates: [{ taxonId: entry.taxonId, acceptedName: entry.acceptedName, authorship: entry.authorship }],
  }
}
