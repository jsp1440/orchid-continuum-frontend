import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/orchid/HomeAtlas.tsx'), 'utf8');

describe('Issue #93 Atlas context contract', () => {
  it('keeps the shared daily genus available without silently applying it as an initial filter', () => {
    expect(source).toContain('const { genus: dailyGenus } = useDailyGenus()');
    expect(source).toContain('selectedGenera');
    expect(source).not.toContain('new Set([dailyGenus])');
  });
});
