/**
 * Lance Field Kit v0.1 — offline observation drafts.
 *
 * Extends the original v1 draft schema (note/taxon/locality/media metadata)
 * with the structured ecology fields, protected coordinates, observer and
 * provenance information, and an explicit sync status machine required by the
 * Saturday field mission:
 *
 *   local_saved  → captured on this device, no upload attempted
 *   sync_pending → queued for a governed backend upload
 *   synced       → confirmed stored by the backend
 *   sync_error   → an upload attempt failed; the record is NEVER discarded
 *
 * Locality protection rule: precise coordinates are preserved for `private`
 * and `research_restricted` records. If a draft is marked `public`, stored
 * coordinates are coarsened to ~11 km (0.1 degree) at creation time so an
 * exact locality can never leak through the public path. Public Atlas display
 * must still pass the Orchid Continuum locality-protection rules server-side;
 * this client-side coarsening is a second line of defence, not a replacement.
 */

export type FieldLocalityVisibility = "private" | "research_restricted" | "public";

export type FieldSyncStatus = "local_saved" | "sync_pending" | "synced" | "sync_error";

export const FIELD_SYNC_STATUSES: readonly FieldSyncStatus[] = [
  "local_saved",
  "sync_pending",
  "synced",
  "sync_error",
];

export type FieldCoordinates = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  elevationMeters: number | null;
};

export type FieldEcology = {
  growthHabit: string | null;
  substrate: string | null;
  habitat: string | null;
  surroundingVegetation: string | null;
  plantDescription: string | null;
};

export type FieldRelationships = {
  pollinatorInteraction: string | null;
  mycorrhizalObservation: string | null;
  otherRelationships: string | null;
};

export type FieldMediaDescriptor = {
  id: string;
  name: string;
  size: number;
  type: string;
  capturedAt: string | null;
};

export type FieldDraft = {
  schemaVersion: 2;
  id: string;
  createdAt: string;
  updatedAt: string;
  note: string;
  /** Tentative field label only. Null means UNKNOWN/UNIDENTIFIED and must
   *  never be upgraded to an accepted identification by this module. */
  taxonLabel: string | null;
  localityVisibility: FieldLocalityVisibility;
  coordinates: FieldCoordinates | null;
  ecology: FieldEcology;
  relationships: FieldRelationships;
  observerName: string | null;
  provenance: string | null;
  media: FieldMediaDescriptor[];
  syncStatus: FieldSyncStatus;
  syncError: string | null;
};

export type NewFieldDraft = {
  note?: string;
  taxonLabel?: string;
  localityVisibility: FieldLocalityVisibility;
  coordinates?: FieldCoordinates | null;
  ecology?: Partial<FieldEcology>;
  relationships?: Partial<FieldRelationships>;
  observerName?: string;
  provenance?: string;
  media?: FieldMediaDescriptor[];
};

const STORAGE_KEY_PREFIX = "orchid-continuum.field-drafts.v1";
export const FIELD_DRAFT_LIMIT = 100;
export const FIELD_MEDIA_LIMIT = 20;

const LOCALITY_VISIBILITIES = new Set<FieldLocalityVisibility>([
  "private",
  "research_restricted",
  "public",
]);

const SYNC_STATUSES = new Set<FieldSyncStatus>(FIELD_SYNC_STATUSES);

function normalizeText(value: string, maxLength: number): string {
  const withoutControls = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127 ? " " : character;
  }).join("");
  return withoutControls.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeOptionalText(value: string | null | undefined, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeText(value, maxLength);
  return normalized || null;
}

function normalizeCoordinate(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

function normalizeNonNegative(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Apply the locality-protection rule to a coordinate fix. Precise coordinates
 * survive only on protected records; public records keep a coarsened fix.
 */
export function applyLocalityProtection(
  coordinates: FieldCoordinates | null,
  localityVisibility: FieldLocalityVisibility,
): FieldCoordinates | null {
  if (!coordinates) return null;
  if (localityVisibility === "public") {
    return {
      latitude: roundTo(coordinates.latitude, 1),
      longitude: roundTo(coordinates.longitude, 1),
      accuracyMeters: null,
      elevationMeters: coordinates.elevationMeters,
    };
  }
  return coordinates;
}

export function normalizeCoordinates(value: unknown): FieldCoordinates | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<FieldCoordinates>;
  const latitude = normalizeCoordinate(candidate.latitude, -90, 90);
  const longitude = normalizeCoordinate(candidate.longitude, -180, 180);
  if (latitude === null || longitude === null) return null;
  return {
    latitude,
    longitude,
    accuracyMeters: normalizeNonNegative(candidate.accuracyMeters),
    elevationMeters:
      typeof candidate.elevationMeters === "number" && Number.isFinite(candidate.elevationMeters)
        ? candidate.elevationMeters
        : null,
  };
}

function isMediaDescriptor(value: unknown): value is FieldMediaDescriptor {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FieldMediaDescriptor>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.name === "string" &&
    typeof candidate.size === "number" &&
    typeof candidate.type === "string"
  );
}

