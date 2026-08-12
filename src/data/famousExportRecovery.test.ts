import { describe, expect, it } from 'vitest';
import { entries as famousBaseEntries } from './lexiconEntries';
import { famousLexiconSupplement } from './famousLexiconSupplement';

describe('full Famous source export recovery', () => {
  it('keeps one Resupination record and applies recovered rich draft layers', () => {
    const complete = [...famousBaseEntries, ...famousLexiconSupplement];
    const resupinationRecords = complete.filter((entry) => entry.slug === 'resupination');
    const resupination = resupinationRecords[0];

    expect(resupinationRecords).toHaveLength(1);
    expect(resupination.review_state).toBe('draft');
    expect(resupination.source_system).toContain('full-export migration fallback');
    expect(resupination.anatomical_context).toContain('flower-supporting axis');
    expect(resupination.mechanism_blocks?.map((block) => block.id)).toEqual(
      expect.arrayContaining(['developmental-morphology', 'biomechanics']),
    );
    expect(resupination.significance_blocks?.map((block) => block.id)).toEqual(
      expect.arrayContaining(['functional', 'pollination']),
    );
    expect(resupination.evolution_blocks?.map((block) => block.id)).toEqual(
      expect.arrayContaining(['distribution', 'lability']),
    );
    expect(resupination.relationships?.some((edge) => edge.target === 'Identification Matrix')).toBe(true);
    expect(resupination.assets?.map((asset) => asset.schematic)).toEqual(
      expect.arrayContaining(['resupination-sequence', 'resupinate-comparison']),
    );
  });

  it('keeps the ten recovered source-only terms as separate draft records', () => {
    expect(famousLexiconSupplement).toHaveLength(10);
    expect(famousLexiconSupplement.every((entry) => entry.review_state === 'draft')).toBe(true);
    expect(famousLexiconSupplement.map((entry) => entry.slug)).toEqual(
      expect.arrayContaining(['form', 'sensu-lato', 'pollinator-syndrome', 'keiki', 'bark-mix']),
    );
  });
});
