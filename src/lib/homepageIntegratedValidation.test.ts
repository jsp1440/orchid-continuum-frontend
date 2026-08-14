import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

const appLayout = source('src/components/AppLayout.tsx');
const homeHero = source('src/components/orchid/HomeHero.tsx');
const featured = source('src/components/orchid/DailyGenusFeatureV5.tsx');
const relationships = source('src/components/orchid/TheKnowledgeGraph.tsx');
const why = source('src/components/orchid/WhyContinuumExists.tsx');
const atlas = source('src/components/orchid/HomeAtlas.tsx');
const tools = source('src/components/orchid/CapabilityGrid.tsx');
const stewardship = source('src/components/orchid/HumanStewardship.tsx');
const calyxGuide = source('src/components/orchid/PublicCalyxGuide.tsx');
const relationshipContext = source('src/lib/homepageRelationshipContext.tsx');
const app = source('src/App.tsx');

const publicSurface = [homeHero, featured, relationships, why, atlas, tools, stewardship, calyxGuide].join('\n');

describe('HOMEPAGE-RECOVERY-008 integrated candidate guardrails', () => {
  it('keeps the reduced seven-section public story while Calyx remains an overlay rather than a narrative block', () => {
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

    for (const retiredMount of ['ContinuumWeb', 'WhyOrchidsMatter', 'NewsStrip', 'HabitatCards', 'OrchidGallery']) {
      expect(appLayout).not.toContain(retiredMount);
    }

    expect(appLayout.match(/<PublicCalyxGuide \/>/g)?.length).toBe(1);
    expect(calyxGuide).toContain('fixed bottom-4 right-4');
  });

  it('preserves one shared context chain for featured orchid, relationships, Atlas, and Calyx', () => {
    expect(appLayout).toContain('<HomepageFeaturedProvider>');
    expect(appLayout).toContain('<HomepageRelationshipProvider>');
    expect(appLayout).toContain('<HomepageAtlasProvider>');
    expect(featured).toContain('useHomepageFeatured');
    expect(relationshipContext).toContain('useHomepageFeatured');
    expect(relationships).toContain('useHomepageRelationships');
    expect(atlas).toContain('useHomepageFeatured');
    expect(atlas).toContain('useHomepageAtlasContext');
    expect(calyxGuide).toContain('buildHomepageCalyxContext');
    expect(calyxGuide).toContain('storeHomepageCalyxContext');
  });

  it('checks all mounted public surfaces for internal/operator/grant language', () => {
    for (const forbidden of [
      'Grant-ready platform evidence',
      'constitutional orchestration',
      'governance engine',
      'mission control, governance',
      'Admin Center',
      'Open Control Panel',
      'future AI agent runs',
    ]) {
      expect(publicSurface.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('does not prescribe wonder as public copy or a stage label', () => {
    const lower = publicSurface.toLowerCase();
    expect(lower).not.toContain('begin with wonder');
    expect(lower).not.toContain('public wonder');
    expect(lower).not.toContain('wonder stage');
    expect(lower).not.toContain('>wonder<');
  });

  it('keeps Featured Genus and discovery surfaces materially compact', () => {
    expect(featured).not.toContain('DailyGenusFeatureV3');
    expect(featured).not.toContain('Species Gallery');
    expect(featured).not.toContain('Seasonal signal');
    expect(tools).not.toContain('OASIS');
    expect(tools).not.toContain('Admin Center');
    expect(stewardship).not.toContain('/api/campaign/stats');
    expect(stewardship).not.toContain('STEWARDS.map');
  });

  it('preserves honest evidence semantics in Atlas and relationships', () => {
    expect(atlas).toContain('Missing records do not establish biological absence');
    expect(atlas).toContain('point density is not population abundance');
    expect(relationships).toContain('does not establish biological absence');
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
