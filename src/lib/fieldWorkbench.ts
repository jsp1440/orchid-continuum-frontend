/**
 * Field Journal capture-first workbench (orchid-continuum-frontend#918, owner
 * field-test requirements of 2026-10-17).
 *
 * The existing journal makes one observation per form: every photo must be
 * attached to an observation that is filled in before it is saved. In the field
 * that is backwards. This module is the data layer for the capture-first flow:
 *
 * - **Media first.** Photos and videos are imported in bulk into an inbox with no
 *   required fields. Nothing about an image (species, place, habitat, privacy
 *   acknowledgement) is needed to keep it.
 * - **Photos are media; plants are records.** Media are grouped into Plant
 *   records later ("Same plant -> Plant 0042"), regrouped, split or merged
 *   without ever losing a file. A group can say it is the same individual, or
 *   only possibly the same, or the same patch/colony.
 * - **Typed, directional relationships.** A moth, host tree or landscape shot is
 *   linked to one or more plants with an explicit type and the observer's
 *   confidence. Nothing is inferred: a pollination relationship needs evidence
 *   media and is never derived from proximity.
 * - **Session profiles and site templates.** Shared values are entered once and
 *   applied in bulk. A value the observer set on a plant is never overwritten;
 *   a disagreement is returned as a conflict instead.
 * - **Privacy by policy.** Exact coordinates live only on private site templates
 *   and never in the public projection; no per-photo questions.
 *
 * Every operation returns a new state and appends to an audit trail. Media are
 * never deleted by any operation here. Persistence, sync and UI build on this.
 */

export const FIELD_WORKBENCH_SCHEMA_VERSION = 1;

export type MediaKind = "photo" | "video";

/** Where a capture time came from, so a later reader knows how far to trust it. */
export type CaptureTimeSource = "exif" | "file_last_modified" | "import_time";

export type WorkbenchMedia = {
  id: string;
  name: string;
  type: string;
  kind: MediaKind;
  size: number;
  importedAt: string;
  capturedAt: string;
  capturedAtSource: CaptureTimeSource;
  /** Content hash of the original; the original bytes are kept outside this model. */
  sha256: string | null;
  /** Import batch, so an interrupted import can be shown and resumed as one unit. */
  batchId: string;
};

/** How sure the observer is that grouped media show one individual. */
export type PlantIdentityCertainty = "same_individual" | "possibly_same_individual" | "same_patch_or_colony";

export type ProvenancedValue = {
  value: string;
  source: "observer" | "session_profile" | "site_template";
  sourceId: string | null;
  setAt: string;
};

/** Fields a session profile or site template can fill on a plant. */
export const PROFILE_FIELDS = [
  "eventDate",
  "locality",
  "site",
  "habitat",
  "elevation",
  "observer",
  "project",
  "substrate",
] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

export type PlantRecord = {
  id: string;
  /** Human-readable, session-scoped label, e.g. "Plant 0042". Renameable. */
  label: string;
  /** The label assigned at creation; never renamed, so it is safe to publish. */
  sequenceLabel: string;
  mediaIds: string[];
  identityCertainty: PlantIdentityCertainty;
  /** Observer's tentative identification; never required, never a determination. */
  taxonHint: string | null;
  fields: Partial<Record<ProfileField, ProvenancedValue>>;
  siteTemplateId: string | null;
  createdAt: string;
  updatedAt: string;
};

export const RELATIONSHIP_TYPES = [
  "habitat_context",
  "observed_nearby",
  "growing_on",
  "associated_organism",
  "visiting_flower",
  "observed_pollination",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];
export type RelationshipConfidence = "certain" | "probable" | "possible";

export type RelationshipEndpoint = { kind: "media" | "plant"; id: string };

/** A typed, directional, observer-asserted link from evidence to a plant. */
export type WorkbenchRelationship = {
  id: string;
  type: RelationshipType;
  subject: RelationshipEndpoint;
  plantId: string;
  confidence: RelationshipConfidence;
  evidenceMediaIds: string[];
  note: string | null;
  assertedBy: "observer";
  createdAt: string;
};

