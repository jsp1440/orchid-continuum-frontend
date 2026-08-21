import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../components/orchid/SpeciesExhibit.tsx'), 'utf8');

describe('mounted Species Exhibit public truth', () => {
  it('derives the public story count from the server-owned evidence packet', () => {
    expect(source).toContain("{result.items.length} evidence-grounded species {result.items.length === 1 ? 'story' : 'stories'}");
    expect(source).not.toContain('Nine evidence-grounded species stories');
  });

  it('keeps unavailable evidence fail-closed rather than substituting a fixed catalogue claim', () => {
    expect(source).toContain("result.status !== 'ok' || !selected");
    expect(source).toContain('No species-specific evidence packet can be displayed right now.');
  });
});
