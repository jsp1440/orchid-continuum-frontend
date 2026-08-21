import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ENTRYPOINT_SOURCE = readFileSync(
  resolve(process.cwd(), 'src/components/orchid/DailyGenusFeature.tsx'),
  'utf8',
);
const CONTINUUM_SOURCE = readFileSync(
  resolve(process.cwd(), 'src/components/orchid/DailyGenusFeatureContinuum.tsx'),
  'utf8',
);

describe('homepage featured genus canonical entrypoint', () => {
  it('keeps the live homepage mounted on the Continuum-backed genus feature', () => {
    expect(ENTRYPOINT_SOURCE).toContain("export { default } from './DailyGenusFeatureContinuum'");
    expect(ENTRYPOINT_SOURCE).not.toContain('DailyGenusFeatureV5');
  });

  it('keeps Atlas and Calyx navigation on canonical featured-taxon helpers', () => {
    expect(CONTINUUM_SOURCE).toContain('featuredTaxonAtlasHref');
    expect(CONTINUUM_SOURCE).toContain('featuredTaxonCalyxHref');
    expect(CONTINUUM_SOURCE).toContain('const atlasHref = featuredTaxonAtlasHref(genus)');
    expect(CONTINUUM_SOURCE).toContain('const calyxHref = featuredTaxonCalyxHref(genus)');
    expect(CONTINUUM_SOURCE).toContain('to={atlasHref}');
    expect(CONTINUUM_SOURCE).toContain('to={calyxHref}');
  });

  it('does not regress the active homepage to context-free Atlas or Calyx links', () => {
    expect(CONTINUUM_SOURCE).not.toContain('to="/atlas"');
    expect(CONTINUUM_SOURCE).not.toContain("to='/atlas'");
    expect(CONTINUUM_SOURCE).not.toContain('to="/calyx"');
    expect(CONTINUUM_SOURCE).not.toContain("to='/calyx'");
  });
});
