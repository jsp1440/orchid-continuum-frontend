import { describe, expect, it } from 'vitest';

import {
  matrixHrefForLexiconConcept,
  MAX_IDENTIFICATION_CONTEXT_TEXT,
  readIdentificationSourceContext,
} from './identificationContext';

// Matrix -> Lexicon is deliberately not built here. resolveMatrixCharacterLexicon()
// owns that direction and requires a reviewed canonical concept ID; deriving a
// lexicon search from a character label would route around that review.
describe('lexicon and identification context links', () => {
  it('opens the identification lab with a lexicon concept as context only', () => {
    expect(matrixHrefForLexiconConcept('velamen', 'Velamen')).toBe(
      '/orchid-identification?concept=velamen&label=Velamen',
    );
  });

  it('reads bounded navigation context from the query string', () => {
    expect(readIdentificationSourceContext('?concept=velamen&label=Velamen')).toEqual({
      concept: 'velamen',
      label: 'Velamen',
    });
  });

  it('caps hostile or accidental oversized query context before session persistence', () => {
    const oversizedConcept = `concept-${'x'.repeat(1000)}`;
    const oversizedLabel = `label-${'y'.repeat(1000)}`;
    const result = readIdentificationSourceContext(
      `?concept=${encodeURIComponent(oversizedConcept)}&label=${encodeURIComponent(oversizedLabel)}`,
    );

    expect(result.concept).toHaveLength(MAX_IDENTIFICATION_CONTEXT_TEXT);
    expect(result.label).toHaveLength(MAX_IDENTIFICATION_CONTEXT_TEXT);
    expect(result.concept).toBe(oversizedConcept.slice(0, MAX_IDENTIFICATION_CONTEXT_TEXT));
    expect(result.label).toBe(oversizedLabel.slice(0, MAX_IDENTIFICATION_CONTEXT_TEXT));
  });

  it('caps outbound lexicon context to the same contract before building a Matrix URL', () => {
    const href = matrixHrefForLexiconConcept('x'.repeat(500), 'y'.repeat(500));
    const params = new URLSearchParams(href.split('?')[1]);

    expect(params.get('concept')).toHaveLength(MAX_IDENTIFICATION_CONTEXT_TEXT);
    expect(params.get('label')).toHaveLength(MAX_IDENTIFICATION_CONTEXT_TEXT);
  });
});
