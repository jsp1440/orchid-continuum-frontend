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
  'components/orchid/HomeAtlasContinuum.tsx',
  'components/orchid/PublicCalyxGuide.tsx',
  'components/orchid/HomepageStewardshipClose.tsx',
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

  it('keeps the public homepage on the concise evidence journey instead of the legacy card stack', () => {
    const layout = source('components/AppLayout.tsx');
    for (const legacy of [
      'WhyContinuumExists',
      'TheKnowledgeGraph',
      'HabitatCards',
      'CapabilityGrid',
      'OrchidGallery',
      'WhyOrchidsMatter',
      'HumanStewardship',
      'NewsFromContinuum',
      'HomeAtlas from',
    ]) {
      expect(layout, `AppLayout must not remount legacy homepage surface ${legacy}`).not.toContain(legacy);
    }
    for (const canonical of [
      'DailyGenusFeature',
      'ContinuumWeb',
      'HomeAtlasContinuum',
      'PublicCalyxGuide',
      'HomepageStewardshipClose',
    ]) {
      expect(layout, `AppLayout must keep canonical journey surface ${canonical}`).toContain(canonical);
    }
  });

  it('preserves featured genus identity when the homepage hands off to Calyx through the canonical navigation contract', () => {
    const guide = source('components/orchid/PublicCalyxGuide.tsx');
    const navigation = source('lib/featuredTaxonNavigation.ts');
    expect(guide).toContain('featuredTaxonCalyxHref');
    expect(guide).toContain('const calyxHref = featuredTaxonCalyxHref(genus)');
    expect(guide).toContain('to={calyxHref}');
    expect(guide).not.toContain('to="/calyx"');
    expect(navigation).toContain('/calyx?genus=');
    expect(navigation).toContain('origin=homepage-featured-taxon');
  });
});
