import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/orchid/HomeAtlas.tsx'), 'utf8');

describe('HomeAtlas initial visibility implementation', () => {
  it('starts with all valid occurrence points visible instead of auto-filtering to the featured genus', () => {
    expect(source).toContain('useState<Set<string>>(new Set())');
    expect(source).not.toContain('() => new Set([dailyGenus])');
    expect(source).not.toContain('setSelectedGenera(new Set([dailyGenus]))');
  });
});
