import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(
  resolve(process.cwd(), 'src/components/orchid/DailyGenusFeatureContinuum.tsx'),
  'utf8',
);

describe('Genus of the Day context handoffs', () => {
  it('uses the canonical featured-taxon navigation helpers for Atlas and Calyx', () => {
    expect(SOURCE).toContain('featuredTaxonAtlasHref');
    expect(SOURCE).toContain('featuredTaxonCalyxHref');
    expect(SOURCE).toContain('const atlasHref = featuredTaxonAtlasHref(genus)');
    expect(SOURCE).toContain('const calyxHref = featuredTaxonCalyxHref(genus)');
    expect(SOURCE).toContain('to={atlasHref}');
    expect(SOURCE).toContain('to={calyxHref}');
  });

  it('does not reimplement Atlas or Calyx query contracts inline', () => {
    expect(SOURCE).not.toContain('/atlas?genera=');
    expect(SOURCE).not.toContain('/calyx?genus=');
  });
});
