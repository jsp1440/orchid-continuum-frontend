import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/orchid/HeroOrchid.tsx'), 'utf8');

describe('HeroOrchid canonical media contract', () => {
  it('consumes the shared featured-taxon Continuum state instead of fetching genus media independently', () => {
    expect(source).toContain('const { genus, continuum, continuumStatus } = useDailyGenus()');
    expect(source).toContain('const media = continuum?.media ?? null');
    expect(source).not.toContain('fetchCalyxGenusMedia');
  });

  it('fails closed when public image provenance lacks source or license', () => {
    expect(source).toContain("Boolean(item.source_name?.trim())");
    expect(source).toContain("Boolean(item.license?.trim())");
    expect(source).not.toContain("'unrecorded source'");
    expect(source).not.toContain('License not recorded');
  });

  it('does not advertise unsupported dependency claims in the hero promise', () => {
    expect(source).toContain('followed through the evidence the Continuum actually holds');
    expect(source).not.toContain('everything it depends on');
  });
});
