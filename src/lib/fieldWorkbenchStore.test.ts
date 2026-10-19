import { describe, expect, it } from 'vitest';

import { createWorkbench, groupAsNewPlant, saveSiteTemplate, type WorkbenchDeps } from './fieldWorkbench';
import {
  importAndPersist,
  MemoryWorkbenchStorage,
  openWorkbench,
  orphanedBlobIds,
  persist,
  restoreWorkbench,
  WorkbenchStoreError,
  type WorkbenchStorage,
} from './fieldWorkbenchStore';

function deps(): WorkbenchDeps {
  let id = 0;
  return { newId: () => `id-${++id}`, now: () => '2026-10-18T12:00:00.000Z' };
}

function files(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    file: { name: `IMG_${i}.JPG`, type: 'image/jpeg', size: 4, lastModified: Date.UTC(2026, 9, 17, 9, 0, i) },
    blob: new Blob([`bytes-${i}`], { type: 'image/jpeg' }),
  }));
}

describe('workbench persistence', () => {
  it('survives a quit and reopen: originals byte-identical, plants and private site kept', async () => {
    const storage = new MemoryWorkbenchStorage();
    const d = deps();
    const first = await importAndPersist(storage, await openWorkbench(storage, 'owner'), files(50), d);
    const grouped = groupAsNewPlant(first.state, first.importedIds.slice(0, 5), {}, d);
    const site = saveSiteTemplate(grouped.state, 'Ridge', { site: 'Ridge' }, { latitude: -3.4, longitude: -78.5, accuracyM: 9 }, d);
    await persist(storage, site.state);

    const reopened = await openWorkbench(storage, 'owner');
    expect(Object.keys(reopened.media)).toHaveLength(50);
    expect(reopened.plants[grouped.plant.id].mediaIds).toEqual(first.importedIds.slice(0, 5));
    expect(reopened.siteTemplates[site.site.id].privateCoordinates).toEqual({ latitude: -3.4, longitude: -78.5, accuracyM: 9 });
    expect(await (await storage.getBlob(first.importedIds[7]))?.text()).toBe('bytes-7');
    expect(await orphanedBlobIds(storage, reopened)).toEqual([]);
  });

  it('an empty store opens a fresh workbench for the account', async () => {
    const state = await openWorkbench(new MemoryWorkbenchStorage(), 'owner');
    expect(state).toEqual(createWorkbench('owner'));
  });

  it('stores every original before the record, so an interruption leaves recoverable originals, never dangling records', async () => {
    const real = new MemoryWorkbenchStorage();
    const failing: WorkbenchStorage = {
      loadState: (a) => real.loadState(a),
      saveState: async () => {
        throw new Error('quota exceeded');
      },
      putBlob: (id, b) => real.putBlob(id, b),
      getBlob: (id) => real.getBlob(id),
      blobIds: () => real.blobIds(),
    };
    await expect(importAndPersist(failing, createWorkbench('owner'), files(3), deps())).rejects.toThrow('quota exceeded');
    const reopened = await openWorkbench(real, 'owner');
    expect(Object.keys(reopened.media)).toHaveLength(0);
    expect(await orphanedBlobIds(real, reopened)).toEqual(['id-2', 'id-3', 'id-4']);
  });

  it('pairs each original with its own record when non-media files are rejected in between', async () => {
    const storage = new MemoryWorkbenchStorage();
    const mixed = [
      ...files(1),
      { file: { name: 'notes.pdf', type: 'application/pdf', size: 1 }, blob: new Blob(['pdf']) },
      { file: { name: 'IMG_9.JPG', type: 'image/jpeg', size: 4 }, blob: new Blob(['bytes-9']) },
    ];
    const result = await importAndPersist(storage, createWorkbench('owner'), mixed, deps());
    expect(result.rejected.map((f) => f.name)).toEqual(['notes.pdf']);
    const second = result.importedIds[1];
    expect(result.state.media[second].name).toBe('IMG_9.JPG');
    expect(await (await storage.getBlob(second))?.text()).toBe('bytes-9');
  });

  it('refuses a corrupt, foreign-account or future-schema record instead of half-loading it', () => {
    const good = createWorkbench('owner');
    expect(() => restoreWorkbench('x', 'owner')).toThrow(WorkbenchStoreError);
    expect(() => restoreWorkbench({ ...good, schemaVersion: 99 }, 'owner')).toThrow(/schema 99/);
    expect(() => restoreWorkbench(good, 'someone-else')).toThrow(/another account/);
    expect(() => restoreWorkbench({ ...good, plants: undefined }, 'owner')).toThrow(/missing plants/);
    const dangling = {
      ...good,
      plants: { p: { id: 'p', label: 'Plant 0001', mediaIds: ['gone'], identityCertainty: 'same_individual', taxonHint: null, fields: {}, siteTemplateId: null, createdAt: '', updatedAt: '' } },
    };
    expect(() => restoreWorkbench(dangling, 'owner')).toThrow(/missing media gone/);
    expect(restoreWorkbench(null, 'owner')).toBeNull();
  });
});
