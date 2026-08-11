import { describe, expect, it } from 'vitest';

import {
  humanizeMatrixCharacter,
  lexiconHrefForMatrixCharacter,
  matrixHrefForLexiconConcept,
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
});
