import { describe, expect, it } from 'vitest';

import { buildMatrixChatContext, MAX_MATRIX_CHAT_CONTEXT } from './matrixChatContext';

describe('Matrix Calyx interaction snapshot', () => {
  it('includes current observations and derived leading candidates as non-evidence context', () => {
    const value = buildMatrixChatContext({
      observationsText: JSON.stringify([
        { character: 'flower_color', value: 'white', certainty: 'certain' },
        { character: 'spur_length_mm', value: 300, certainty: 'probable' },
      ]),
      candidatesText: JSON.stringify([{ taxon_id: 'candidate-a', scientific_name: 'Taxon alpha' }]),
      report: {
        observation_count: 2,
        compared_character_count: 2,
        candidates: [{ taxon_id: 'candidate-a', scientific_name: 'Taxon alpha', score: 0.9, coverage: 0.75 }],
      },
    });

    expect(value).toContain('interaction context only; not scientific evidence');
    expect(value).toContain('flower_color');
    expect(value).toContain('Taxon alpha · match 90% · coverage 75%');
    expect(value).toContain('not a verified identification');
  });

  it('uses candidate matrix context before a derived report exists', () => {
    const value = buildMatrixChatContext({
      observationsText: '[]',
      candidatesText: JSON.stringify([{ taxon_id: 'candidate-a', scientific_name: 'Taxon alpha' }]),
      report: null,
    });

    expect(value).toContain('Candidate matrix');
    expect(value).toContain('Taxon alpha');
  });

  it('bounds the complete UI snapshot before it can enter a Calyx message', () => {
    const huge = JSON.stringify(
      Array.from({ length: 100 }, (_, index) => ({ character: `character-${index}`, value: 'x'.repeat(500) })),
    );
    const value = buildMatrixChatContext({ observationsText: huge, candidatesText: huge, report: null });

    expect(value.length).toBeLessThanOrEqual(MAX_MATRIX_CHAT_CONTEXT);
    expect(value).toContain('interaction context only');
  });
});
