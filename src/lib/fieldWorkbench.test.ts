import { describe, expect, it } from 'vitest';

import {
  addToPlant,
  applyTemplate,
  createWorkbench,
  groupAsNewPlant,
  importMedia,
  mergePlants,
  publicPlantView,
  relate,
  renamePlant,
  saveSessionProfile,
  saveSiteTemplate,
  setPlantField,
  splitPlant,
  ungroupedMedia,
  unrelate,
  WorkbenchError,
  type ImportFile,
  type WorkbenchDeps,
  type WorkbenchState,
} from './fieldWorkbench';

function deps(): WorkbenchDeps {
  let id = 0;
  let tick = 0;
  return {
    newId: () => `id-${++id}`,
    now: () => new Date(Date.UTC(2026, 9, 18, 12, 0, tick++)).toISOString(),
  };
}

function photos(n: number, prefix = 'IMG'): ImportFile[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `${prefix}_${String(i + 1).padStart(4, '0')}.JPG`,
    type: 'image/jpeg',
    size: 3_000_000 + i,
    lastModified: Date.UTC(2026, 9, 17, 9, 0, i),
  }));
}

function setup(n = 50) {
  const d = deps();
  const { state, imported } = importMedia(createWorkbench('owner'), photos(n), d);
  return { d, state, ids: imported.map((m) => m.id) };
}

describe('capture first: bulk import with no required fields', () => {
  it('imports 50 photos in one action, each saved immediately and ungrouped', () => {
    const { state, ids } = setup(50);
    expect(ids).toHaveLength(50);
    expect(ungroupedMedia(state)).toHaveLength(50);
    expect(new Set(Object.values(state.media).map((m) => m.batchId)).size).toBe(1);
    expect(state.audit.at(-1)).toMatchObject({ action: 'import_media', mediaIds: ids });
  });

  it('records where each capture time came from', () => {
    const d = deps();
    const { imported } = importMedia(
      createWorkbench('owner'),
      [
        { name: 'a.jpg', type: 'image/jpeg', size: 1, exifCapturedAt: '2026-10-17T08:01:02Z', lastModified: 1 },
        { name: 'b.jpg', type: 'image/jpeg', size: 1, lastModified: Date.UTC(2026, 9, 17) },
        { name: 'c.mov', type: 'video/quicktime', size: 1 },
      ],
      d,
    );
    expect(imported.map((m) => [m.kind, m.capturedAtSource])).toEqual([
      ['photo', 'exif'],
      ['photo', 'file_last_modified'],
      ['video', 'import_time'],
    ]);
  });

  it('reports files that are not images or videos instead of dropping them silently', () => {
    const { imported, rejected } = importMedia(
      createWorkbench('owner'),
      [{ name: 'notes.pdf', type: 'application/pdf', size: 1 }, ...photos(1)],
      deps(),
    );
    expect(imported).toHaveLength(1);
    expect(rejected.map((f) => f.name)).toEqual(['notes.pdf']);
  });

  it('a workbench belongs to one account', () => {
    expect(() => createWorkbench('')).toThrow(WorkbenchError);
  });
});

