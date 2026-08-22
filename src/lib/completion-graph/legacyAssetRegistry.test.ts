import { describe, expect, it } from 'vitest';
import {
  getLegacyAssetsByDisposition,
  getLegacyAssetsForLeaf,
  getRecoverableLegacyAssets,
  LEGACY_ASSET_REGISTRY,
  PENDING_REPO_INSPECTION,
} from './legacyAssetRegistry';

describe('LEGACY_ASSET_REGISTRY structural integrity', () => {
  it('has globally unique asset ids', () => {
    const ids = LEGACY_ASSET_REGISTRY.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every asset names a source repository and capability', () => {
    for (const asset of LEGACY_ASSET_REGISTRY) {
      expect(asset.source.repo.length).toBeGreaterThan(0);
      expect(asset.capability.length).toBeGreaterThan(0);
    }
  });

  it('never marks an unverified asset COMPLETE, PARTIAL, PROTOTYPE, or BROKEN — those require this pass to have actually read the source', () => {
    for (const asset of LEGACY_ASSET_REGISTRY) {
      if (asset.verification.verifiedThisPass) continue;
      expect(['UNKNOWN', 'DOCUMENTATION_ONLY']).toContain(asset.implementationStatus);
    }
  });

  it('records a non-empty verification note for every entry, so silence is never mistaken for confirmation', () => {
    for (const asset of LEGACY_ASSET_REGISTRY) {
      expect(asset.verification.note.length).toBeGreaterThan(0);
    }
  });

  it('lists at least the five named recovery candidates from issue #308', () => {
    expect(LEGACY_ASSET_REGISTRY.length).toBeGreaterThanOrEqual(5);
  });

  it('names the repos pending inspection that this pass could not reach at all', () => {
    expect(PENDING_REPO_INSPECTION.length).toBeGreaterThan(0);
    for (const entry of PENDING_REPO_INSPECTION) {
      expect(entry.repo.length).toBeGreaterThan(0);
    }
  });
});

describe('getRecoverableLegacyAssets', () => {
  it('excludes SUPERSEDED and ARCHIVE_ONLY assets', () => {
    const recoverable = getRecoverableLegacyAssets();
    expect(recoverable.every((a) => a.disposition !== 'SUPERSEDED' && a.disposition !== 'ARCHIVE_ONLY')).toBe(true);
    expect(recoverable.length).toBe(LEGACY_ASSET_REGISTRY.length);
  });
});

describe('getLegacyAssetsByDisposition', () => {
  it('filters by exact disposition', () => {
    const needsReview = getLegacyAssetsByDisposition('NEEDS_OWNER_REVIEW');
    expect(needsReview.length).toBeGreaterThan(0);
    expect(needsReview.every((a) => a.disposition === 'NEEDS_OWNER_REVIEW')).toBe(true);
  });
});

describe('getLegacyAssetsForLeaf', () => {
  it('finds the scientific-method asset via its University completion-graph leaf id', () => {
    const assets = getLegacyAssetsForLeaf('cap-university-applied-ai');
    expect(assets.some((a) => a.id === 'legacy-scientific-method-research-platform')).toBe(true);
  });

  it('returns an empty array for a leaf id no asset references', () => {
    expect(getLegacyAssetsForLeaf('no-such-leaf-id')).toEqual([]);
  });
});
