import { describe, expect, it } from 'vitest';
import { FEATURED_GENERA } from '@/lib/featuredGenus';
import { GENERA, lookupGenus } from '@/lib/genusData';
import {
  ORCHID_GERMINATION_DEPENDENCY,
  openQuestionFor,
  resolveMycorrhizalRelationship,
} from '@/lib/mycorrhizalRelationship';

describe('resolveMycorrhizalRelationship', () => {
  it('reports the curated partners for a documented genus', () => {
    const result = resolveMycorrhizalRelationship('Dracula');
    expect(result.status).toBe('documented');
    if (result.status !== 'documented') return;
    expect(result.genus).toBe('Dracula');
    expect(result.partners).toBe(GENERA[1].ecology.mycorrhizal);
    expect(result.scope).toBe('genus');
    expect(result.provenance).toBeTruthy();
    expect(result.caveat).toBeTruthy();
  });

  it('matches genus names case-insensitively without changing the reported name', () => {
    const result = resolveMycorrhizalRelationship('  cattleya ');
    expect(result.status).toBe('documented');
    if (result.status !== 'documented') return;
    // The curated spelling wins, not whatever the caller typed.
    expect(result.genus).toBe('Cattleya');
  });

  it('reports a gap rather than borrowing another genus’s fungi', () => {
    // Phalaenopsis is in the featured rotation but has no curated ecology block.
    const result = resolveMycorrhizalRelationship('Phalaenopsis');
    expect(result.status).toBe('undocumented');
    if (result.status !== 'undocumented') return;
    expect(result.genus).toBe('Phalaenopsis');
    // The gap must say what it does NOT mean.
    expect(result.meaning).toMatch(/not a finding/i);
  });

  it('treats empty and unknown genera as gaps', () => {
    expect(resolveMycorrhizalRelationship('').status).toBe('undocumented');
    expect(resolveMycorrhizalRelationship('   ').status).toBe('undocumented');
    expect(resolveMycorrhizalRelationship('Notagenus').status).toBe('undocumented');
  });

  it('never reports partners that are not in the curated record for that exact genus', () => {
    for (const genus of FEATURED_GENERA) {
      const result = resolveMycorrhizalRelationship(genus);
      const curated = lookupGenus(genus)?.ecology?.mycorrhizal?.trim();

      if (result.status === 'documented') {
        expect(curated).toBeTruthy();
        expect(result.partners).toBe(curated);
      } else {
        expect(curated).toBeFalsy();
      }
    }
  });

  it('keeps every documented featured genus distinct from the day-of-week fallback', () => {
    // Regression guard for the synthesized-entry bug: a genus outside the
    // curated set must not inherit whichever entry today's date happens to hit.
    const documented = FEATURED_GENERA.map((g) => resolveMycorrhizalRelationship(g)).filter(
      (r): r is Extract<typeof r, { status: 'documented' }> => r.status === 'documented',
    );
    expect(documented.length).toBeGreaterThan(0);
    for (const record of documented) {
      expect(lookupGenus(record.genus)?.genus).toBe(record.genus);
    }
  });
});

describe('ORCHID_GERMINATION_DEPENDENCY', () => {
  it('is scoped to the family, not to a genus or species', () => {
    expect(ORCHID_GERMINATION_DEPENDENCY.scope).toBe('family');
    expect(ORCHID_GERMINATION_DEPENDENCY.taxon).toBe('Orchidaceae');
  });

  it('carries citable references', () => {
    expect(ORCHID_GERMINATION_DEPENDENCY.references.length).toBeGreaterThanOrEqual(2);
    for (const reference of ORCHID_GERMINATION_DEPENDENCY.references) {
      expect(reference).toMatch(/\(\d{4}\)/);
    }
  });
});

describe('openQuestionFor', () => {
  it('names the active genus', () => {
    expect(openQuestionFor('Dracula')).toContain('Dracula');
  });

  it('stays readable without a genus', () => {
    expect(openQuestionFor('')).toMatch(/this orchid/i);
  });
});
