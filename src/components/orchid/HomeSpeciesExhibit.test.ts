import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const wrapper = readFileSync('src/components/orchid/HomeSpeciesExhibit.tsx', 'utf8');
const layout = readFileSync('src/components/AppLayout.tsx', 'utf8');
const exhibit = readFileSync('src/components/orchid/SpeciesExhibit.tsx', 'utf8');

describe('homepage species exhibit', () => {
  it('renders against the genus the rest of the homepage is showing', () => {
    expect(wrapper).toContain('useDailyGenus');
    expect(layout).toContain('<HomeSpeciesExhibit />');
  });

  it('renders nothing rather than a default genus when none is resolved', () => {
    expect(wrapper).toContain('if (!genus) return null;');
  });

  it('adds no claim of its own on top of the server evidence packet', () => {
    // The wrapper exists to pass a genus through. Anything that looks like
    // curated prose or a lookup table here is a claim the packet did not make.
    expect(wrapper).not.toMatch(/Record<string,\s*(string|number|\w+\[\])>/);
    expect(wrapper.split('\n').filter((line) => line.includes("'") && !line.includes('import')))
      .toHaveLength(0);
  });

  it('keeps phenology out until it is measured, rather than tabulating it', () => {
    // A previous draft shipped a flowering calendar built from a fixed
    // month-per-genus table, defaulting to an invented season for anything
    // unlisted. Phenology presented as evidence must come from dated records.
    for (const source of [wrapper, exhibit]) {
      expect(source).not.toContain('FLOWERING_WINDOWS');
      expect(source).not.toMatch(/\bJan['"]?,\s*['"]?Feb\b/);
    }
  });

  it('surfaces unavailable evidence as unavailable', () => {
    expect(exhibit).toContain('unavailable evidence stays unavailable');
  });
});
