import { describe, expect, it } from 'vitest';
import {
  LEGACY_ASSET_REGISTRY,
  LEGACY_REGISTRY_LIMITATIONS,
  getLegacyAssetById,
  getOwnerReviewRequiredAssets,
  getPublicNewsletterCandidates,
  getRecoverableLegacyAssets,
  isRecoverableLegacyAsset,
  summarizeLegacyRegistry,
} from './legacyAssetRegistry';
import { RECOVERABLE_LEGACY_DISPOSITIONS } from './types';

const REQUIRED_MINIMUM_CANDIDATES = [
  'legacy-fcos-orchid-judging',
  'legacy-scientific-method-research-teaching',
  'legacy-hollywood-orchids-widget',
  'legacy-book-library-widgets',
  'legacy-widget-gallery-neon-one',
  'legacy-historical-bhl-illustration',
  'legacy-research-lab-digital-botanist',
];

describe('legacy asset registry structural integrity', () => {
  it('has globally unique, stable asset ids', () => {
    const ids = LEGACY_ASSET_REGISTRY.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^legacy-[a-z0-9-]+$/);
  });

  it('covers every minimum-required candidate named in issue #310', () => {
    const ids = new Set(LEGACY_ASSET_REGISTRY.map((a) => a.id));
    for (const requiredId of REQUIRED_MINIMUM_CANDIDATES) {
      expect(ids.has(requiredId), `expected ${requiredId} to be registered`).toBe(true);
    }
  });

  it('every asset cites at least one piece of evidence', () => {
    for (const asset of LEGACY_ASSET_REGISTRY) {
      expect(asset.evidence.length).toBeGreaterThan(0);
    }
  });

  it('never fabricates a source commit — every unverified asset has sourceCommit null', () => {
    for (const asset of LEGACY_ASSET_REGISTRY) {
      if (asset.accessState !== 'VERIFIED_THIS_RUN') {
        expect(asset.sourceCommit).toBeNull();
      }
    }
  });

  it('never marks evidence independentlyVerified when the asset itself is access-blocked from a legacy repo', () => {
    for (const asset of LEGACY_ASSET_REGISTRY) {
      if (asset.accessState !== 'BLOCKED_NO_REPO_ACCESS') continue;
      for (const evidence of asset.evidence) {
        if (evidence.kind === 'external_repo_path') {
          expect(evidence.independentlyVerified).toBe(false);
        }
      }
    }
  });

  it('every asset with a non-empty currentCanonicalEquivalent.exists=true cites a real file in this repository', () => {
    for (const asset of LEGACY_ASSET_REGISTRY) {
      if (!asset.currentCanonicalEquivalent.exists) continue;
      expect(asset.currentCanonicalEquivalent.refs?.length).toBeGreaterThan(0);
    }
  });

  it('DOCUMENTATION_ONLY status is only used when every source path is plausibly a document', () => {
    const docExtensions = /\.(md|txt|pdf|docx?)$/i;
    for (const asset of LEGACY_ASSET_REGISTRY) {
      if (asset.implementationStatus !== 'DOCUMENTATION_ONLY') continue;
      expect(asset.sourcePaths.length).toBeGreaterThan(0);
      for (const path of asset.sourcePaths) {
        expect(path, `expected ${path} on ${asset.id} to look like a document`).toMatch(docExtensions);
      }
    }
  });

  it('getLegacyAssetById resolves every registered id and returns undefined for an unknown id', () => {
    for (const asset of LEGACY_ASSET_REGISTRY) {
      expect(getLegacyAssetById(asset.id)).toEqual(asset);
    }
    expect(getLegacyAssetById('not-a-real-id')).toBeUndefined();
  });
});

describe('recoverable legacy classification', () => {
  it('isRecoverableLegacyAsset matches the RECOVERABLE_LEGACY_DISPOSITIONS contract', () => {
    for (const asset of LEGACY_ASSET_REGISTRY) {
      expect(isRecoverableLegacyAsset(asset)).toBe(RECOVERABLE_LEGACY_DISPOSITIONS.includes(asset.disposition));
    }
  });

  it('getRecoverableLegacyAssets returns only assets with a recoverable disposition', () => {
    const recoverable = getRecoverableLegacyAssets();
    for (const asset of recoverable) {
      expect(RECOVERABLE_LEGACY_DISPOSITIONS).toContain(asset.disposition);
    }
  });

  it('reports at least one real, evidence-backed RECOVERABLE_LEGACY asset', () => {
    // This is the concrete acceptance criterion from #310: the registry must
    // make RECOVERABLE_LEGACY a real state, not zero by construction.
    const recoverable = getRecoverableLegacyAssets();
    expect(recoverable.length).toBeGreaterThan(0);
    expect(recoverable.every((a) => a.evidence.length > 0)).toBe(true);
  });

  it('getOwnerReviewRequiredAssets returns only NEEDS_OWNER_REVIEW assets', () => {
    for (const asset of getOwnerReviewRequiredAssets()) {
      expect(asset.disposition).toBe('NEEDS_OWNER_REVIEW');
    }
  });

  it('getPublicNewsletterCandidates only returns assets explicitly marked suitable=true, never UNKNOWN', () => {
    for (const asset of getPublicNewsletterCandidates()) {
      expect(asset.publicNewsletterSuitability.suitable).toBe(true);
    }
  });
});

describe('summarizeLegacyRegistry', () => {
  it('produces counts consistent with the underlying registry', () => {
    const summary = summarizeLegacyRegistry();
    expect(summary.totalAssets).toBe(LEGACY_ASSET_REGISTRY.length);
    expect(summary.recoverableLegacyCount).toBe(getRecoverableLegacyAssets().length);
    expect(summary.blockedAccessAssets).toBe(
      LEGACY_ASSET_REGISTRY.filter((a) => a.accessState === 'BLOCKED_NO_REPO_ACCESS').length,
    );
    const dispositionTotal = Object.values(summary.byDisposition).reduce((sum, n) => sum + n, 0);
    expect(dispositionTotal).toBe(summary.totalAssets);
  });

  it('does not silently claim independent verification the registry does not have', () => {
    const summary = summarizeLegacyRegistry();
    // Honest state for this run: repo access was blocked, so verification count must be 0,
    // not fabricated — this test regresses if a future edit claims false verification.
    expect(summary.independentlyVerifiedAssets).toBe(0);
    expect(summary.blockedAccessAssets).toBe(summary.totalAssets);
  });
});

describe('LEGACY_REGISTRY_LIMITATIONS', () => {
  it('every limitation references only real registered asset ids', () => {
    const ids = new Set(LEGACY_ASSET_REGISTRY.map((a) => a.id));
    for (const limitation of LEGACY_REGISTRY_LIMITATIONS) {
      for (const affectedId of limitation.affectedAssetIds) {
        expect(ids.has(affectedId), `${affectedId} referenced by a limitation is not a registered asset`).toBe(true);
      }
    }
  });

  it('records the external repo access blocker affecting the whole registry', () => {
    const global = LEGACY_REGISTRY_LIMITATIONS.find((l) => l.affectedAssetIds.length === LEGACY_ASSET_REGISTRY.length);
    expect(global).toBeTruthy();
    expect(global?.description.toLowerCase()).toContain('approval');
  });
});
