/**
 * Deterministic, template-based scientific illustration prompt generation.
 *
 * This module NEVER calls an external illustration or AI service. It only
 * produces prompt text suitable for later manual or automated use with Figure
 * Labs or an equivalent scientific illustration system. Given identical input,
 * it always produces identical output, and it never invents scientific detail
 * beyond what the supplied record provides.
 */

import type { IllustrationPrompt, NormalizedGlossary } from './types.ts';

/** Bump when the prompt template structure changes. */
export const ILLUSTRATION_TEMPLATE_VERSION = '1.0.0';

/**
 * Known orchid structures. When a term or its definition explicitly mentions
 * one of these, we ask the illustration to label it. We only ever surface
 * structures that literally appear in the supplied text — nothing is inferred
 * beyond a literal match, so the prompt cannot introduce unsupported anatomy.
 */
const KNOWN_ORCHID_STRUCTURES = [
  'labellum',
  'lip',
  'column',
  'gynostemium',
  'pollinia',
  'pollinium',
  'anther cap',
  'rostellum',
  'stigma',
  'sepal',
  'dorsal sepal',
  'lateral sepal',
  'petal',
  'spur',
  'velamen',
  'pseudobulb',
  'rhizome',
  'keiki',
  'mentum',
  'callus',
  'viscidium',
  'caudicle',
  'ovary',
  'bract',
  'root',
];

/**
 * Find known structures explicitly referenced by the term or definition.
 * Deterministic: results follow KNOWN_ORCHID_STRUCTURES order and are unique.
 */
export function inferLabeledStructures(term: string, definition: string): string[] {
  const haystack = `${term}\n${definition}`.toLowerCase();
  const found: string[] = [];
  for (const structure of KNOWN_ORCHID_STRUCTURES) {
    const pattern = new RegExp(`\\b${structure.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(haystack)) found.push(structure);
  }
  return found;
}

/**
 * Build the structured illustration prompt for a normalized glossary entry.
 * The output is fully deterministic.
 */
export function buildIllustrationPrompt(glossary: NormalizedGlossary): IllustrationPrompt {
  const { term, definition, category } = glossary;
  const labeledStructures = inferLabeledStructures(term, definition);

  const conceptLine = category
    ? `Scientific concept to illustrate: ${term} (category: ${category}).`
    : `Scientific concept to illustrate: ${term}.`;

  const labelLine =
    labeledStructures.length > 0
      ? `Clearly label only these structures, using precise botanical terminology: ${labeledStructures.join(', ')}.`
      : 'Add a single concise label identifying the primary subject only; add no other labels.';

  const lines = [
    `Create a clean scientific botanical illustration for the Orchid Continuum glossary term "${term}".`,
    '',
    conceptLine,
    `Definition to depict accurately: ${definition}`,
    '',
    'Orchid-specific context: Depict the subject strictly as it occurs in orchids (family Orchidaceae). Respect real orchid morphology and typical proportions for this structure or concept.',
    '',
    labelLine,
    '',
    'Style and accuracy requirements:',
    '- Clean botanical / scientific illustration style: precise line work with restrained, neutral shading.',
    '- Plain, neutral background (white or a pale neutral tone); no scenery, props, or decorative elements.',
    '- Anatomically accurate: proportions and arrangement must be faithful to real orchid specimens.',
    '- Do not add decorative, ornamental, speculative, or misleading structures.',
    '- Do not invent anatomical details that are not supported by the definition above.',
    '- Include no text, lettering, captions, or watermarks except for the specific labels requested above.',
  ];

  return {
    term,
    prompt: lines.join('\n'),
    labeledStructures,
    templateVersion: ILLUSTRATION_TEMPLATE_VERSION,
  };
}
