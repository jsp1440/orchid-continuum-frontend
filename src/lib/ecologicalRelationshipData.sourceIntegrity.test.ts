import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), 'src', path), 'utf8');

function functionBody(file: string, name: string, nextName: string): string {
  const start = file.indexOf(`export async function ${name}`);
  const end = file.indexOf(`export async function ${nextName}`, start + 1);
  expect(start, `expected ${name} to exist`).toBeGreaterThanOrEqual(0);
  expect(end, `expected ${nextName} after ${name}`).toBeGreaterThan(start);
  return file.slice(start, end);
}

describe('ecological relationship data source integrity', () => {
  const continuum = source('lib/orchidContinuum.ts');

  it('builds pollinator relationships only from canonical species and occurrence reads', () => {
    const aggregates = functionBody(
      continuum,
      'fetchPollinatorAggregates',
      'fetchPollinator',
    );
    const lookup = functionBody(
      continuum,
      'fetchPollinator',
      'fetchMycorrhizalAggregates',
    );

    expect(continuum).toContain(".from('species')");
    expect(continuum).toContain(".from('atlas_occurrences')");
    expect(aggregates).toContain('await loadSpeciesRows()');
    expect(aggregates).toContain('await loadAtlasRows()');
    expect(aggregates).toContain('if (!Array.isArray(row.pollinators)) continue');
    expect(lookup).toContain('await fetchPollinatorAggregates()');
    expect(lookup).toContain('?? null');
  });

  it('builds mycorrhizal relationships only by joining canonical relationship rows to species', () => {
    const aggregates = functionBody(
      continuum,
      'fetchMycorrhizalAggregates',
      'fetchMycorrhiza',
    );
    const lookup = functionBody(
      continuum,
      'fetchMycorrhiza',
      'fetchBiomeAggregates',
    );

    expect(continuum).toContain(".from('species_mycorrhizal')");
    expect(aggregates).toContain(
      'await Promise.all([loadSpeciesRows(), loadMycorrhizalRows()])',
    );
    expect(aggregates).toContain('if (mycoRows.length === 0) return []');
    expect(aggregates).toContain('const row = rows.find((r) => r.id === m.species_id)');
    expect(lookup).toContain('await fetchMycorrhizalAggregates()');
    expect(lookup).toContain('?? null');
  });

  it('keeps both routed consumers on canonical fetchers and honest empty states', () => {
    const pollinator = source('pages/PollinatorProfile.tsx');
    const mycorrhiza = source('pages/MycorrhizaProfile.tsx');

    expect(pollinator).toContain('fetchPollinator(taxa)');
    expect(pollinator).toContain('fetchPollinatorAggregates()');
    expect(pollinator).toContain('Pollinator relationship not yet linked');
    expect(mycorrhiza).toContain('fetchMycorrhiza(taxa)');
    expect(mycorrhiza).toContain('fetchMycorrhizalAggregates()');
    expect(mycorrhiza).toContain('No mycorrhizal data will be fabricated.');
  });
});
