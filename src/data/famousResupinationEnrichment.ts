import type { LexiconEntry } from './types';

/**
 * High-value scientific/presentation layers recovered verbatim or near-verbatim
 * from the complete Famous AI source export supplied on 2026-08-11.
 * This is draft migration content only. The canonical Concept Registry remains
 * authoritative whenever an ACTIVE + APPROVED Resupination concept is returned.
 */
export const famousResupinationEnrichment: Partial<LexiconEntry> = {
  anatomical_context:
    'The reorientation is associated with the flower-supporting axis — chiefly the inferior ovary together with the pedicel — rather than with the perianth segments themselves. The perianth and the column are carried passively as the supporting axis twists or curves.',
  morphological_context:
    'At anthesis a typical resupinate orchid flower presents the dorsal sepal uppermost, the two lateral sepals below and to the sides, two lateral petals flanking the column, the labellum lowermost, and the column positioned above the labellum so that the anther and stigmatic surface face the space in front of the lip.',
  mechanism_blocks: [
    {
      id: 'developmental-morphology',
      heading: 'Developmental morphology',
      body:
        'Floral orientation changes during development rather than being fixed at initiation. In many orchids the labellum is initially positioned adaxially in the bud, and the flower reaches its open orientation only after the supporting axis has reoriented. Rotation commonly involves the ovary/pedicel region or closely related supporting structures.',
      certainty: 'supported_interpretation',
      note: 'Developmental sequences have been described for a limited number of orchid genera; generalisation across the family should be made cautiously.',
    },
    {
      id: 'biomechanics',
      heading: 'Biomechanics',
      body:
        'Final orientation is also a mechanical outcome. Gravity acting on flower mass, the stiffness and curvature of the pedicel and ovary, and torsional forces within the supporting tissue all contribute to where the labellum comes to rest. Lineages may arrive at similar presentations by different mechanical routes.',
      certainty: 'supported_interpretation',
    },
  ],
  significance_blocks: [
    {
      id: 'functional',
      heading: 'Functional significance',
      body:
        'The labellum is frequently involved in the arrival and positioning of floral visitors, whether as a landing surface, a guiding channel, a trap, or a visual and olfactory signal. Where the labellum sits relative to the column therefore influences the path a visitor takes into and out of the flower.',
      certainty: 'supported_interpretation',
      note: 'Verified references for this draft migration layer are still to be imported into the canonical literature system.',
    },
    {
      id: 'pollination',
      heading: 'Pollination biology',
      body:
        'The spatial relationship among labellum, column, pollinia, stigma and pollinator can affect whether pollinia are removed on departure and whether they contact a receptive stigma on a subsequent visit. Floral orientation is therefore one geometric variable that can influence pollination success.',
      certainty: 'supported_interpretation',
    },
  ],
  evolution_blocks: [
    {
      id: 'distribution',
      heading: 'Distribution within Orchidaceae',
      body:
        'Resupinate flowers are widespread across Orchidaceae and are often treated as the common condition for the family. Non-resupinate flowers occur in multiple, phylogenetically scattered orchid groups rather than in one single clade.',
      certainty: 'supported_interpretation',
      note: 'Literature review remains pending for the migrated draft layer.',
    },
    {
      id: 'lability',
      heading: 'Evolutionary lability',
      body:
        'Because non-resupinate flowers appear in several unrelated groups, floral orientation appears to be evolutionarily labile: it has apparently been modified, lost, or re-acquired in different lineages. The number of independent origins has not been comprehensively resolved.',
      certainty: 'active_research_area',
    },
  ],
  variation_notes:
    'The degree, timing and developmental route of floral reorientation vary among orchid lineages. A presented orientation should therefore be recorded as an observation rather than assumed solely from taxonomic identity.',
  example_taxa: [
    { name: 'Orchidaceae', rank: 'family', note: 'Resupination is widespread but not universal within the family.' },
  ],
  conservation: {
    why_it_matters:
      'Floral orientation can be useful descriptive information in population monitoring and photographic documentation when it is recorded together with the inflorescence and whole-flower context.',
    what_to_record: [
      'Presented orientation of the flower at anthesis.',
      'Inflorescence orientation and whether it is erect, arching or pendent.',
      'A contextual image showing the flower attached to the inflorescence.',
    ],
    do_not_infer_from: [
      'A tightly cropped frontal flower photograph with no inflorescence context.',
      'Taxonomic identity alone when the actual flower orientation was not observed.',
    ],
    certainty: 'supported_interpretation',
    scope_note: 'This guidance concerns documentation of floral orientation; it is not a conservation-status assessment.',
  },
  relationships: [
    { predicate: 'related_to', target: 'Labellum / Lip', target_slug: 'labellum', target_kind: 'term' },
    { predicate: 'related_to', target: 'Column / Gynostemium', target_slug: 'column', target_kind: 'term' },
    { predicate: 'part_of', target: 'Floral Orientation', target_kind: 'concept' },
    { predicate: 'contrasts_with', target: 'Non-resupination', target_slug: 'non-resupination', target_kind: 'term' },
    { predicate: 'used_to_diagnose', target: 'Morphological Characters', target_kind: 'character' },
    { predicate: 'connects_to', target: 'Identification Matrix', target_kind: 'system' },
    { predicate: 'connects_to', target: 'Vision Lab', target_kind: 'system' },
    { predicate: 'connects_to', target: 'Calyx', target_kind: 'system' },
  ],
  assets: [
    {
      id: 'oc-asset-resup-sequence',
      kind: 'scientific_diagram',
      title: 'Three-stage reorientation sequence',
      caption:
        'Schematic sequence: developing bud with labellum uppermost → torsion of the ovary/pedicel region → open flower with labellum lowermost. Schematic only; proportions are generalised and not drawn from a measured specimen.',
      alt_text: 'Three-panel schematic diagram showing an orchid bud, a twisting ovary and pedicel, and an open orchid flower with the lip lowermost.',
      schematic: 'resupination-sequence',
      labels: ['labellum', 'column', 'dorsal sepal', 'lateral sepals', 'petals', 'ovary / pedicel', 'direction of rotation'],
      status: 'available',
      version: '1.0',
      illustrates: ['resupination'],
      shows_character_state: 'Resupinate',
      contrasts_with: 'Non-resupinate',
      provenance: {
        source: 'Orchid Continuum Illustrated Lexicon — in-app vector schematic',
        ai_generation_disclosure: 'Conceptual teaching diagram; not a measured anatomical drawing or specimen photograph.',
        validation_status: 'draft',
        confidence: 'not_assessed',
      },
    },
    {
      id: 'oc-asset-resup-compare',
      kind: 'scientific_diagram',
      title: 'Resupinate compared with non-resupinate presentation',
      caption: 'Side-by-side schematic contrast of presented floral orientation. Conceptual comparison; individual taxa vary.',
      alt_text: 'Two schematic orchid flowers side by side, one with the lip lowermost and one with the lip uppermost.',
      schematic: 'resupinate-comparison',
      labels: ['labellum', 'column'],
      status: 'available',
      provenance: {
        source: 'Orchid Continuum Illustrated Lexicon — in-app vector schematic',
        ai_generation_disclosure: 'Conceptual visualisation authored for this interface. Not a specimen photograph.',
        validation_status: 'draft',
        confidence: 'not_assessed',
      },
    },
  ],
  funding: {
    funding_source: 'New Hampshire Orchid Society',
    grant_program: 'Conservation and Education Grant',
    supported_asset_or_activity: 'Phase I — Illustrated Botanical Glossary: entry development and labelled illustration',
    status: 'proposed',
    acknowledgment_text: 'Proposed sponsor recognition from the Famous source export; not a statement that funding was awarded.',
  },
  maturity: ['core_definition', 'scientifically_enriched', 'etymology_added', 'illustrated', 'identification_linked', 'calyx_connected'],
};