describe('photos are media; plants are records', () => {
  it('groups five views under Plant 0001 and numbers later plants in sequence', () => {
    const { d, state, ids } = setup(12);
    const a = groupAsNewPlant(state, ids.slice(0, 5), {}, d);
    const b = groupAsNewPlant(a.state, ids.slice(5, 7), { identityCertainty: 'possibly_same_individual' }, d);
    expect(a.plant.label).toBe('Plant 0001');
    expect(b.plant.label).toBe('Plant 0002');
    expect(b.plant.identityCertainty).toBe('possibly_same_individual');
    expect(ungroupedMedia(b.state)).toHaveLength(5);
  });

  it('adds media to an existing plant, moving it from its previous plant without loss', () => {
    const { d, state, ids } = setup(6);
    const a = groupAsNewPlant(state, ids.slice(0, 3), {}, d);
    const b = groupAsNewPlant(a.state, ids.slice(3, 5), {}, d);
    const moved = addToPlant(b.state, a.plant.id, [ids[3]], d);
    expect(moved.plants[a.plant.id].mediaIds).toEqual([ids[0], ids[1], ids[2], ids[3]]);
    expect(moved.plants[b.plant.id].mediaIds).toEqual([ids[4]]);
    expect(Object.keys(moved.media)).toHaveLength(6);
  });

  it('splits a mistakenly grouped plant into a new plant or back to the inbox, losing nothing', () => {
    const { d, state, ids } = setup(6);
    const a = groupAsNewPlant(state, ids.slice(0, 6), { taxonHint: 'Masdevallia' }, d);
    const withField = setPlantField(a.state, a.plant.id, 'habitat', 'cloud forest', d);
    const split = splitPlant(withField, a.plant.id, [ids[4], ids[5]], {}, d);
    expect(split.newPlant?.mediaIds).toEqual([ids[4], ids[5]]);
    expect(split.newPlant?.fields).toEqual({}); // the observer decides what applies
    expect(split.state.plants[a.plant.id].mediaIds).toEqual(ids.slice(0, 4));
    const back = splitPlant(split.state, a.plant.id, [ids[0]], { toInbox: true }, d);
    expect(back.newPlant).toBeNull();
    expect(ungroupedMedia(back.state).map((m) => m.id)).toEqual([ids[0]]);
    expect(Object.keys(back.state.media)).toHaveLength(6);
    expect(() => splitPlant(back.state, a.plant.id, [ids[5]], {}, d)).toThrow(/Only media in/);
  });

  it('merges plants, keeping target values and reporting differing ones as conflicts', () => {
    const { d, state, ids } = setup(4);
    const a = groupAsNewPlant(state, ids.slice(0, 2), {}, d);
    const b = groupAsNewPlant(a.state, ids.slice(2, 4), {}, d);
    let s = setPlantField(b.state, a.plant.id, 'habitat', 'cloud forest', d);
    s = setPlantField(s, b.plant.id, 'habitat', 'roadside', d);
    s = setPlantField(s, b.plant.id, 'substrate', 'moss', d);
    const merged = mergePlants(s, a.plant.id, b.plant.id, d);
    const plant = merged.state.plants[a.plant.id];
    expect(plant.mediaIds).toEqual(ids);
    expect(plant.fields.habitat?.value).toBe('cloud forest');
    expect(plant.fields.substrate?.value).toBe('moss');
    expect(merged.conflicts).toEqual([
      { plantId: a.plant.id, field: 'habitat', current: 'cloud forest', proposed: 'roadside' },
    ]);
    expect(merged.state.plants[b.plant.id]).toBeUndefined();
  });

  it('renames a plant and audits it', () => {
    const { d, state, ids } = setup(1);
    const a = groupAsNewPlant(state, ids, {}, d);
    const s = renamePlant(a.state, a.plant.id, '  Ridge  Masdevallia ', d);
    expect(s.plants[a.plant.id].label).toBe('Ridge Masdevallia');
    expect(s.audit.at(-1)?.detail).toBe('Plant 0001 -> Ridge Masdevallia');
    expect(() => renamePlant(s, a.plant.id, '   ', d)).toThrow(WorkbenchError);
  });
});

