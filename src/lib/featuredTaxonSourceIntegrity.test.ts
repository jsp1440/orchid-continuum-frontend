import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd(), 'src');

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

const ACTIVE_CONSUMERS = [
  'components/orchid/HomeHero.tsx',
  'components/orchid/DailyGenusFeatureContinuum.tsx',
  'components/orchid/ContinuumWeb.tsx',
  'components/orchid/PublicCalyxGuide.tsx',
];

describe('featured taxon source integrity', () => {
  it('keeps public featured-taxon consumers on the shared DailyGenus/Continuum state', () => {
    for (const path of ACTIVE_CONSUMERS) {
      const text = source(path);
      expect(text, `${path} must consume shared DailyGenus state`).toContain('useDailyGenus');
      expect(text, `${path} must not re-enter the legacy curated featured-genus profile`).not.toContain('featuredGenusEntry');
      expect(text, `${path} must not independently fetch genus media`).not.toContain('fetchCalyxGenusMedia');
      expect(text, `${path} must not independently fetch the relationship graph`).not.toContain('fetchContinuumGraph');
    }
  });

  it('keeps scientific service composition inside the canonical adapter', () => {
    const adapter = source('lib/featuredTaxonContinuum.ts');
    expect(adapter).toContain('fetchCalyxGenusMedia');
    expect(adapter).toContain('fetchGenusGraphEvidence');
    expect(adapter).toContain('fetchContinuumGraph');
  });

  it('keeps the active Genus of the Day export on the Continuum-native renderer', () => {
    const entry = source('components/orchid/DailyGenusFeature.tsx');
    expect(entry).toContain("./DailyGenusFeatureContinuum");
    expect(entry).not.toMatch(/DailyGenusFeatureV[1-5]/);
  });
});