function normalizeMedia(media: FieldMediaDescriptor[]): FieldMediaDescriptor[] {
  return media.filter(isMediaDescriptor).slice(0, FIELD_MEDIA_LIMIT).map((item, index) => ({
    id: normalizeText(item.id, 120) || `media-${index}`,
    name: normalizeText(item.name, 180) || "unnamed media",
    size: Number.isFinite(item.size) && item.size >= 0 ? Math.floor(item.size) : 0,
    type: normalizeText(item.type, 100) || "application/octet-stream",
    capturedAt: typeof item.capturedAt === "string" ? item.capturedAt : null,
  }));
}

function normalizeEcology(value: Partial<FieldEcology> | undefined): FieldEcology {
  const source = value ?? {};
  return {
    growthHabit: normalizeOptionalText(source.growthHabit, 120),
    substrate: normalizeOptionalText(source.substrate, 240),
    habitat: normalizeOptionalText(source.habitat, 500),
    surroundingVegetation: normalizeOptionalText(source.surroundingVegetation, 500),
    plantDescription: normalizeOptionalText(source.plantDescription, 1000),
  };
}

function normalizeRelationships(value: Partial<FieldRelationships> | undefined): FieldRelationships {
  const source = value ?? {};
  return {
    pollinatorInteraction: normalizeOptionalText(source.pollinatorInteraction, 500),
    mycorrhizalObservation: normalizeOptionalText(source.mycorrhizalObservation, 500),
    otherRelationships: normalizeOptionalText(source.otherRelationships, 500),
  };
}

export function createFieldDraft(
  input: NewFieldDraft,
  identity: { id: string; now: string },
): FieldDraft {
  const note = normalizeText(input.note ?? "", 5000);
  const taxonLabel = normalizeOptionalText(input.taxonLabel, 240);
  const media = normalizeMedia(input.media ?? []);
  if (!note && !taxonLabel && media.length === 0) {
    throw new Error("A field note, a tentative label, or at least one photo is required.");
  }
  if (!LOCALITY_VISIBILITIES.has(input.localityVisibility)) {
    throw new Error("A governed locality choice is required.");
  }

  const coordinates = applyLocalityProtection(
    normalizeCoordinates(input.coordinates ?? null),
    input.localityVisibility,
  );

  return {
    schemaVersion: 2,
    id: normalizeText(identity.id, 120),
    createdAt: identity.now,
    updatedAt: identity.now,
    note,
    taxonLabel,
    localityVisibility: input.localityVisibility,
    coordinates,
    ecology: normalizeEcology(input.ecology),
    relationships: normalizeRelationships(input.relationships),
    observerName: normalizeOptionalText(input.observerName, 160),
    provenance: normalizeOptionalText(input.provenance, 500),
    media,
    syncStatus: "local_saved",
    syncError: null,
  };
}

/** Allowed sync status transitions. A draft in `sync_error` always keeps its
 *  data; the only way out is back to `sync_pending` (retry) or `synced`. */
const SYNC_TRANSITIONS: Record<FieldSyncStatus, readonly FieldSyncStatus[]> = {
  local_saved: ["sync_pending"],
  sync_pending: ["synced", "sync_error", "local_saved"],
  sync_error: ["sync_pending", "local_saved"],
  synced: ["local_saved"],
};

export function transitionFieldDraftSync(
  draft: FieldDraft,
  next: FieldSyncStatus,
  now: string,
  error?: string,
): FieldDraft {
  if (!SYNC_TRANSITIONS[draft.syncStatus].includes(next)) {
    throw new Error(`Invalid sync transition: ${draft.syncStatus} → ${next}`);
  }
  return {
    ...draft,
    updatedAt: now,
    syncStatus: next,
    syncError: next === "sync_error" ? normalizeOptionalText(error, 300) ?? "sync failed" : null,
  };
}

