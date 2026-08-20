import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/components/orchid/HomeAtlas.tsx'),
  'utf8',
);

describe('HomeAtlas initial visibility contract', () => {
  it('does not auto-filter the homepage Atlas to the daily genus', () => {
    expect(source).not.toContain('() => new Set([dailyGenus])');
    expect(source).not.toContain('setSelectedGenera(new Set([dailyGenus]))');
  });

  it('keeps Reset capable of returning to all visible occurrence points', () => {
    expect(source).toContain('setSelectedGenera(new Set())');
  });
});
