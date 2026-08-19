import { entries as famousBaseEntries, resupination as famousBaseResupination } from './lexiconEntries';
import { famousExportRecordOverrides } from './famousExportRecordOverrides';
import { famousResupinationEnrichment } from './famousResupinationEnrichment';
import type { LexiconEntry } from './types';

const FULL_EXPORT_SOURCE = 'Famous AI Illustrated Orchid Lexicon full-export migration fallback';
const FULL_EXPORT_PROVENANCE = 'Uploaded Famous AI Illustrated Orchid Lexicon full export (2026-08-11)';

/**
 * The first GitHub migration retained the Resupination identity/definition but
 * stripped many richer layers that are present in the complete uploaded source
 * export. Enrich that same draft object in place so the runtime still contains
 * one resupination slug and direct fallback lookup sees the recovered layers.
 * Canonical ACTIVE + APPROVED data still supersedes these scientific fields.
 */
Object.assign(famousBaseResupination, famousResupinationEnrichment, {
  review_state: 'draft' as const,
  source_system: FULL_EXPORT_SOURCE,
});

/**
 * Ten lexicon records recovered from the complete Famous AI Illustrated Orchid
 * Lexicon export supplied on 2026-08-11 that were absent from the first GitHub
 * migration seed. These records are read-only draft migration content. Canonical
 * Orchid Continuum Concept Registry records supersede them by slug.
 */
const recovered = (
  slug: string,
  preferred_term: string,
  category: LexiconEntry['category'],
  quick_definition: string,
  extra: Partial<LexiconEntry> = {},
): LexiconEntry => ({
  id: `famous-recovered-${slug}`,
  slug,
  preferred_term,
  category,
  quick_definition,
  maturity: ['core_definition'],
  review_state: 'draft',
  certainty_summary: 'literature_review_pending',
  source_system: FULL_EXPORT_SOURCE,
  provenance: {
    source: FULL_EXPORT_PROVENANCE,
    source_record_id: `famous-recovered-${slug}`,
    validation_status: 'draft',
    confidence: 'not_assessed',
  },
  ...extra,
  review_state: 'draft',
});

export const famousLexiconSupplement: LexiconEntry[] = [
  recovered(
    'form',
    'Form',
    'Floral Morphology',
    'In orchid judging and description, the overall shape and arrangement of the floral segments.',
    { related_terminology: ['Symmetry', 'Substance', 'Texture'] },
  ),
  recovered(
    'symmetry',
    'Symmetry',
    'Floral Morphology',
    'The correspondence of parts about an axis or plane; orchid flowers are characteristically bilaterally symmetrical (zygomorphic).',
    { related_terminology: ['Form'] },
  ),
  recovered(
    'texture',
    'Texture',
    'Floral Morphology',
    'The surface quality of a floral segment, described in terms such as matte, glossy, waxy or crystalline.',
    { related_terminology: ['Substance', 'Form'] },
  ),
  recovered(
    'substance',
    'Substance',
    'Floral Morphology',
    'The apparent thickness, firmness and durability of floral tissue.',
    { related_terminology: ['Texture', 'Form'] },
  ),
  recovered(
    'sensu-lato',
    'Sensu lato',
    'Botanical Latin',
    'Latin, "in the broad sense"; indicates a name applied in a broadly circumscribed sense.',
    { related_terminology: ['Sensu stricto'] },
  ),
  recovered(
    'sensu-stricto',
    'Sensu stricto',
    'Botanical Latin',
    'Latin, "in the strict sense"; indicates a name applied in a narrowly circumscribed sense.',
    { related_terminology: ['Sensu lato'] },
  ),
  recovered(
    'pollinator-syndrome',
    'Pollination syndrome',
    'Pollination Biology',
    'A recurring suite of floral traits associated with a particular class of pollinator.',
    { related_terminology: ['Spur', 'Resupination'], certainty_summary: 'competing_hypotheses' },
  ),
  recovered(
    'deceptive-pollination',
    'Deceptive pollination',
    'Pollination Biology',
    'Pollination achieved without a food reward, for example by mimicry of a mate, a rival, a food source or a brood site.',
    { certainty_summary: 'supported_interpretation' },
  ),
  recovered(
    'keiki',
    'Keiki',
    'Orchid Culture',
    'A vegetative offset produced on an inflorescence or stem, which can be separated to form a new plant.',
  ),
  recovered(
    'bark-mix',
    'Bark mix',
    'Orchid Culture',
    'A coarse, free-draining potting medium based on graded bark, widely used for epiphytic orchids in cultivation.',
    { related_terminology: ['Epiphyte'] },
  ),
];

/**
 * Apply the exact term-level values recovered from the uploaded full export to
 * the draft fallback inventory. This intentionally mutates only migration data;
 * the canonical adapter later strips draft scientific/review fields whenever an
 * ACTIVE + APPROVED Concept Registry record exists for the same slug.
 */
for (const entry of [...famousBaseEntries, ...famousLexiconSupplement]) {
  const recoveredFields = famousExportRecordOverrides[entry.slug];
  if (!recoveredFields) continue;
  Object.assign(entry, recoveredFields, {
    review_state: 'draft' as const,
    source_system: FULL_EXPORT_SOURCE,
    provenance: {
      ...(entry.provenance ?? {}),
      source: FULL_EXPORT_PROVENANCE,
      source_record_id: entry.source_record_id ?? entry.id,
      validation_status: 'draft' as const,
      confidence: 'not_assessed' as const,
    },
  });
}
