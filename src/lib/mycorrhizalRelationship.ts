/**
 * mycorrhizalRelationship — the homepage's first real relationship thread.
 *
 * The public homepage follows ONE orchid outward, and the first step outward is
 * the fungal partnership every orchid seed depends on. This module is the only
 * source that thread is allowed to read from.
 *
 * TWO RULES GOVERN THIS FILE
 * --------------------------
 * 1. Nothing here is generated, inferred, or borrowed from a neighbouring
 *    genus. A fungal partner is reported for a genus only when the curated
 *    genus record in `genusData.ts` actually names one for THAT genus.
 * 2. Absence is reported as absence. A genus the Continuum has not yet
 *    documented returns `status: 'undocumented'` so the page can say so. A
 *    missing record is a knowledge gap, not evidence that the orchid has no
 *    fungal partner.
 *
 * Note for future work: `featuredGenusEntry()` synthesises an entry for genera
 * outside the curated set by spreading a *different* genus's template, which
 * carries that other genus's `ecology` block with it. That is why this module
 * resolves against `lookupGenus()` directly instead — an exact, case-insensitive
 * match that returns nothing rather than something wrong.
 */

import { lookupGenus } from '@/lib/genusData';

/** How far the evidence behind a statement actually reaches. */
export type EvidenceScope = 'family' | 'genus';

/**
 * The germination dependency that makes the whole thread worth telling.
 *
 * Scope is `family`: this is established for Orchidaceae as a whole, and is
 * presented that way. It is never restated as a claim about the active genus
 * or species.
 */
export const ORCHID_GERMINATION_DEPENDENCY = {
  scope: 'family' as const,
  taxon: 'Orchidaceae',
  claim:
    'An orchid seed is little more than a speck of tissue in a papery coat. It carries almost no stored food, so in the wild it cannot grow on its own: a compatible fungus has to enter the seed and feed the seedling before the plant produces a single green leaf.',
  consequence:
    'The orchid you are looking at began as a seed that was fed by a fungus. Protect the orchid without the fungus and you have protected half of it.',
  references: [
    'Rasmussen, H. N. (1995). Terrestrial Orchids: From Seed to Mycotrophic Plant. Cambridge University Press.',
    'Dearnaley, J. D. W., Martos, F., & Selosse, M.-A. (2012). Orchid mycorrhizas: molecular ecology, physiology, evolution and conservation aspects. In B. Hock (Ed.), Fungal Associations (2nd ed.). Springer.',
  ],
} as const;

/** A fungal partnership the Continuum holds a curated record for. */
export interface DocumentedPartnership {
  status: 'documented';
  genus: string;
  /** Fungal partners named by the curated record, verbatim. */
  partners: string;
  /** The evidence reaches the genus, not any individual species. */
  scope: Extract<EvidenceScope, 'genus'>;
  /** Where the statement comes from, in words a visitor can read. */
  provenance: string;
  /** The limit a reader has to know to read the statement correctly. */
  caveat: string;
}

/** A genus the Continuum has not documented yet. */
export interface UndocumentedPartnership {
  status: 'undocumented';
  genus: string;
  /** What the gap does and does not mean. */
  meaning: string;
  /** The honest next step, rather than a filler sentence. */
  gap: string;
}

export type MycorrhizalRelationship = DocumentedPartnership | UndocumentedPartnership;

const PROVENANCE = 'Orchid Continuum curated genus record';

const GENUS_CAVEAT =
  'Recorded for the genus. Partners are not confirmed here for every species in it, and a single species may associate with fungi this record does not name.';

const UNDOCUMENTED_MEANING =
  'The Continuum does not yet hold a curated fungal record for this genus. That is a gap in what we have assembled — not a finding that the genus grows without a fungal partner.';

const UNDOCUMENTED_GAP =
  'Identifying the fungal partners of an orchid genus takes root sampling and sequencing. Until that work is done and reviewed, this stays blank.';

/**
 * Resolve the fungal partnership for a genus.
 *
 * Returns `undocumented` for anything the curated set does not name — including
 * empty strings and unknown genera — so a caller can never render another
 * genus's fungi under this one's name.
 */
export function resolveMycorrhizalRelationship(genus: string): MycorrhizalRelationship {
  const name = (genus || '').trim();

  if (!name) {
    return { status: 'undocumented', genus: '', meaning: UNDOCUMENTED_MEANING, gap: UNDOCUMENTED_GAP };
  }

  const entry = lookupGenus(name);
  const partners = entry?.ecology?.mycorrhizal?.trim();

  if (!entry || !partners) {
    return { status: 'undocumented', genus: name, meaning: UNDOCUMENTED_MEANING, gap: UNDOCUMENTED_GAP };
  }

  return {
    status: 'documented',
    genus: entry.genus,
    partners,
    scope: 'genus',
    provenance: PROVENANCE,
    caveat: GENUS_CAVEAT,
  };
}

/**
 * The question this thread leaves the visitor holding, phrased for the active
 * genus. Deliberately a question: the homepage hands it to the next section
 * rather than answering it here.
 */
export function openQuestionFor(genus: string): string {
  const name = (genus || '').trim();
  return name
    ? `Where on Earth do ${name} and its fungi still overlap?`
    : 'Where on Earth do this orchid and its fungi still overlap?';
}
