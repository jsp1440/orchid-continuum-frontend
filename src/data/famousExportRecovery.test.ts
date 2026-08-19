import { describe, expect, it } from 'vitest';
import { entries as famousBaseEntries } from './lexiconEntries';
import { famousLexiconSupplement } from './famousLexiconSupplement';

const complete = [...famousBaseEntries, ...famousLexiconSupplement];
const bySlug = new Map(complete.map((entry) => [entry.slug, entry]));

describe('full Famous source export recovery', () => {
  it('recovers exactly the 45 unique terms from the uploaded source export', () => {
    expect(complete).toHaveLength(45);
    expect(bySlug.size).toBe(45);
    expect([...bySlug.keys()]).toEqual(
      expect.arrayContaining([
        'resupination',
        'velamen',
        'form',
        'sensu-lato',
        'pollinator-syndrome',
        'keiki',
        'bark-mix',
      ]),
    );
  });

  it('keeps one Resupination record and applies recovered rich draft layers', () => {
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

  it('recovers exact exported wording, aliases, categories and related terms for overlapping records', () => {
    const labellum = bySlug.get('labellum');
    const pollinium = bySlug.get('pollinium');
    const velamen = bySlug.get('velamen');

    expect(labellum?.quick_definition).toBe(
      'The modified median petal of an orchid flower, usually differing markedly from the two lateral petals in shape, colour or texture.',
    );
    expect(labellum?.synonyms).toContain('lip');
    expect(pollinium?.category).toBe('Reproductive Biology');
    expect(velamen?.related_terminology).toEqual(expect.arrayContaining(['Epiphyte', 'Rhizome']));
  });

  it('recovers the exported non-resupination scientific draft while keeping it explicitly unreviewed', () => {
    const entry = bySlug.get('non-resupination');

    expect(entry?.expanded_definition).toContain('several unrelated orchid groups');
    expect(entry?.identification_cautions).toEqual(
      expect.arrayContaining([
        'Confirm inflorescence orientation before scoring the character.',
        'A single frontal photograph is often insufficient.',
      ]),
    );
    expect(entry?.review_state).toBe('draft');
    expect(entry?.source_system).toContain('full-export migration fallback');
    expect(entry?.provenance?.validation_status).toBe('draft');
  });

  it('keeps the ten source-only terms as separate draft records', () => {
    expect(famousLexiconSupplement).toHaveLength(10);
    expect(famousLexiconSupplement.every((entry) => entry.review_state === 'draft')).toBe(true);
    expect(famousLexiconSupplement.map((entry) => entry.slug)).toEqual(
      expect.arrayContaining(['form', 'sensu-lato', 'pollinator-syndrome', 'keiki', 'bark-mix']),
    );
  });
});
