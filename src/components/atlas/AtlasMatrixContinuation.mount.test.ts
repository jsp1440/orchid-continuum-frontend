import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const atlasSource = readFileSync(resolve(process.cwd(), 'src/pages/Atlas.tsx'), 'utf8');
const completenessSource = readFileSync(
  resolve(process.cwd(), 'src/components/atlas/AtlasCompletenessBadge.tsx'),
  'utf8',
);

describe('Atlas mounted Relationship Matrix continuation', () => {
  it('keeps the completeness surface mounted in the live Atlas page', () => {
    expect(atlasSource).toContain("import AtlasCompletenessBadge from '@/components/atlas/AtlasCompletenessBadge';");
    expect(atlasSource).toContain('<AtlasCompletenessBadge');
  });

  it('drives the continuation from live Atlas genus filters only', () => {
    expect(completenessSource).toContain("import { useAtlasFilters } from '@/contexts/AtlasFilterContext';");
    expect(completenessSource).toContain('const { filters } = useAtlasFilters();');
    expect(completenessSource).toContain('<AtlasMatrixContinuation genera={filters.genera} />');
  });

  it('does not pass Atlas occurrence, locality, layer, or evidence state into the continuation', () => {
    const mount = completenessSource.match(/<AtlasMatrixContinuation[\s\S]*?\/>/)?.[0] ?? '';
    expect(mount).toBe('<AtlasMatrixContinuation genera={filters.genera} />');

    for (const forbidden of [
      'latitude',
      'longitude',
      'locality',
      'occurrence',
      'activeLayers',
      'evidence',
      'confidence',
      'conclusion',
    ]) {
      expect(mount).not.toContain(forbidden);
    }
  });
});