describe('typed, directional relationships', () => {
  function threePlants() {
    const { d, state, ids } = setup(12);
    let s: WorkbenchState = state;
    const plants: string[] = [];
    for (const slice of [ids.slice(0, 3), ids.slice(3, 6), ids.slice(6, 8)]) {
      const g = groupAsNewPlant(s, slice, {}, d);
      s = g.state;
      plants.push(g.plant.id);
    }
    // ids 8..11 stay as context media: moth, host tree, landscape, habitat scene
    return { d, s, ids, plants };
  }

  it('links moth, host tree and landscape photos to a plant without grouping them into it', () => {
    const { d, s, ids, plants } = threePlants();
    let state = relate(s, { type: 'visiting_flower', subject: { kind: 'media', id: ids[8] }, plantId: plants[0], confidence: 'probable' }, d).state;
    state = relate(state, { type: 'growing_on', subject: { kind: 'media', id: ids[9] }, plantId: plants[0], confidence: 'certain' }, d).state;
    state = relate(state, { type: 'habitat_context', subject: { kind: 'media', id: ids[10] }, plantId: plants[0], confidence: 'certain' }, d).state;
    expect(Object.values(state.relationships).map((r) => r.type).sort()).toEqual(['growing_on', 'habitat_context', 'visiting_flower']);
    expect(state.plants[plants[0]].mediaIds).toEqual(ids.slice(0, 3)); // context photos are not "the plant"
    expect(ungroupedMedia(state).map((m) => m.id)).toEqual(ids.slice(8));
  });

  it('shares one habitat image among three plants', () => {
    const { d, s, ids, plants } = threePlants();
    let state = s;
    for (const plantId of plants) {
      state = relate(state, { type: 'habitat_context', subject: { kind: 'media', id: ids[11] }, plantId, confidence: 'certain' }, d).state;
    }
    const links = Object.values(state.relationships).filter((r) => r.subject.id === ids[11]);
    expect(links.map((r) => r.plantId).sort()).toEqual([...plants].sort());
  });

  it('never infers pollination: it needs evidence media', () => {
    const { d, s, plants } = threePlants();
    expect(() =>
      relate(s, { type: 'observed_pollination', subject: { kind: 'plant', id: plants[1] }, plantId: plants[0], confidence: 'possible' }, d),
    ).toThrow(/needs at least one photo or video/);
  });

  it('is idempotent, rejects self-links and can be removed', () => {
    const { d, s, ids, plants } = threePlants();
    const first = relate(s, { type: 'observed_nearby', subject: { kind: 'plant', id: plants[1] }, plantId: plants[0], confidence: 'possible' }, d);
    const again = relate(first.state, { type: 'observed_nearby', subject: { kind: 'plant', id: plants[1] }, plantId: plants[0], confidence: 'possible' }, d);
    expect(again.state).toBe(first.state);
    expect(() => relate(s, { type: 'observed_nearby', subject: { kind: 'plant', id: plants[0] }, plantId: plants[0], confidence: 'certain' }, d)).toThrow(/itself/);
    expect(() => relate(s, { type: 'observed_nearby', subject: { kind: 'media', id: 'missing' }, plantId: plants[0], confidence: 'certain' }, d)).toThrow(/Unknown media/);
    const removed = unrelate(first.state, first.relationship.id, d);
    expect(Object.keys(removed.relationships)).toHaveLength(0);
    expect(ids).toHaveLength(12);
  });

  it('a merge moves relationships and drops one that would point a plant at itself', () => {
    const { d, s, ids, plants } = threePlants();
    let state = relate(s, { type: 'observed_nearby', subject: { kind: 'plant', id: plants[1] }, plantId: plants[0], confidence: 'possible' }, d).state;
    state = relate(state, { type: 'habitat_context', subject: { kind: 'media', id: ids[10] }, plantId: plants[1], confidence: 'certain' }, d).state;
    const merged = mergePlants(state, plants[0], plants[1], d).state;
    const rels = Object.values(merged.relationships);
    expect(rels).toHaveLength(1);
    expect(rels[0]).toMatchObject({ type: 'habitat_context', plantId: plants[0] });
  });
});

