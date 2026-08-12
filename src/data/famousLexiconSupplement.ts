import type { LexiconEntry } from './types';

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
  source_system: 'Famous AI Illustrated Orchid Lexicon full-export migration fallback',
  provenance: {
    source: 'Uploaded Famous AI Illustrated Orchid Lexicon full export (2026-08-11)',
    source_record_id: `famous-recovered-${slug}`,
    validation_status: 'draft',
    confidence: 'not_assessed',
  },
  ...extra,
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
