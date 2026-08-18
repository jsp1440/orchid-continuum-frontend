import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(process.cwd());

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('homepage Atlas source integrity', () => {
  it('mounts the Continuum-native Atlas window instead of the legacy diagnostics map', () => {
    const layout = read('src/components/AppLayout.tsx');
    expect(layout).toContain("import HomeAtlasContinuum from './orchid/HomeAtlasContinuum'");
    expect(layout).toContain('<HomeAtlasContinuum />');
    expect(layout).not.toContain("import HomeAtlas from './orchid/HomeAtlas'");
    expect(layout).not.toContain('<HomeAtlas />');
  });

  it('does not use hardcoded Atlas fallback counts in the active homepage window', () => {
    const atlas = read('src/components/orchid/HomeAtlasContinuum.tsx');
    expect(atlas).not.toContain('MYCORRHIZAL_FALLBACK_COUNT');
    expect(atlas).not.toContain('GENERA_FALLBACK_COUNT');
    expect(atlas).not.toContain('fetchMycorrhizalStats');
    expect(atlas).not.toContain('fetchGeneraCount');
    expect(atlas).toContain('useDailyGenus');
    expect(atlas).toContain('continuum?.relationships?.geography');
  });

  it('preserves the featured genus when handing the visitor into the full Atlas through the canonical navigation contract', () => {
    const atlas = read('src/components/orchid/HomeAtlasContinuum.tsx');
    const navigation = read('src/lib/featuredTaxonNavigation.ts');
    const filterContext = read('src/contexts/AtlasFilterContext.tsx');
    expect(filterContext).toContain("'genera'");
    expect(atlas).toContain('featuredTaxonAtlasHref');
    expect(atlas).toContain('const atlasHref = featuredTaxonAtlasHref(genus)');
    expect(atlas).toContain('to={atlasHref}');
    expect(navigation).toContain('/atlas?genera=');
  });
});