describe('session profiles and site templates', () => {
  it('applies one session profile to all plants and a site template to a subset, keeping overrides', () => {
    const { d, state, ids } = setup(50);
    let s = state;
    const plants: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const g = groupAsNewPlant(s, ids.slice(i * 5, i * 5 + 5), {}, d);
      s = g.state;
      plants.push(g.plant.id);
    }
    s = setPlantField(s, plants[2], 'habitat', 'epiphyte on oak', d); // observer's own value
    const session = saveSessionProfile(s, 'Ridge transect', { eventDate: '2026-10-17', observer: 'Field team', habitat: 'cloud forest' }, d);
    const applied = applyTemplate(session.state, { kind: 'session_profile', id: session.profile.id }, plants, d);
    expect(applied.conflicts).toEqual([
      { plantId: plants[2], field: 'habitat', current: 'epiphyte on oak', proposed: 'cloud forest' },
    ]);
    expect(applied.state.plants[plants[2]].fields.habitat).toMatchObject({ value: 'epiphyte on oak', source: 'observer' });
    expect(applied.state.plants[plants[0]].fields.habitat).toMatchObject({ value: 'cloud forest', source: 'session_profile', sourceId: session.profile.id });

    const site = saveSiteTemplate(applied.state, 'Upper ridge', { site: 'Upper ridge', elevation: '2400 m' }, { latitude: -3.41, longitude: -78.52, accuracyM: 15 }, d);
    const sited = applyTemplate(site.state, { kind: 'site_template', id: site.site.id }, plants.slice(0, 3), d);
    expect(sited.conflicts).toEqual([]);
    expect(sited.state.plants[plants[0]].siteTemplateId).toBe(site.site.id);
    expect(sited.state.plants[plants[5]].siteTemplateId).toBeNull();
  });

  it('never conflates two sites on one plant', () => {
    const { d, state, ids } = setup(2);
    const g = groupAsNewPlant(state, ids, {}, d);
    const a = saveSiteTemplate(g.state, 'Ridge', { site: 'Ridge' }, null, d);
    const b = saveSiteTemplate(a.state, 'Valley', { site: 'Valley' }, null, d);
    const first = applyTemplate(b.state, { kind: 'site_template', id: a.site.id }, [g.plant.id], d);
    const second = applyTemplate(first.state, { kind: 'site_template', id: b.site.id }, [g.plant.id], d);
    expect(second.conflicts).toEqual([{ plantId: g.plant.id, field: 'siteTemplate', current: 'Ridge', proposed: 'Valley' }]);
    expect(second.state.plants[g.plant.id].siteTemplateId).toBe(a.site.id);
    expect(second.state.plants[g.plant.id].fields.site?.value).toBe('Ridge');
  });

  it('rejects impossible coordinates and unknown templates', () => {
    const { d, state } = setup(1);
    expect(() => saveSiteTemplate(state, 'x', {}, { latitude: 91, longitude: 0, accuracyM: null }, d)).toThrow(/out of range/);
    expect(() => applyTemplate(state, { kind: 'session_profile', id: 'nope' }, ['p'], d)).toThrow(/Unknown session profile/);
  });
});

describe('privacy by policy', () => {
  it('the public view carries no coordinates, locality, site, elevation, file names or full date', () => {
    const { d, state, ids } = setup(3);
    const g = groupAsNewPlant(state, ids.slice(0, 2), { taxonHint: 'Masdevallia veitchiana' }, d);
    let s = relate(g.state, { type: 'habitat_context', subject: { kind: 'media', id: ids[2] }, plantId: g.plant.id, confidence: 'certain' }, d).state;
    const site = saveSiteTemplate(s, 'Secret ridge', { site: 'Secret ridge', locality: 'Km 23 above the village', elevation: '2400 m', habitat: 'cloud forest' }, { latitude: -3.412345, longitude: -78.523456, accuracyM: 5 }, d);
    s = applyTemplate(site.state, { kind: 'site_template', id: site.site.id }, [g.plant.id], d).state;
    s = setPlantField(s, g.plant.id, 'eventDate', '2026-10-17', d);
    const view = publicPlantView(s, g.plant.id);
    const text = JSON.stringify(view);
    expect(text).not.toMatch(/3\.41|78\.52|Secret ridge|Km 23|2400|IMG_|2026-10-17/);
    expect(view).toMatchObject({ label: 'Plant 0001', taxonHint: 'Masdevallia veitchiana', mediaCount: 2, eventMonth: '2026-10' });
    expect(text).not.toMatch(/cloud forest/); // free text never leaves in the public view
    expect(view.relationships).toEqual([{ type: 'habitat_context', confidence: 'certain', evidenceCount: 1 }]);
  });
});

