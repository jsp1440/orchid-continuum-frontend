import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type Asset = {
  id: string;
  availability: 'present' | 'referenced_only' | 'unavailable';
  source_repository: string | null;
  source_paths: string[];
  canonical_destination: string;
  canonical_data_authority: string;
  disposition: string;
  representative_slice: boolean;
};
const registry = JSON.parse(readFileSync(resolve('public/data/ui-convergence-registry.json'), 'utf8')) as {
  schema_version: number;
  source_revision: string;
  dispositions: string[];
  assets: Asset[];
};

describe('UI convergence registry', () => {
  it('uses unique IDs, governed dispositions, and real repository paths', () => {
    expect(registry.schema_version).toBe(1);
    expect(new Set(registry.assets.map((asset) => asset.id)).size).toBe(registry.assets.length);
    for (const asset of registry.assets) {
      expect(registry.dispositions).toContain(asset.disposition);
      if (asset.availability === 'unavailable') {
        expect(asset.source_repository).toBeNull();
        expect(asset.source_paths).toEqual([]);
      } else {
        expect(asset.source_repository).toBe('jsp1440/orchid-continuum-frontend');
        expect(asset.source_paths.length).toBeGreaterThan(0);
        for (const path of asset.source_paths) expect(existsSync(resolve(path)), path).toBe(true);
      }
    }
  });

  it('contains a canonical-data representative convergence slice', () => {
    const slices = registry.assets.filter((asset) => asset.representative_slice);
    expect(slices.length).toBeGreaterThan(0);
    for (const slice of slices) {
      expect(slice.canonical_destination).not.toBe('');
      expect(slice.canonical_data_authority).toMatch(/canonical|\/api\//i);
    }
  });
});
