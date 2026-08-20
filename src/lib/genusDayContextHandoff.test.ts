import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const GENUS_SOURCE = readFileSync(
  resolve(process.cwd(), 'src/components/orchid/DailyGenusFeatureContinuum.tsx'),
  'utf8',
);
const ATLAS_SOURCE = readFileSync(
  resolve(process.cwd(), 'src/components/orchid/HomeAtlasContinuum.tsx'),
  'utf8',
);

describe('Genus of the Day context handoffs', () => {
  it('uses the canonical featured-taxon navigation helpers for Atlas and Calyx', () => {
    expect(GENUS_SOURCE).toContain('featuredTaxonAtlasHref');
    expect(GENUS_SOURCE).toContain('featuredTaxonCalyxHref');
    expect(GENUS_SOURCE).toContain('const atlasHref = featuredTaxonAtlasHref(genus)');
    expect(GENUS_SOURCE).toContain('const calyxHref = featuredTaxonCalyxHref(genus)');
    expect(GENUS_SOURCE).toContain('to={atlasHref}');
    expect(GENUS_SOURCE).toContain('to={calyxHref}');
  });

  it('keeps the homepage Atlas evidence lane connected to the same Calyx genus context', () => {
    expect(ATLAS_SOURCE).toContain('featuredTaxonAtlasHref');
    expect(ATLAS_SOURCE).toContain('featuredTaxonCalyxHref');
    expect(ATLAS_SOURCE).toContain('const atlasHref = featuredTaxonAtlasHref(genus)');
    expect(ATLAS_SOURCE).toContain('const calyxHref = featuredTaxonCalyxHref(genus)');
    expect(ATLAS_SOURCE).toContain('to={atlasHref}');
    expect(ATLAS_SOURCE).toContain('to={calyxHref}');
  });

  it('does not reimplement Atlas or Calyx query contracts inline', () => {
    expect(GENUS_SOURCE).not.toContain('/atlas?genera=');
    expect(GENUS_SOURCE).not.toContain('/calyx?genus=');
    expect(ATLAS_SOURCE).not.toContain('/atlas?genera=');
    expect(ATLAS_SOURCE).not.toContain('/calyx?genus=');
  });
});