describe('the owner acceptance scenario, end to end', () => {
  it('50 photos, 8 plants, typed context links, a split, profiles and overrides, with every original kept and audited', () => {
    const d = deps();
    let { state: s } = importMedia(createWorkbench('owner'), [...photos(46), ...photos(4, 'CTX')], d);
    const all = Object.values(s.media);
    const orchidMedia = all.filter((m) => m.name.startsWith('IMG'));
    const context = all.filter((m) => m.name.startsWith('CTX'));
    const plants: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const slice = orchidMedia.slice(i * 5, i * 5 + 5).map((m) => m.id);
      if (!slice.length) break;
      const g = groupAsNewPlant(s, slice, {}, d);
      s = g.state;
      plants.push(g.plant.id);
    }
    // one plant was really two: split three views off
    const split = splitPlant(s, plants[7], s.plants[plants[7]].mediaIds.slice(0, 3), {}, d);
    s = split.state;
    // context: moth visiting plant 1, host tree for plant 1, one habitat scene for plants 1-3
    s = relate(s, { type: 'visiting_flower', subject: { kind: 'media', id: context[0].id }, plantId: plants[0], confidence: 'possible' }, d).state;
    s = relate(s, { type: 'growing_on', subject: { kind: 'media', id: context[1].id }, plantId: plants[0], confidence: 'certain' }, d).state;
    for (const p of plants.slice(0, 3)) {
      s = relate(s, { type: 'habitat_context', subject: { kind: 'media', id: context[2].id }, plantId: p, confidence: 'certain' }, d).state;
    }
    const session = saveSessionProfile(s, 'Day 1', { eventDate: '2026-10-17', observer: 'Field team' }, d);
    s = applyTemplate(session.state, { kind: 'session_profile', id: session.profile.id }, Object.keys(session.state.plants), d).state;
    const site = saveSiteTemplate(s, 'Ridge', { site: 'Ridge' }, { latitude: -3.4, longitude: -78.5, accuracyM: 10 }, d);
    s = applyTemplate(site.state, { kind: 'site_template', id: site.site.id }, plants.slice(0, 4), d).state;
    s = setPlantField(s, plants[1], 'substrate', 'mossy trunk', d);

    expect(Object.keys(s.media)).toHaveLength(50); // nothing lost
    expect(Object.keys(s.plants)).toHaveLength(9);
    const grouped = Object.values(s.plants).flatMap((p) => p.mediaIds);
    expect(new Set(grouped).size).toBe(grouped.length); // no media in two plants
    expect(ungroupedMedia(s).map((m) => m.name).sort()).toEqual(
      [...orchidMedia.slice(40).map((m) => m.name), ...context.map((m) => m.name)].sort(),
    );
    expect(Object.values(s.plants).every((p) => p.fields.observer?.value === 'Field team')).toBe(true);
    expect(s.plants[plants[1]].fields.substrate).toMatchObject({ value: 'mossy trunk', source: 'observer' });
    expect(Object.values(s.relationships)).toHaveLength(5);
    expect(s.audit.map((a) => a.action)).toContain('split_plant');
    expect(s.audit.every((a) => typeof a.at === 'string')).toBe(true);
  });
});


