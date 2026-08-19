import type { LexiconEntry } from './types';

/**
 * Read-only migration fallback from the uploaded Famous AI Illustrated Orchid
 * Lexicon build. Canonical Orchid Continuum records supersede these by slug.
 * Missing scientific layers remain empty; this file is not a publication path.
 */

const basic = (
  slug: string,
  preferred_term: string,
  category: LexiconEntry['category'],
  quick_definition: string,
  extra: Partial<LexiconEntry> = {},
): LexiconEntry => ({
  id: `famous-${slug}`,
  slug,
  preferred_term,
  category,
  quick_definition,
  maturity: ['core_definition'],
  review_state: 'draft',
  certainty_summary: 'literature_review_pending',
  source_system: 'Famous AI Illustrated Orchid Lexicon migration fallback',
  provenance: {
    source: 'Uploaded Famous AI Illustrated Orchid Lexicon build',
    validation_status: 'draft',
    confidence: 'not_assessed',
  },
  ...extra,
});

export const resupination: LexiconEntry = {
  id: 'oc-lex-0001',
  slug: 'resupination',
  preferred_term: 'Resupination',
  pronunciation: 're-soo-pi-NAY-shun',
  category: 'Floral Morphology',
  subcategory: 'Floral orientation',
  quick_definition:
    'Resupination is the developmental reorientation of an orchid flower, commonly through approximately 180 degrees, that usually places the labellum in the lowermost position at anthesis.',
  expanded_definition:
    'Resupination describes a change in floral orientation that occurs during the development of many orchid flowers. It is not simply a flower that hangs upside down: it is a developmental reorientation brought about by differential growth, torsion, curvature or related changes in the structures that support the flower, most often the ovary and pedicel region. In the bud, the labellum is frequently positioned on the upper side of the developing flower; by the time the flower opens, reorientation has commonly brought the labellum to the lowermost position, with the column above it. Both the mechanism and the final orientation can vary among orchid lineages, and the degree of rotation is not always a full 180 degrees.',
  scope_note:
    'This concept covers the presented orientation of an orchid flower and the developmental reorientation that produces it. It does not cover the shape or lobing of the labellum or any assessment of a taxon’s conservation status.',
  broader_concept: { label: 'Floral Orientation' },
  narrower_concepts: [
    { label: 'Non-resupination', slug: 'non-resupination' },
    { label: 'Incomplete resupination' },
  ],
  synonyms: ['resupinate condition', 'floral resupination'],
  related_terminology: [
    'Labellum / Lip',
    'Column / Gynostemium',
    'Dorsal Sepal',
    'Lateral Sepals',
    'Petals',
    'Pollinium / Pollinia',
    'Anthesis',
  ],
  contrasting_terms: ['Non-resupination', 'Hyperresupination (usage varies)'],
  etymology: {
    segments: [
      { form: 'resupinus', language: 'Latin', gloss: 'bent back, lying on the back, turned upward', role: 'root' },
      { form: 're-', language: 'Latin', gloss: 'back, again', role: 'prefix' },
      { form: 'supinus', language: 'Latin', gloss: 'lying face upward, supine', role: 'root' },
      { form: '-ation', language: 'Latin', gloss: 'forms a noun of process or action', role: 'suffix' },
    ],
    botanical_latin_notes:
      'In botanical Latin the adjective resupinatus is applied to organs that are inverted or turned over relative to an expected orientation.',
    related_forms: ['resupinate', 'non-resupinate', 'resupinatus (Botanical Latin)'],
    verified: false,
  },
  character_states: [
    {
      label: 'Resupinate',
      description: 'Labellum lowermost at anthesis; column above the labellum; dorsal sepal generally uppermost.',
      notes: 'Scoring requires knowledge of the flower as presented in life, not only a frontal photograph.',
    },
    {
      label: 'Non-resupinate',
      description: 'Labellum not brought to the usual lowermost position.',
      notes: 'Confirm inflorescence orientation before scoring.',
    },
    {
      label: 'Orientation indeterminate from available evidence',
      description: 'Available images or specimens do not permit the character to be scored.',
    },
  ],
  identification_significance:
    'Floral orientation is a useful character when combined with labellum, column, spur, pollinia, inflorescence, vegetative morphology, geography and published descriptions.',
  identification_cautions: [
    'Do not score orientation from a cropped frontal photograph when inflorescence orientation is unknown.',
    'Do not treat resupination as diagnostic on its own.',
  ],
  research_questions: [
    'How conserved are the developmental mechanisms that produce floral reorientation across Orchidaceae?',
    'How often has non-resupination evolved independently?',
  ],
  literature_status: 'Verified bibliographic records are still to be imported into the canonical literature layer.',
  calyx_notes: 'Ask Calyx should use the governed server conversation and evidence layers, not the Famous curated-response demonstration.',
  vision_lab_notes: 'Orientation requires image context, stage, landmarks and explicit cannot-score states.',
  maturity: ['core_definition', 'etymology_added', 'identification_linked'],
  review_state: 'draft',
  certainty_summary: 'literature_review_pending',
  source_system: 'Famous AI Illustrated Orchid Lexicon migration fallback',
  source_record_id: 'oc-lex-0001',
  provenance: {
    source: 'Uploaded Famous AI Illustrated Orchid Lexicon build',
    validation_status: 'draft',
    confidence: 'not_assessed',
  },
};