// ---------------------------------------------------------------------------
// v1 → v2 migration
// ---------------------------------------------------------------------------

type FieldDraftV1 = {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  note: string;
  taxonLabel: string | null;
  localityVisibility: FieldLocalityVisibility;
  media: Array<{ name: string; size: number; type: string }>;
  status: "local_only";
};

function isFieldDraftV1(value: unknown): value is FieldDraftV1 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FieldDraftV1>;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.id === "string" &&
    typeof candidate.note === "string" &&
    candidate.status === "local_only" &&
    LOCALITY_VISIBILITIES.has(candidate.localityVisibility as FieldLocalityVisibility)
  );
}

/** Migrate a v1 draft in place. v1 media descriptors carried no id, so stable
 *  legacy ids are derived from the draft id and index. */
export function migrateFieldDraftV1(draft: FieldDraftV1): FieldDraft {
  return {
    schemaVersion: 2,
    id: draft.id,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    note: draft.note,
    taxonLabel: draft.taxonLabel ?? null,
    localityVisibility: draft.localityVisibility,
    coordinates: null,
    ecology: normalizeEcology(undefined),
    relationships: normalizeRelationships(undefined),
    observerName: null,
    provenance: null,
    media: (Array.isArray(draft.media) ? draft.media : []).map((item, index) => ({
      id: `legacy-${draft.id}-${index}`,
      name: typeof item?.name === "string" ? item.name : "unnamed media",
      size: typeof item?.size === "number" ? item.size : 0,
      type: typeof item?.type === "string" ? item.type : "application/octet-stream",
      capturedAt: null,
    })),
    syncStatus: "local_saved",
    syncError: null,
  };
}

function isFieldDraft(value: unknown): value is FieldDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FieldDraft>;
  return (
    candidate.schemaVersion === 2 &&
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string" &&
    typeof candidate.note === "string" &&
    (candidate.taxonLabel === null || typeof candidate.taxonLabel === "string") &&
    LOCALITY_VISIBILITIES.has(candidate.localityVisibility as FieldLocalityVisibility) &&
    Array.isArray(candidate.media) &&
    candidate.media.every(isMediaDescriptor) &&
    SYNC_STATUSES.has(candidate.syncStatus as FieldSyncStatus)
  );
}

function requireAccountId(accountId: string): string {
  const normalized = normalizeText(accountId, 120);
  if (!normalized) throw new Error("An authenticated account is required.");
  return normalized;
}

export function readFieldDrafts(
  storage: Pick<Storage, "getItem">,
  accountId: string,
): FieldDraft[] {
  try {
    const raw = storage.getItem(fieldDraftStorageKey(accountId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry: unknown) => {
        if (isFieldDraftV1(entry)) return migrateFieldDraftV1(entry);
        return isFieldDraft(entry) ? entry : null;
      })
      .filter((draft): draft is FieldDraft => draft !== null)
      .map((draft) => ({
        ...draft,
        note: normalizeText(draft.note, 5000),
        taxonLabel: draft.taxonLabel ? normalizeText(draft.taxonLabel, 240) : null,
        coordinates: applyLocalityProtection(
          normalizeCoordinates(draft.coordinates),
          draft.localityVisibility,
        ),
        ecology: normalizeEcology(draft.ecology),
        relationships: normalizeRelationships(draft.relationships),
        observerName: normalizeOptionalText(draft.observerName, 160),
        provenance: normalizeOptionalText(draft.provenance, 500),
        media: normalizeMedia(draft.media),
        syncError: normalizeOptionalText(draft.syncError, 300),
      }));
  } catch {
    return [];
  }
}

export function writeFieldDrafts(
  storage: Pick<Storage, "setItem">,
  drafts: FieldDraft[],
  accountId: string,
): void {
  if (drafts.length > FIELD_DRAFT_LIMIT) {
    throw new Error(`This device can store up to ${FIELD_DRAFT_LIMIT} field drafts. Discard or upload a draft before saving another.`);
  }
  storage.setItem(
    fieldDraftStorageKey(accountId),
    JSON.stringify(drafts.filter(isFieldDraft)),
  );
}

export function fieldDraftStorageKey(accountId: string): string {
  return `${STORAGE_KEY_PREFIX}.${encodeURIComponent(requireAccountId(accountId))}`;
}