describe('checker round 1 (#936)', () => {
  it('a plant whose observer typed a different site is not linked to a site template', () => {
    const { d, state, ids } = setup(2);
    const g = groupAsNewPlant(state, ids, {}, d);
    const s = setPlantField(g.state, g.plant.id, 'site', 'Valley', d);
    const ridge = saveSiteTemplate(s, 'Ridge', { site: 'Ridge', locality: 'Ridge road', elevation: '2400 m' }, { latitude: -3.4, longitude: -78.5, accuracyM: 5 }, d);
    const out = applyTemplate(ridge.state, { kind: 'site_template', id: ridge.site.id }, [g.plant.id], d);
    expect(out.conflicts).toEqual([{ plantId: g.plant.id, field: 'site', current: 'Valley', proposed: 'Ridge' }]);
    const plant = out.state.plants[g.plant.id];
    expect(plant.siteTemplateId).toBeNull();
    expect(Object.keys(plant.fields)).toEqual(['site']);
    expect(JSON.parse(out.state.audit.at(-1)!.detail!).conflicts_left_for_observer).toHaveLength(1);
  });

  it('changing a linked plant\'s site detaches the template and everything it filled', () => {
    const { d, state, ids } = setup(1);
    const g = groupAsNewPlant(state, ids, {}, d);
    const ridge = saveSiteTemplate(g.state, 'Ridge', { site: 'Ridge', locality: 'Ridge road' }, { latitude: -3.4, longitude: -78.5, accuracyM: 5 }, d);
    let s = applyTemplate(ridge.state, { kind: 'site_template', id: ridge.site.id }, [g.plant.id], d).state;
    s = setPlantField(s, g.plant.id, 'habitat', 'cloud forest', d);
    s = setPlantField(s, g.plant.id, 'site', 'Valley', d);
    const plant = s.plants[g.plant.id];
    expect(plant.siteTemplateId).toBeNull();
    expect(Object.keys(plant.fields).sort()).toEqual(['habitat', 'site']);
    expect(plant.fields.site?.value).toBe('Valley');
    const cleared = setPlantField(s, g.plant.id, 'locality', '', d);
    expect(cleared).toBe(s); // clearing an empty field changes nothing and writes no audit entry
  });

  it('merging keeps the source species hint, never upgrades identity certainty, and records conflicts durably', () => {
    const { d, state, ids } = setup(4);
    const a = groupAsNewPlant(state, ids.slice(0, 2), {}, d);
    const b = groupAsNewPlant(a.state, ids.slice(2), { identityCertainty: 'possibly_same_individual', taxonHint: 'Masdevallia veitchiana' }, d);
    let s = setPlantField(b.state, a.plant.id, 'habitat', 'cloud forest', d);
    s = setPlantField(s, b.plant.id, 'habitat', 'roadside', d);
    const merged = mergePlants(s, a.plant.id, b.plant.id, d);
    const plant = merged.state.plants[a.plant.id];
    expect(plant.taxonHint).toBe('Masdevallia veitchiana');
    expect(plant.identityCertainty).toBe('possibly_same_individual');
    const detail = JSON.parse(merged.state.audit.at(-1)!.detail!);
    expect(detail.conflicts_kept_target).toEqual([{ plantId: a.plant.id, field: 'habitat', current: 'cloud forest', proposed: 'roadside' }]);
  });

  it('two differing species hints are a conflict, not a silent drop', () => {
    const { d, state, ids } = setup(2);
    const a = groupAsNewPlant(state, [ids[0]], { taxonHint: 'Dracula vampira' }, d);
    const b = groupAsNewPlant(a.state, [ids[1]], { taxonHint: 'Dracula chimaera' }, d);
    const merged = mergePlants(b.state, a.plant.id, b.plant.id, d);
    expect(merged.conflicts).toEqual([{ plantId: a.plant.id, field: 'taxonHint', current: 'Dracula vampira', proposed: 'Dracula chimaera' }]);
  });

  it('plants recorded at different sites cannot be merged', () => {
    const { d, state, ids } = setup(2);
    const a = groupAsNewPlant(state, [ids[0]], {}, d);
    const b = groupAsNewPlant(a.state, [ids[1]], {}, d);
    const ridge = saveSiteTemplate(b.state, 'Ridge', { site: 'Ridge' }, null, d);
    const valley = saveSiteTemplate(ridge.state, 'Valley', { site: 'Valley' }, null, d);
    let s = applyTemplate(valley.state, { kind: 'site_template', id: ridge.site.id }, [a.plant.id], d).state;
    s = applyTemplate(s, { kind: 'site_template', id: valley.site.id }, [b.plant.id], d).state;
    expect(() => mergePlants(s, a.plant.id, b.plant.id, d)).toThrow(/different sites/);
    const typed = setPlantField(setPlantField(b.state, a.plant.id, 'site', 'Ridge', d), b.plant.id, 'site', 'Valley', d);
    expect(() => mergePlants(typed, a.plant.id, b.plant.id, d)).toThrow(/different sites/);
  });

  it('a merge records dropped self-links and duplicate relationships', () => {
    const { d, state, ids } = setup(4);
    const a = groupAsNewPlant(state, [ids[0]], {}, d);
    const b = groupAsNewPlant(a.state, [ids[1]], {}, d);
    let s = relate(b.state, { type: 'observed_nearby', subject: { kind: 'plant', id: b.plant.id }, plantId: a.plant.id, confidence: 'possible' }, d).state;
    s = relate(s, { type: 'habitat_context', subject: { kind: 'media', id: ids[3] }, plantId: a.plant.id, confidence: 'certain' }, d).state;
    s = relate(s, { type: 'habitat_context', subject: { kind: 'media', id: ids[3] }, plantId: b.plant.id, confidence: 'probable' }, d).state;
    const merged = mergePlants(s, a.plant.id, b.plant.id, d);
    const detail = JSON.parse(merged.state.audit.at(-1)!.detail!);
    expect(detail.relationships_dropped_as_self_links).toHaveLength(1);
    expect(detail.relationships_dropped_as_duplicates).toHaveLength(1);
    expect(Object.values(merged.state.relationships)).toHaveLength(1);
  });

  it('re-asserting a link updates its confidence and audits it; unknown enums are refused at run time', () => {
    const { d, state, ids } = setup(2);
    const a = groupAsNewPlant(state, [ids[0]], {}, d);
    const first = relate(a.state, { type: 'habitat_context', subject: { kind: 'media', id: ids[1] }, plantId: a.plant.id, confidence: 'possible' }, d);
    const again = relate(first.state, { type: 'habitat_context', subject: { kind: 'media', id: ids[1] }, plantId: a.plant.id, confidence: 'certain' }, d);
    expect(again.relationship.id).toBe(first.relationship.id);
    expect(again.relationship.confidence).toBe('certain');
    expect(again.state.audit.at(-1)?.action).toBe('relate_update');
    expect(() => relate(a.state, { type: 'habitat_context', subject: { kind: 'media', id: ids[1] }, plantId: a.plant.id, confidence: 'sure' as never }, d)).toThrow(/Unknown confidence/);
    expect(() => groupAsNewPlant(a.state, [ids[1]], { identityCertainty: 'twins' as never }, d)).toThrow(/Unknown identity certainty/);
  });

  it('the public view publishes no free text: renamed labels, hints with numbers, non-ISO dates, observer names', () => {
    const { d, state, ids } = setup(1);
    const g = groupAsNewPlant(state, ids, { taxonHint: 'Dracula sp. at -3.4012, -78.5531' }, d);
    let s = renamePlant(g.state, g.plant.id, 'Km 12 Banos road ridge', d);
    s = setPlantField(s, g.plant.id, 'eventDate', 'Oct 17, 2026', d);
    s = setPlantField(s, g.plant.id, 'observer', 'Jane Q. Observer', d);
    s = setPlantField(s, g.plant.id, 'habitat', 'below Cerro X summit trail', d);
    const view = publicPlantView(s, g.plant.id);
    expect(view.label).toBe('Plant 0001');
    expect(view.taxonHint).toBeNull();
    expect(view.eventMonth).toBeNull();
    expect(JSON.stringify(view)).not.toMatch(/Km 12|3\.40|78\.55|Oct 17|Jane|Cerro/);
    for (const hint of ['Dracula sp.', 'Dracula vampira', 'Cattleya × hardyana', 'Masdevallia cf. veitchiana']) {
      const h = groupAsNewPlant(state, ids, { taxonHint: hint }, d);
      expect(publicPlantView(h.state, h.plant.id).taxonHint).toBe(hint);
    }
  });
});