export const entries: LexiconEntry[] = [
  resupination,
  basic('non-resupination', 'Non-resupination', 'Floral Morphology', 'The condition in which an orchid flower is not developmentally reoriented into the usual resupinate presentation.', { contrasting_terms: ['Resupination'], related_terminology: ['Resupination'] }),
  basic('labellum', 'Labellum / Lip', 'Floral Morphology', 'The median petal of an orchid flower, usually differentiated in shape, color or function from the two lateral petals.'),
  basic('column', 'Column / Gynostemium', 'Floral Morphology', 'The central reproductive structure of an orchid flower formed by fusion and modification of staminal and pistillate tissues.'),
  basic('pollinium', 'Pollinium / Pollinia', 'Pollination Biology', 'A coherent mass of pollen grains transferred as a unit during orchid pollination.'),
  basic('rostellum', 'Rostellum', 'Floral Morphology', 'A modified structure derived from part of the stigma that lies between the anther and the receptive stigmatic surface and is associated with pollinium transfer.'),
  basic('anther-cap', 'Anther Cap', 'Floral Morphology', 'The cap-like covering over the anther at the apex of the column, typically dislodged when pollinia are removed.'),
  basic('stigma', 'Stigma', 'Floral Morphology', 'The receptive surface on which pollen is deposited; in orchids it is usually a cavity or depression on the front of the column.'),
  basic('spur', 'Spur', 'Floral Morphology', 'A hollow, tubular or sac-like projection, most often from the labellum, which in many orchids is associated with nectar.'),
  basic('dorsal-sepal', 'Dorsal Sepal', 'Floral Morphology', 'The median sepal of an orchid flower, generally presented uppermost in a resupinate flower.'),
  basic('lateral-sepals', 'Lateral Sepals', 'Floral Morphology', 'The two sepals flanking the median dorsal sepal.'),
  basic('petals', 'Petals', 'Floral Morphology', 'The inner perianth segments; in orchids the median petal is modified as the labellum, leaving two lateral petals.'),
  basic('velamen', 'Velamen', 'Anatomy', 'The multilayered outer covering of dead cells on many orchid roots, associated with water uptake and protection of underlying tissue.'),
  basic('pseudobulb', 'Pseudobulb', 'Vegetative Morphology', 'A thickened above-ground stem segment found in many sympodial orchids, associated with water and nutrient storage.'),
  basic('rhizome', 'Rhizome', 'Vegetative Morphology', 'A horizontal stem at or below the substrate surface from which shoots and roots arise.'),
  basic('epiphyte', 'Epiphyte', 'Ecology', 'A plant that grows upon another plant without drawing water or nutrients from the host tissue.'),
  basic('lithophyte', 'Lithophyte', 'Ecology', 'A plant that grows on rock surfaces or in rock crevices.'),
  basic('terrestrial', 'Terrestrial', 'Ecology', 'Growing in soil or accumulated organic material on the ground rather than on other plants or rock.'),
  basic('monopodial', 'Monopodial', 'Vegetative Morphology', 'A growth pattern in which a single shoot continues to extend from an apical growing point.'),
  basic('sympodial', 'Sympodial', 'Vegetative Morphology', 'A growth pattern in which successive shoots arise from a rhizome and each shoot completes its growth before the next develops.'),
  basic('anthesis', 'Anthesis', 'Development', 'The period during which a flower is open and functional.'),
  basic('inflorescence', 'Inflorescence', 'Vegetative Morphology', 'The flower-bearing portion of a plant, including its axis, bracts and arrangement of flowers.'),
  basic('zygomorphic', 'Zygomorphic', 'Floral Morphology', 'Describing a flower divisible into mirror halves along a single plane only; bilaterally symmetrical.'),
  basic('gravitropism', 'Gravitropism', 'Physiology', 'A directional growth response of a plant organ to gravity.'),
  basic('auxin', 'Auxin', 'Physiology', 'A class of plant growth regulator involved in cell elongation and directional growth responses.'),
  basic('mycorrhiza', 'Mycorrhiza', 'Mycorrhizal Biology', 'A symbiotic association between a plant root and a fungus; orchid seed germination in nature is typically dependent on such an association.'),
  basic('protocorm', 'Protocorm', 'Development', 'The small tuber-like structure formed by a germinating orchid seed before the first leaf and root develop.'),
  basic('holotype', 'Holotype', 'Nomenclature', 'The single specimen designated by an author as the nomenclatural type of a new name.'),
  basic('basionym', 'Basionym', 'Nomenclature', 'The previously published name on which a new combination or new status is based.'),
  basic('grex', 'Grex', 'Nomenclature', 'A category used in orchid horticulture for all progeny of a particular cross between two named parents.'),
  basic('in-situ', 'In situ', 'Conservation Terminology', 'Latin, in place; conservation of populations within their natural habitat.'),
  basic('ex-situ', 'Ex situ', 'Conservation Terminology', 'Conservation of plants or genetic material outside the natural habitat, such as in cultivation or seed banks.'),
  basic('cam-photosynthesis', 'CAM photosynthesis', 'Physiology', 'Crassulacean acid metabolism: a photosynthetic pathway in which carbon dioxide is taken up at night, reducing daytime water loss.'),
  basic('character-state', 'Character state', 'Taxonomy', 'One of the alternative conditions that a defined morphological or other character may take in a comparative analysis.'),
  basic('convergent-evolution', 'Convergent evolution', 'Evolution', 'The independent origin of similar traits in lineages that do not share those traits through common ancestry.'),
];

export const RESUPINATION_SLUG = 'resupination';
