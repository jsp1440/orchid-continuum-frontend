import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

const appLayout = source('src/components/AppLayout.tsx');
const homeHero = source('src/components/orchid/HomeHero.tsx');
const featured = source('src/components/orchid/DailyGenusFeatureV3.tsx');
const relationships = source('src/components/orchid/TheKnowledgeGraph.tsx');
const atlas = source('src/components/orchid/HomeAtlas.tsx');
const calyxGuide = source('src/components/orchid/PublicCalyxGuide.tsx');
const app = source('src/App.tsx');

describe('HOMEPAGE-RECOVERY-008 integrated candidate guardrails', () => {
  it('keeps the reduced seven-section public story and does not remount retired major blocks', () => {
    for (const section of [
      'Home hero',
      'Featured Genus',
      'Relationships',
      'Why the Continuum exists',
      'Atlas',
      'Discovery tools',
      'Conservation and participation',
    ]) {
      expect(appLayout).toContain(`name="${section}"`);
    }

    for (const retiredMount of ['PublicCalyxGuide', 'ContinuumWeb', 'WhyOrchidsMatter', 'NewsStrip']) {
      expect(appLayout).not.toContain(retiredMount);
    }
  });

  it('preserves one shared context chain for featured orchid, relationships, Atlas, and Calyx', () => {
    expect(appLayout).toContain('<HomepageFeaturedProvider>');
    expect(appLayout).toContain('<HomepageRelationshipProvider>');
    expect(appLayout).toContain('<HomepageAtlasProvider>');
    expect(relationships).toContain('useHomepageFeatured');
    expect(atlas).toContain('useHomepageFeatured');
    expect(calyxGuide).toContain('useHomepageCalyxContext');
  });

  it('keeps public language free of known internal/operator/grant phrasing', () => {
    const publicSurface = [homeHero, featured, relationships, atlas, calyxGuide].join('\n');
    for (const forbidden of [
      'Grant-ready platform evidence',
      'constitutional orchestration',
      'governance engine',
      'mission control, governance',
    ]) {
      expect(publicSurface.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('does not prescribe wonder as a public section or stage label', () => {
    const publicSurface = [homeHero, featured, relationships, atlas, calyxGuide].join('\n').toLowerCase();
    expect(publicSurface).not.toContain('>wonder<');
    expect(publicSurface).not.toContain('wonder stage');
  });

  it('preserves honest evidence semantics in Atlas and relationships', () => {
    expect(atlas).toContain('Missing records do not establish biological absence');
    expect(atlas).toContain('point density is not a population-abundance estimate');
    expect(relationships).toContain('not evidence of biological absence');
  });

  it('keeps advanced destinations available deeper in the product', () => {
    expect(app).toContain('path="/atlas"');
    expect(app).toContain('path="/intelligence-graph"');
    expect(app).toContain('path="/relationship-explorer"');
    expect(app).toContain('path="/calyx"');
    expect(app).toContain('path="/homepage-calyx"');
  });

  it('retains responsive layout signals for the primary homepage surfaces', () => {
    expect(homeHero).toMatch(/sm:|md:|lg:|xl:/);
    expect(featured).toMatch(/sm:|md:|lg:|xl:/);
    expect(relationships).toMatch(/sm:|md:|lg:|xl:/);
    expect(atlas).toMatch(/sm:|md:|lg:|xl:/);
  });
});
