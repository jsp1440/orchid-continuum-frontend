/**
 * Curated BloomBot glossary content for the Education hub.
 *
 * This is general horticultural/educational orientation text, not
 * species-specific evidence. Wording must stay hedged (typical ranges,
 * "often", "many") and must not claim coverage the Continuum cannot
 * demonstrate. Guarded by educationTopics.test.ts (#790).
 */

export type EducationCategory =
  | 'environment'
  | 'physiology'
  | 'health'
  | 'partnership';

export interface EducationTopicContent {
  key: string;
  title: string;
  category: EducationCategory;
  summary: string;
  detail: string;
}

export const EDUCATION_HERO_NOTE =
  'BloomBot is intended to surface these explanations alongside species pages, the Atlas, and OACS readings. Integration varies by page and some surfaces are still in development.';

export const EDUCATION_TOPIC_CONTENT: EducationTopicContent[] = [
  {
    key: 'vpd',
    title: 'VPD — Vapor Pressure Deficit',
    category: 'environment',
    summary:
      'How "thirsty" the air feels to the plant. Combines temperature and humidity into a single transpiration-driving number.',
    detail:
      'Many orchids are commonly grown at roughly 0.6 – 1.2 kPa during the day, though needs vary by species and culture. Higher VPD pulls water out of leaves; lower VPD slows transpiration and can increase fungal pressure. Tracking VPD instead of raw humidity makes it easier to compare across temperatures.',
  },
  {
    key: 'par-dli',
    title: 'PAR & DLI — Light Intensity & Daily Sum',
    category: 'environment',
    summary:
      'PAR is the rate of photosynthetically active light. DLI is the daily integrated total, a unit that growers often find more informative than peak intensity.',
    detail:
      'Typical growing guidance (varies by source, species, and conditions): Phalaenopsis about 6 – 10 mol·m⁻²·d⁻¹, Cattleya about 15 – 25, Vanda about 25 – 40. DLI is often a better guide than peak intensity, since short bright bursts can add up to a similar daily total as long gentle days.',
  },
  {
    key: 'physiology',
    title: 'Orchid Physiology',
    category: 'physiology',
    summary:
      'Velamen-clad roots, CAM photosynthesis, pseudobulbs, and resupinate flowers — a structural toolkit seen across many Orchidaceae.',
    detail:
      'Many epiphytic orchids use CAM photosynthesis, opening stomata at night. Velamen on aerial roots can absorb water quickly and may help protect the cortex from UV. Pseudobulbs can buffer drought. Understanding this toolkit helps explain many common culture recommendations.',
  },
  {
    key: 'pests',
    title: 'Pests & Diseases',
    category: 'health',
    summary:
      'Scale, mealybug, spider mite, thrips — and the bacterial / fungal blights that can follow.',
    detail:
      'Many outbreaks are associated with poor airflow and unsuitable VPD. Early identification with a hand lens helps. Commonly used responses include horticultural oil for scale and mealybug, a strong water rinse or predatory mites for spider mites, and bactericide plus dry tissue for bacterial problems. Check product labels and local guidance before treating.',
  },
  {
    key: 'metabolic',
    title: 'Metabolic Disorders',
    category: 'health',
    summary:
      'Edema, oxalate burn, calcium-deficiency tip burn — non-pathogenic problems often linked to environment.',
    detail:
      'Edema (water-blister) is commonly attributed to roots taking up water faster than leaves transpire. Calcium tip burn may appear when transpiration is too slow to move Ca²⁺ to leaf margins. Both are usually environmental rather than infectious, but a persistent or spreading problem should be checked for infection.',
  },
  {
    key: 'mycorrhiza',
    title: 'Mycorrhiza',
    category: 'partnership',
    summary:
      'In nature, orchid seeds generally depend on a fungal partner to germinate. The relationship often continues into adulthood.',
    detail:
      'Tulasnella, Ceratobasidium, and Sebacina are among the fungal groups frequently reported in orchid associations. Specificity ranges from generalist to near single-fungus dependence, depending on the species studied. In conservation, sourcing a suitable mycobiont can strongly influence germination.',
  },
  {
    key: 'pollination',
    title: 'Pollination',
    category: 'partnership',
    summary:
      'Deception, reward, sexual mimicry, perfume harvesting — orchids show an exceptionally wide range of pollination strategies.',
    detail:
      'Many orchid species, often estimated at around a third, offer no reward to pollinators. Ophrys is known for mimicking female bees; Catasetum forcibly attaches pollinia; Coryanthes traps and bathes its visitor. Documented partner links, where available, come from sources such as GloBI; coverage is incomplete and absence of a record is not evidence of absence.',
  },
];
