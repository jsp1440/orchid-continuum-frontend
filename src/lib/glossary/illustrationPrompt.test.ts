import { describe, expect, it } from 'vitest';
import {
  buildIllustrationPrompt,
  ILLUSTRATION_TEMPLATE_VERSION,
  inferLabeledStructures,
} from '@/lib/glossary/illustrationPrompt';
import type { NormalizedGlossary } from '@/lib/glossary/types';

function glossary(overrides: Partial<NormalizedGlossary> = {}): NormalizedGlossary {
  return {
    term: 'Column',
    definition: 'The central reproductive structure fusing the anther cap and stigma.',
    category: 'morphology',
    synonyms: [],
    relatedTerms: [],
    source: null,
    sourceCitation: null,
    notes: null,
    ...overrides,
  };
}

describe('inferLabeledStructures', () => {
  it('surfaces only structures explicitly present in the text', () => {
    expect(inferLabeledStructures('Column', 'fuses the anther cap and stigma')).toEqual([
      'column',
      'anther cap',
      'stigma',
    ]);
  });

  it('does not invent structures that are absent', () => {
    expect(inferLabeledStructures('Photosynthesis', 'conversion of light to energy')).toEqual([]);
  });
});

describe('buildIllustrationPrompt', () => {
  it('is fully deterministic for identical input', () => {
    const a = buildIllustrationPrompt(glossary());
    const b = buildIllustrationPrompt(glossary());
    expect(a).toEqual(b);
    expect(a.prompt).toBe(b.prompt);
  });

  it('includes term, definition, orchid context, labels, and accuracy guardrails', () => {
    const { prompt } = buildIllustrationPrompt(glossary());
    expect(prompt).toContain('"Column"');
    expect(prompt).toContain('category: morphology');
    expect(prompt).toContain('central reproductive structure');
    expect(prompt).toContain('family Orchidaceae');
    expect(prompt).toContain('Clearly label only these structures');
    expect(prompt).toContain('Plain, neutral background');
    expect(prompt).toContain('Anatomically accurate');
    expect(prompt).toContain('Do not invent anatomical details');
    expect(prompt).toContain('Include no text');
  });

  it('asks for a single label when no known structures are present', () => {
    const { prompt, labeledStructures } = buildIllustrationPrompt(
      glossary({ term: 'Symbiosis', definition: 'A close ecological association.' }),
    );
    expect(labeledStructures).toEqual([]);
    expect(prompt).toContain('Add a single concise label');
  });

  it('carries a template version for downstream change detection', () => {
    expect(buildIllustrationPrompt(glossary()).templateVersion).toBe(ILLUSTRATION_TEMPLATE_VERSION);
  });
});
