import { describe, expect, it } from 'vitest';

import { createWorkbench, groupAsNewPlant, renamePlant, saveSiteTemplate, type WorkbenchDeps } from './fieldWorkbench';
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
      nextPlantNumber: 2,
      plants: { p: { id: 'p', label: 'Plant 0001', sequenceLabel: 'Plant 0001', mediaIds: ['gone'], identityCertainty: 'same_individual', taxonHint: null, fields: {}, siteTemplateId: null, createdAt: '', updatedAt: '' } },
    };
    expect(() => restoreWorkbench(dangling, 'owner')).toThrow(/missing media gone/);
    expect(restoreWorkbench(null, 'owner')).toBeNull();
  });

  it('pairs by position when the same File object is passed twice', async () => {
    const storage = new MemoryWorkbenchStorage();
    const file = { name: 'IMG_1.JPG', type: 'image/jpeg', size: 4, lastModified: 1 };
    const result = await importAndPersist(storage, createWorkbench('owner'), [
      { file, blob: new Blob(['first']) },
      { file: { ...file, name: 'IMG_2.JPG', lastModified: 2 }, blob: new Blob(['second']) },
      { file, blob: new Blob(['duplicate']) },
    ], deps());
    const bytes = await Promise.all(result.importedIds.map(async (id) => (await storage.getBlob(id))?.text()));
    expect(bytes).toEqual(['first', 'second', 'duplicate']);
  });

  it('refuses dangling relationships, shared media, mismatched keys and a stale plant counter', () => {
    const base = createWorkbench('owner');
    const media = {
      m1: { id: 'm1', name: 'a.jpg' },
      m2: { id: 'm2', name: 'b.jpg' },
    };
    const plant = (id: string, label: string, mediaIds: string[]) => ({ id, label, sequenceLabel: label, mediaIds, identityCertainty: 'same_individual', taxonHint: null, fields: {}, siteTemplateId: null, createdAt: '', updatedAt: '' });
    const ok = { ...base, media, plants: { p1: plant('p1', 'Plant 0001', ['m1']) }, nextPlantNumber: 2 };
    expect(restoreWorkbench(ok, 'owner')).not.toBeNull();
    expect(() => restoreWorkbench({ ...ok, plants: { p1: plant('p1', 'Plant 0001', ['m1']), p2: plant('p2', 'Plant 0002', ['m1']) }, nextPlantNumber: 3 }, 'owner')).toThrow(/in two plants/);
    expect(() => restoreWorkbench({ ...ok, plants: { other: plant('p1', 'Plant 0001', ['m1']) } }, 'owner')).toThrow(/malformed/);
    expect(() => restoreWorkbench({ ...ok, nextPlantNumber: 1 }, 'owner')).toThrow(/counter is behind/);
    expect(() => restoreWorkbench({ ...ok, plants: { p1: { ...plant('p1', 'Plant 0001', ['m1']), siteTemplateId: 'nowhere' } } }, 'owner')).toThrow(/missing site template/);
    const rel = { id: 'r1', type: 'habitat_context', subject: { kind: 'media', id: 'm2' }, plantId: 'gone', evidenceMediaIds: [], confidence: 'possible', note: null, createdAt: '' };
    expect(() => restoreWorkbench({ ...ok, relationships: { r1: rel } }, 'owner')).toThrow(/missing plant gone/);
    expect(() => restoreWorkbench({ ...ok, relationships: { r1: { ...rel, plantId: 'p1', subject: { kind: 'media', id: 'nope' } } } }, 'owner')).toThrow(/missing media/);
    expect(() => restoreWorkbench({ ...ok, relationships: { r1: { ...rel, plantId: 'p1', evidenceMediaIds: ['nope'] } } }, 'owner')).toThrow(/cites missing media/);
  });

  it('an observer may rename a plant to any label without locking the workbench', async () => {
    const storage = new MemoryWorkbenchStorage();
    const d = deps();
    const first = await importAndPersist(storage, createWorkbench('owner'), files(2), d);
    const grouped = groupAsNewPlant(first.state, first.importedIds, {}, d);
    await persist(storage, renamePlant(grouped.state, grouped.plant.id, 'Plant 0050', d));
    const reopened = await openWorkbench(storage, 'owner');
    expect(reopened.plants[grouped.plant.id].label).toBe('Plant 0050');
    expect(reopened.nextPlantNumber).toBe(2); // the next issued label is still Plant 0002
  });

  it('inherited object keys never count as stored ids', () => {
    const base = createWorkbench('owner');
    const plant = { id: 'p1', label: 'Plant 0001', sequenceLabel: 'Plant 0001', mediaIds: ['m1'], identityCertainty: 'same_individual', taxonHint: null, fields: {}, siteTemplateId: null, createdAt: '', updatedAt: '' };
    const ok = { ...base, media: { m1: { id: 'm1', name: 'a.jpg' } }, plants: { p1: plant }, nextPlantNumber: 2 };
    const rel = { id: 'r1', type: 'habitat_context', subject: { kind: 'media', id: 'm1' }, plantId: 'p1', evidenceMediaIds: ['m1'], confidence: 'possible', note: null, createdAt: '' };
    expect(restoreWorkbench({ ...ok, relationships: { r1: rel } }, 'owner')).not.toBeNull();
    expect(() => restoreWorkbench({ ...ok, plants: { p1: { ...plant, mediaIds: ['constructor'] } } }, 'owner')).toThrow(/missing media constructor/);
    expect(() => restoreWorkbench({ ...ok, plants: { p1: { ...plant, siteTemplateId: 'toString' } } }, 'owner')).toThrow(/missing site template/);
    expect(() => restoreWorkbench({ ...ok, relationships: { r1: { ...rel, plantId: 'valueOf' } } }, 'owner')).toThrow(/missing plant valueOf/);
    expect(() => restoreWorkbench({ ...ok, relationships: { r1: { ...rel, subject: { kind: 'media', id: 'hasOwnProperty' } } } }, 'owner')).toThrow(/missing media/);
    expect(() => restoreWorkbench({ ...ok, relationships: { r1: { ...rel, evidenceMediaIds: ['__proto__'] } } }, 'owner')).toThrow(/cites missing media/);
    expect(() => restoreWorkbench({ ...ok, relationships: { r1: { ...rel, type: 'bogus' } } }, 'owner')).toThrow(/malformed/);
    expect(() => restoreWorkbench({ ...ok, relationships: { r1: { ...rel, subject: { kind: 'plant', id: 'p1' } } } }, 'owner')).toThrow(/to itself/);
    expect(() => restoreWorkbench({ ...ok, plants: { p1: { ...plant, taxonHint: 7 } } }, 'owner')).toThrow(/malformed/);
    expect(() => restoreWorkbench({ ...ok, siteTemplates: { s1: { id: 's2', name: 'x', values: {} } } }, 'owner')).toThrow(/site template s1 is malformed/);
  });
});
