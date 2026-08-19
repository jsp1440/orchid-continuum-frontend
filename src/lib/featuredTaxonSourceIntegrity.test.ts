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
    for (const legacy of ['WhyContinuumExists','TheKnowledgeGraph','HabitatCards','CapabilityGrid','OrchidGallery','WhyOrchidsMatter','HumanStewardship','NewsFromContinuum','HomeAtlas from']) {
      expect(layout, `AppLayout must not remount legacy homepage surface ${legacy}`).not.toContain(legacy);
    }
    for (const canonical of ['DailyGenusFeature','ContinuumWeb','HomeAtlasContinuum','PublicCalyxGuide','HomepageStewardshipClose']) {
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
    expect(navigation).toContain("const FEATURED_TAXON_ORIGIN = 'homepage-featured-taxon'");
    expect(navigation).toContain('&origin=${FEATURED_TAXON_ORIGIN}');
  });

  it('routes the stewardship Research Station handoff to a live application route', () => {
    const close = source('components/orchid/HomepageStewardshipClose.tsx');
    const app = source('App.tsx');
    expect(close).toContain('to="/research"');
    expect(close).not.toContain('to="/research-station"');
    expect(app).toContain('<Route path="/research"');
  });

  it('keeps the public footer on live visitor routes and out of operator-only workspaces', () => {
    const footer = source('components/orchid/Footer.tsx');
    for (const route of ['/knowledge', '/calyx', '/lexicon', '/get-involved', '/conservation']) expect(footer).toContain(`route: '${route}'`);
    for (const staleOrPrivate of ['#the-knowledge-graph', '#ask-calyx', '#human-stewardship', '/mission-control', 'Owner access']) expect(footer).not.toContain(staleOrPrivate);
  });

  it('sends the legacy collection entrypoint into the live Conservatory workspace', () => {
    const collection = source('pages/MyCollection.tsx');
    const app = source('App.tsx');
    expect(collection).toContain('<Navigate to="/conservatory" replace />');
    expect(collection).not.toContain('Sign-in coming soon');
    expect(collection).not.toContain('Mock preview');
    expect(app).toContain('<Route path="/conservatory/*"');
  });

  it('routes public Conservatory navigation directly to the live workspace', () => {
    const navbar = source('components/orchid/Navbar.tsx');
    expect(navbar).toContain("{ label: 'Conservatory', route: '/conservatory' }");
    expect(navbar).not.toContain("{ label: 'Conservatory', route: '/collection' }");
    expect(navbar).toContain("navigate('/conservatory')");
  });

  it('fails Conservatory readiness closed without exposing deployment internals', () => {
    const readiness = source('components/conservatory/ConservatoryReadiness.tsx');
    expect(readiness).toContain('Collection entry remains safely blocked');
    expect(readiness).toContain('if (!API_BASE) throw new Error(SERVICE_UNAVAILABLE)');
    expect(readiness).not.toContain('VITE_CALYX_API_URL is not configured');
    expect(readiness).not.toContain('Readiness request failed (');
  });
});