export type PrivateCoordinates = { latitude: number; longitude: number; accuracyM: number | null };

export type SessionProfile = {
  id: string;
  name: string;
  values: Partial<Record<ProfileField, string>>;
  createdAt: string;
};

export type SiteTemplate = {
  id: string;
  name: string;
  values: Partial<Record<ProfileField, string>>;
  /** Private: never part of a public projection or export. */
  privateCoordinates: PrivateCoordinates | null;
  createdAt: string;
};

export type AuditEntry = {
  at: string;
  action: string;
  plantIds: string[];
  mediaIds: string[];
  detail: string | null;
};

export type WorkbenchState = {
  schemaVersion: typeof FIELD_WORKBENCH_SCHEMA_VERSION;
  accountId: string;
  media: Record<string, WorkbenchMedia>;
  plants: Record<string, PlantRecord>;
  relationships: Record<string, WorkbenchRelationship>;
  sessionProfiles: Record<string, SessionProfile>;
  siteTemplates: Record<string, SiteTemplate>;
  nextPlantNumber: number;
  audit: AuditEntry[];
};

export class WorkbenchError extends Error {}

const IDENTITY_CERTAINTIES: readonly PlantIdentityCertainty[] = [
  "same_individual",
  "possibly_same_individual",
  "same_patch_or_colony",
];
const CONFIDENCES: readonly RelationshipConfidence[] = ["certain", "probable", "possible"];

export type Clock = () => string;
export type IdFactory = () => string;

export type WorkbenchDeps = { now: Clock; newId: IdFactory };

export const defaultDeps: WorkbenchDeps = {
  now: () => new Date().toISOString(),
  newId: () =>
    globalThis.crypto?.randomUUID?.() ?? `wb-${Date.now()}-${Math.random().toString(16).slice(2)}`,
};

export function createWorkbench(accountId: string): WorkbenchState {
  if (!accountId) throw new WorkbenchError("A workbench belongs to one signed-in account.");
  return {
    schemaVersion: FIELD_WORKBENCH_SCHEMA_VERSION,
    accountId,
    media: {},
    plants: {},
    relationships: {},
    sessionProfiles: {},
    siteTemplates: {},
    nextPlantNumber: 1,
    audit: [],
  };
}

function audit(state: WorkbenchState, entry: AuditEntry): AuditEntry[] {
  return [...state.audit, entry];
}

function plantLabel(n: number): string {
  return `Plant ${String(n).padStart(4, "0")}`;
}

function requireMedia(state: WorkbenchState, mediaIds: string[]): void {
  if (mediaIds.length === 0) throw new WorkbenchError("Select at least one photo or video.");
  for (const id of mediaIds) {
    if (!state.media[id]) throw new WorkbenchError(`Unknown media ${id}.`);
  }
}

function requirePlant(state: WorkbenchState, plantId: string): PlantRecord {
  const plant = state.plants[plantId];
  if (!plant) throw new WorkbenchError(`Unknown plant ${plantId}.`);
  return plant;
}

