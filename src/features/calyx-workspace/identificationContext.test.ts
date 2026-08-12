import { describe, expect, it } from 'vitest';

import {
  humanizeMatrixCharacter,
  lexiconHrefForMatrixCharacter,
  matrixHrefForLexiconConcept,
  MAX_IDENTIFICATION_CONTEXT_TEXT,
  readIdentificationSourceContext,
} from './identificationContext';

describe('lexicon and identification context links', () => {
  it('humanizes machine character identifiers without asserting a lexicon mapping', () => {
    expect(humanizeMatrixCharacter('spur_length_mm')).toBe('spur length');
    expect(humanizeMatrixCharacter('flower_shape')).toBe('flower shape');
  });

  it('opens the identification lab with a lexicon concept as context only', () => {
    expect(matrixHrefForLexiconConcept('velamen', 'Velamen')).toBe(
      '/orchid-identification?concept=velamen&label=Velamen',
    );
  });

  it('links matrix characters to lexicon search rather than inventing a canonical slug', () => {
    expect(lexiconHrefForMatrixCharacter('spur_length_mm')).toBe(
      '/lexicon/browse?q=spur%20length',
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