/** Plants other than ``exceptPlantId`` with ``mediaId`` removed from their media. */
function detachMedia(
  plants: Record<string, PlantRecord>,
  mediaIds: Set<string>,
  now: string,
  exceptPlantId: string | null,
): Record<string, PlantRecord> {
  const out: Record<string, PlantRecord> = {};
  for (const [id, plant] of Object.entries(plants)) {
    if (id === exceptPlantId || !plant.mediaIds.some((m) => mediaIds.has(m))) {
      out[id] = plant;
      continue;
    }
    out[id] = { ...plant, mediaIds: plant.mediaIds.filter((m) => !mediaIds.has(m)), updatedAt: now };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

export type ImportFile = {
  name: string;
  type: string;
  size: number;
  lastModified?: number | null;
  /** Capture time read from EXIF by the caller, when trustworthy. */
  exifCapturedAt?: string | null;
  sha256?: string | null;
};

function mediaKind(type: string): MediaKind | null {
  if (type.startsWith("image/")) return "photo";
  if (type.startsWith("video/")) return "video";
  return null;
}

/**
 * Bulk import: every image or video becomes an inbox item at once, with no
 * required fields. Files that are not images or videos are returned as
 * ``rejected`` (never silently dropped).
 */
export function importMedia(
  state: WorkbenchState,
  files: ImportFile[],
  deps: WorkbenchDeps = defaultDeps,
): { state: WorkbenchState; imported: WorkbenchMedia[]; rejected: ImportFile[]; sourceIndices: number[] } {
  const now = deps.now();
  const batchId = deps.newId();
  const imported: WorkbenchMedia[] = [];
  const rejected: ImportFile[] = [];
  /** ``sourceIndices[i]`` is the position in ``files`` of ``imported[i]``. */
  const sourceIndices: number[] = [];
  for (const [index, file] of files.entries()) {
    const kind = mediaKind(file.type);
    if (!kind) {
      rejected.push(file);
      continue;
    }
    sourceIndices.push(index);
    let capturedAt = now;
    let capturedAtSource: CaptureTimeSource = "import_time";
    if (file.exifCapturedAt && !Number.isNaN(Date.parse(file.exifCapturedAt))) {
      capturedAt = new Date(file.exifCapturedAt).toISOString();
      capturedAtSource = "exif";
    } else if (typeof file.lastModified === "number" && Number.isFinite(file.lastModified) && file.lastModified > 0) {
      capturedAt = new Date(file.lastModified).toISOString();
      capturedAtSource = "file_last_modified";
    }
    imported.push({
      id: deps.newId(),
      name: file.name,
      type: file.type,
      kind,
      size: file.size,
      importedAt: now,
      capturedAt,
      capturedAtSource,
      sha256: file.sha256 ?? null,
      batchId,
    });
  }
  const media = { ...state.media };
  for (const item of imported) media[item.id] = item;
  return {
    state: {
      ...state,
      media,
      audit: audit(state, {
        at: now,
        action: "import_media",
        plantIds: [],
        mediaIds: imported.map((m) => m.id),
        detail: rejected.length ? `${rejected.length} file(s) not an image or video` : null,
      }),
    },
    imported,
    rejected,
    sourceIndices,
  };
}

/** Media not yet grouped into any plant (the inbox). Context-only media stay here too. */
export function ungroupedMedia(state: WorkbenchState): WorkbenchMedia[] {
  const grouped = new Set(Object.values(state.plants).flatMap((p) => p.mediaIds));
  return Object.values(state.media)
    .filter((m) => !grouped.has(m.id))
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// Plants: group, add, split, merge, rename
// ---------------------------------------------------------------------------

/**
 * "Same plant -> New Plant ID": group media into a new plant record. Media
 * already in another plant move here; their old plant keeps its other media.
 */
export function groupAsNewPlant(
  state: WorkbenchState,
  mediaIds: string[],
  options: { identityCertainty?: PlantIdentityCertainty; taxonHint?: string | null } = {},
  deps: WorkbenchDeps = defaultDeps,
): { state: WorkbenchState; plant: PlantRecord } {
  requireMedia(state, mediaIds);
  if (options.identityCertainty && !IDENTITY_CERTAINTIES.includes(options.identityCertainty)) {
    throw new WorkbenchError(`Unknown identity certainty ${String(options.identityCertainty)}.`);
  }
  const now = deps.now();
  const plant: PlantRecord = {
    id: deps.newId(),
    label: plantLabel(state.nextPlantNumber),
    sequenceLabel: plantLabel(state.nextPlantNumber),
    mediaIds: [...new Set(mediaIds)],
    identityCertainty: options.identityCertainty ?? "same_individual",
    taxonHint: options.taxonHint?.trim() || null,
    fields: {},
    siteTemplateId: null,
    createdAt: now,
    updatedAt: now,
  };
  const plants = detachMedia(state.plants, new Set(mediaIds), now, null);
  plants[plant.id] = plant;
  return {
    plant,
    state: {
      ...state,
      plants,
      nextPlantNumber: state.nextPlantNumber + 1,
      audit: audit(state, { at: now, action: "group_new_plant", plantIds: [plant.id], mediaIds: plant.mediaIds, detail: plant.label }),
    },
  };
}

/** "Same plant -> Existing Plant ID". */
export function addToPlant(
  state: WorkbenchState,
  plantId: string,
  mediaIds: string[],
  deps: WorkbenchDeps = defaultDeps,
): WorkbenchState {
  const target = requirePlant(state, plantId);
  requireMedia(state, mediaIds);
  const now = deps.now();
  const plants = detachMedia(state.plants, new Set(mediaIds), now, plantId);
  plants[plantId] = { ...target, mediaIds: [...new Set([...target.mediaIds, ...mediaIds])], updatedAt: now };
  return {
    ...state,
    plants,
    audit: audit(state, { at: now, action: "add_to_plant", plantIds: [plantId], mediaIds, detail: null }),
  };
}

/**
 * Split media out of a plant that was grouped by mistake. The media go to a new
 * plant (default) or back to the inbox; nothing is lost. The split-off plant
 * inherits no fields: the observer decides what applies to it.
 */
export function splitPlant(
  state: WorkbenchState,
  plantId: string,
  mediaIds: string[],
  options: { toInbox?: boolean } = {},
  deps: WorkbenchDeps = defaultDeps,
): { state: WorkbenchState; newPlant: PlantRecord | null } {
  const plant = requirePlant(state, plantId);
  requireMedia(state, mediaIds);
  if (mediaIds.some((id) => !plant.mediaIds.includes(id))) {
    throw new WorkbenchError(`Only media in ${plant.label} can be split from it.`);
  }
  const now = deps.now();
  let next: WorkbenchState = {
    ...state,
    plants: {
      ...state.plants,
      [plantId]: { ...plant, mediaIds: plant.mediaIds.filter((id) => !mediaIds.includes(id)), updatedAt: now },
    },
    audit: audit(state, {
      at: now,
      action: options.toInbox ? "split_to_inbox" : "split_plant",
      plantIds: [plantId],
      mediaIds,
      detail: null,
    }),
  };
  if (options.toInbox) return { state: next, newPlant: null };
  const grouped = groupAsNewPlant(next, mediaIds, { identityCertainty: plant.identityCertainty }, deps);
  next = grouped.state;
  return { state: next, newPlant: grouped.plant };
}

/**
 * Merge ``sourceId`` into ``targetId``. Media and relationships move to the
 * target. Fields the target already has win; a differing source value is
 * returned as a conflict rather than silently dropped or applied.
 */
export function mergePlants(
  state: WorkbenchState,
  targetId: string,
  sourceId: string,
  deps: WorkbenchDeps = defaultDeps,
): { state: WorkbenchState; conflicts: FieldConflict[] } {
  if (targetId === sourceId) throw new WorkbenchError("A plant cannot be merged into itself.");
  const target = requirePlant(state, targetId);
  const source = requirePlant(state, sourceId);
  // Distinct sites are never conflated: resolve the site first, then merge.
  const targetSite = target.fields.site?.value;
  const sourceSite = source.fields.site?.value;
  if (
    (target.siteTemplateId && source.siteTemplateId && target.siteTemplateId !== source.siteTemplateId) ||
    (targetSite && sourceSite && targetSite !== sourceSite)
  ) {
    throw new WorkbenchError(`${target.label} and ${source.label} were recorded at different sites; resolve the site before merging.`);
  }
  const now = deps.now();
  const fields = { ...target.fields };
  const conflicts: FieldConflict[] = [];
  for (const field of PROFILE_FIELDS) {
    const incoming = source.fields[field];
    if (!incoming) continue;
    const existing = fields[field];
    if (!existing) fields[field] = incoming;
    else if (existing.value !== incoming.value) {
      conflicts.push({ plantId: targetId, field, current: existing.value, proposed: incoming.value });
    }
  }
  let taxonHint = target.taxonHint;
  if (!taxonHint) taxonHint = source.taxonHint;
  else if (source.taxonHint && source.taxonHint !== taxonHint) {
    conflicts.push({ plantId: targetId, field: "taxonHint", current: taxonHint, proposed: source.taxonHint });
  }
  // A merge can only lower confidence that the media show one individual.
  const identityCertainty =
    IDENTITY_CERTAINTIES[
      Math.max(IDENTITY_CERTAINTIES.indexOf(target.identityCertainty), IDENTITY_CERTAINTIES.indexOf(source.identityCertainty))
    ];
  const plants = { ...state.plants };
  delete plants[sourceId];
  plants[targetId] = {
    ...target,
    mediaIds: [...new Set([...target.mediaIds, ...source.mediaIds])],
    fields,
    taxonHint,
    identityCertainty,
    siteTemplateId: target.siteTemplateId ?? source.siteTemplateId,
    updatedAt: now,
  };
  const relationships: Record<string, WorkbenchRelationship> = {};
  const droppedSelf: string[] = [];
  const droppedDuplicate: string[] = [];
  const seen = new Map<string, string>();
  const ordered = Object.values(state.relationships).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  for (const rel of ordered) {
    const moved = rel.plantId === sourceId ? { ...rel, plantId: targetId } : rel;
    const subject =
      moved.subject.kind === "plant" && moved.subject.id === sourceId ? { kind: "plant" as const, id: targetId } : moved.subject;
    if (subject.kind === "plant" && subject.id === moved.plantId) {
      droppedSelf.push(rel.id); // the two plants were one; a link between them no longer applies
      continue;
    }
    const key = `${moved.type}|${subject.kind}:${subject.id}|${moved.plantId}`;
    if (seen.has(key)) {
      droppedDuplicate.push(rel.id);
      continue;
    }
    seen.set(key, rel.id);
    relationships[rel.id] = { ...moved, subject };
  }
  const detail = {
    conflicts_kept_target: conflicts,
    identity_certainty: identityCertainty,
    relationships_dropped_as_self_links: droppedSelf,
    relationships_dropped_as_duplicates: droppedDuplicate,
  };
  return {
    conflicts,
    state: {
      ...state,
      plants,
      relationships,
      audit: audit(state, {
        at: now,
        action: "merge_plants",
        plantIds: [targetId, sourceId],
        mediaIds: source.mediaIds,
        detail: JSON.stringify(detail),
      }),
    },
  };
}

export function renamePlant(
  state: WorkbenchState,
  plantId: string,
  label: string,
  deps: WorkbenchDeps = defaultDeps,
): WorkbenchState {
  const plant = requirePlant(state, plantId);
  const clean = label.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!clean) throw new WorkbenchError("A plant needs a label.");
  const now = deps.now();
  return {
    ...state,
    plants: { ...state.plants, [plantId]: { ...plant, label: clean, updatedAt: now } },
    audit: audit(state, { at: now, action: "rename_plant", plantIds: [plantId], mediaIds: [], detail: `${plant.label} -> ${clean}` }),
  };
}

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

/**
 * Link evidence (a context photo or another plant) to a plant with an explicit
 * type. One context photo may be linked to many plants. ``observed_pollination``
 * requires evidence media showing it and is never inferred from proximity.
 */
export function relate(
  state: WorkbenchState,
  input: {
    type: RelationshipType;
    subject: RelationshipEndpoint;
    plantId: string;
    confidence: RelationshipConfidence;
    evidenceMediaIds?: string[];
    note?: string | null;
  },
  deps: WorkbenchDeps = defaultDeps,
): { state: WorkbenchState; relationship: WorkbenchRelationship } {
  if (!RELATIONSHIP_TYPES.includes(input.type)) throw new WorkbenchError(`Unknown relationship type ${input.type}.`);
  if (!CONFIDENCES.includes(input.confidence)) throw new WorkbenchError(`Unknown confidence ${String(input.confidence)}.`);
  requirePlant(state, input.plantId);
  if (input.subject.kind === "media") requireMedia(state, [input.subject.id]);
  else {
    requirePlant(state, input.subject.id);
    if (input.subject.id === input.plantId) throw new WorkbenchError("A plant cannot be related to itself.");
  }
  const evidence = [...new Set(input.evidenceMediaIds ?? (input.subject.kind === "media" ? [input.subject.id] : []))];
  if (evidence.length) requireMedia(state, evidence);
  if (input.type === "observed_pollination" && evidence.length === 0) {
    throw new WorkbenchError("Observed pollination needs at least one photo or video showing it.");
  }
  const duplicate = Object.values(state.relationships).find(
    (r) =>
      r.type === input.type &&
      r.plantId === input.plantId &&
      r.subject.kind === input.subject.kind &&
      r.subject.id === input.subject.id,
  );
  const note = input.note?.trim() || null;
  if (duplicate) {
    if (duplicate.confidence === input.confidence && (input.note === undefined || duplicate.note === note)) {
      return { state, relationship: duplicate };
    }
    // Re-asserting a link updates the observer's confidence/note, audited.
    const at = deps.now();
    const updated = { ...duplicate, confidence: input.confidence, note: input.note === undefined ? duplicate.note : note };
    return {
      relationship: updated,
      state: {
        ...state,
        relationships: { ...state.relationships, [updated.id]: updated },
        audit: audit(state, {
          at,
          action: "relate_update",
          plantIds: [input.plantId],
          mediaIds: [],
          detail: `${duplicate.type}: ${duplicate.confidence} -> ${updated.confidence}`,
        }),
      },
    };
  }
  const now = deps.now();
  const relationship: WorkbenchRelationship = {
    id: deps.newId(),
    type: input.type,
    subject: { ...input.subject },
    plantId: input.plantId,
    confidence: input.confidence,
    evidenceMediaIds: evidence,
    note,
    assertedBy: "observer",
    createdAt: now,
  };
  return {
    relationship,
    state: {
      ...state,
      relationships: { ...state.relationships, [relationship.id]: relationship },
      audit: audit(state, {
        at: now,
        action: "relate",
        plantIds: [input.plantId, ...(input.subject.kind === "plant" ? [input.subject.id] : [])],
        mediaIds: input.subject.kind === "media" ? [input.subject.id] : [],
        detail: `${input.type} (${input.confidence})`,
      }),
    },
  };
}

export function unrelate(state: WorkbenchState, relationshipId: string, deps: WorkbenchDeps = defaultDeps): WorkbenchState {
  const rel = state.relationships[relationshipId];
  if (!rel) throw new WorkbenchError(`Unknown relationship ${relationshipId}.`);
  const now = deps.now();
  const relationships = { ...state.relationships };
  delete relationships[relationshipId];
  return {
    ...state,
    relationships,
    audit: audit(state, { at: now, action: "unrelate", plantIds: [rel.plantId], mediaIds: [], detail: rel.type }),
  };
}

// ---------------------------------------------------------------------------
// Session profiles and site templates
// ---------------------------------------------------------------------------

function cleanValues(values: Partial<Record<ProfileField, string>>): Partial<Record<ProfileField, string>> {
  const out: Partial<Record<ProfileField, string>> = {};
  for (const field of PROFILE_FIELDS) {
    const v = values[field]?.replace(/\s+/g, " ").trim();
    if (v) out[field] = v.slice(0, 240);
  }
  return out;
}

export function saveSessionProfile(
  state: WorkbenchState,
  name: string,
  values: Partial<Record<ProfileField, string>>,
  deps: WorkbenchDeps = defaultDeps,
): { state: WorkbenchState; profile: SessionProfile } {
  const now = deps.now();
  const profile: SessionProfile = { id: deps.newId(), name: name.trim() || "Field session", values: cleanValues(values), createdAt: now };
  return {
    profile,
    state: {
      ...state,
      sessionProfiles: { ...state.sessionProfiles, [profile.id]: profile },
      audit: audit(state, { at: now, action: "save_session_profile", plantIds: [], mediaIds: [], detail: profile.name }),
    },
  };
}

export function saveSiteTemplate(
  state: WorkbenchState,
  name: string,
  values: Partial<Record<ProfileField, string>>,
  privateCoordinates: PrivateCoordinates | null = null,
  deps: WorkbenchDeps = defaultDeps,
): { state: WorkbenchState; site: SiteTemplate } {
  if (privateCoordinates) {
    const { latitude, longitude } = privateCoordinates;
    if (!(Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180)) {
      throw new WorkbenchError("Site coordinates are out of range.");
    }
  }
  const now = deps.now();
  const site: SiteTemplate = {
    id: deps.newId(),
    name: name.trim() || "Site",
    values: cleanValues(values),
    privateCoordinates,
    createdAt: now,
  };
  return {
    site,
    state: {
      ...state,
      siteTemplates: { ...state.siteTemplates, [site.id]: site },
      audit: audit(state, { at: now, action: "save_site_template", plantIds: [], mediaIds: [], detail: site.name }),
    },
  };
}

export type FieldConflict = {
  plantId: string;
  field: ProfileField | "taxonHint" | "siteTemplate";
  current: string;
  proposed: string;
};

/**
 * Apply a session profile or site template to selected plants. Empty fields are
 * filled with provenance; a field already holding the same value is left as is;
 * a field holding a *different* value is never overwritten and is reported as a
 * conflict for the observer to resolve. A different site already on a plant is
 * a conflict too: distinct sites are never conflated.
 */
export function applyTemplate(
  state: WorkbenchState,
  template: { kind: "session_profile"; id: string } | { kind: "site_template"; id: string },
  plantIds: string[],
  deps: WorkbenchDeps = defaultDeps,
): { state: WorkbenchState; applied: number; conflicts: FieldConflict[] } {
  const source =
    template.kind === "session_profile" ? state.sessionProfiles[template.id] : state.siteTemplates[template.id];
  if (!source) throw new WorkbenchError(`Unknown ${template.kind.replace("_", " ")} ${template.id}.`);
  if (plantIds.length === 0) throw new WorkbenchError("Select at least one plant.");
  const now = deps.now();
  const plants = { ...state.plants };
  const conflicts: FieldConflict[] = [];
  let applied = 0;
  for (const plantId of plantIds) {
    const plant = requirePlant(state, plantId);
    const fields = { ...plant.fields };
    let siteTemplateId = plant.siteTemplateId;
    if (template.kind === "site_template") {
      const siteName = source.values.site ?? (source as SiteTemplate).name;
      if (siteTemplateId && siteTemplateId !== template.id) {
        const current = state.siteTemplates[siteTemplateId]?.name ?? siteTemplateId;
        conflicts.push({ plantId, field: "siteTemplate", current, proposed: (source as SiteTemplate).name });
        continue;
      }
      // A site the observer typed is a site too: a different one means a different
      // place, so the plant is not linked (nor given this site's locality,
      // elevation or private coordinates).
      const typedSite = fields.site?.value;
      if (!siteTemplateId && typedSite && typedSite !== siteName) {
        conflicts.push({ plantId, field: "site", current: typedSite, proposed: siteName });
        continue;
      }
      siteTemplateId = template.id;
    }
    for (const [field, value] of Object.entries(source.values) as [ProfileField, string][]) {
      const existing = fields[field];
      if (!existing) {
        fields[field] = { value, source: template.kind, sourceId: template.id, setAt: now };
        applied += 1;
      } else if (existing.value !== value) {
        conflicts.push({ plantId, field, current: existing.value, proposed: value });
      }
    }
    plants[plantId] = { ...plant, fields, siteTemplateId, updatedAt: now };
  }
  return {
    applied,
    conflicts,
    state: {
      ...state,
      plants,
      audit: audit(state, {
        at: now,
        action: `apply_${template.kind}`,
        plantIds,
        mediaIds: [],
        detail: JSON.stringify({ template_id: template.id, fields_filled: applied, conflicts_left_for_observer: conflicts }),
      }),
    },
  };
}

/**
 * The observer's own value for one plant; always wins and is recorded as such.
 * Changing or clearing ``site`` away from a linked site template detaches that
 * template and every value it filled (locality, elevation, ...), so a plant
 * never carries one site's name with another site's details or coordinates.
 */
export function setPlantField(
  state: WorkbenchState,
  plantId: string,
  field: ProfileField,
  value: string,
  deps: WorkbenchDeps = defaultDeps,
): WorkbenchState {
  const plant = requirePlant(state, plantId);
  const clean = value.replace(/\s+/g, " ").trim().slice(0, 240);
  const previous = plant.fields[field]?.value ?? null;
  if ((previous ?? "") === clean && plant.fields[field]?.source === "observer") return state;
  if (!previous && !clean) return state;
  const now = deps.now();
  let fields = { ...plant.fields };
  let siteTemplateId = plant.siteTemplateId;
  const detached: string[] = [];
  if (field === "site" && siteTemplateId) {
    const site = state.siteTemplates[siteTemplateId];
    const siteName = site?.values.site ?? site?.name;
    if (clean !== siteName) {
      fields = Object.fromEntries(
        Object.entries(fields).filter(([name, v]) => {
          const fromSite = v?.source === "site_template" && v.sourceId === siteTemplateId;
          if (fromSite) detached.push(name);
          return !fromSite;
        }),
      ) as PlantRecord["fields"];
      siteTemplateId = null;
    }
  }
  if (clean) fields[field] = { value: clean, source: "observer", sourceId: null, setAt: now };
  else delete fields[field];
  return {
    ...state,
    plants: { ...state.plants, [plantId]: { ...plant, fields, siteTemplateId, updatedAt: now } },
    audit: audit(state, {
      at: now,
      action: "set_field",
      plantIds: [plantId],
      mediaIds: [],
      detail:
        `${field}: ${previous ?? "(empty)"} -> ${clean || "(empty)"}` +
        (detached.length || siteTemplateId !== plant.siteTemplateId
          ? `; site template detached with ${detached.length ? detached.join(", ") : "no filled fields"}`
          : ""),
    }),
  };
}

// ---------------------------------------------------------------------------
// Public projection
// ---------------------------------------------------------------------------

export type PublicPlantView = {
  id: string;
  /** The immutable creation label ("Plant 0042"); an observer's rename may name a place. */
  label: string;
  /** Only a plain scientific name; anything else (free text, numbers) is withheld. */
  taxonHint: string | null;
  identityCertainty: PlantIdentityCertainty;
  mediaCount: number;
  /** Year and month of an ISO event date only. */
  eventMonth: string | null;
  relationships: { type: RelationshipType; confidence: RelationshipConfidence; evidenceCount: number }[];
};

const PUBLIC_TAXON = /^(×\s?)?[A-Z][a-z]+(\s(×\s?)?[a-z][a-z-]+)?(\s(sp|spp|cf|aff)\.(\s[a-z][a-z-]+)?)?$/;
const ISO_DATE = /^(\d{4})-(\d{2})-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * What may leave the device for a public or shared view. Structured values only:
 * no coordinates; no free text at all (locality, site, habitat, substrate,
 * project and notes can name a place, an observer's name is personal data, and
 * a renamed label can be either); a taxon hint only when it is a plain
 * scientific name; the event date reduced to year-month and only when it is an
 * ISO date. Precise data stays in the private record for authorised uses.
 */
export function publicPlantView(state: WorkbenchState, plantId: string): PublicPlantView {
  const plant = requirePlant(state, plantId);
  const date = plant.fields.eventDate?.value.match(ISO_DATE);
  const hint = plant.taxonHint?.trim() ?? "";
  return {
    id: plant.id,
    label: plant.sequenceLabel,
    taxonHint: PUBLIC_TAXON.test(hint) ? hint : null,
    identityCertainty: plant.identityCertainty,
    mediaCount: plant.mediaIds.length,
    eventMonth: date ? `${date[1]}-${date[2]}` : null,
    relationships: Object.values(state.relationships)
      .filter((r) => r.plantId === plantId)
      .map((r) => ({ type: r.type, confidence: r.confidence, evidenceCount: r.evidenceMediaIds.length })),
  };
}
