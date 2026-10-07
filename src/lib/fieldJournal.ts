export type FieldLocalityVisibility = "private" | "research_restricted" | "public";
export type FieldSyncStatus = "local_only" | "queued" | "syncing" | "synchronized" | "failed";
export type FieldMediaKind = "photo" | "video";
export type FieldCertainty = "CONFIRMED" | "PROBABLE" | "POSSIBLE" | "UNCERTAIN";
export type FieldIdentificationStatus = "unresolved" | "observer_hint_unresolved";

export const FIELD_JOURNAL_SCHEMA_VERSION = 2;
export const FIELD_JOURNAL_MEDIA_LIMIT = 20;

export type PrivateCaptureLocation = {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  elevationM: number | null;
  capturedAt: string;
  localityNotes: string | null;
};

export type FieldMedia = {
  id: string;
  name: string;
  size: number;
  type: string;
  kind: FieldMediaKind;
  blob: Blob;
  capturedAt: string;
  sha256: string | null;
  storageKey: string | null;
  serverMediaId: string | null;
  uploadedAt: string | null;
};

export type FieldObservation = {
  schemaVersion: typeof FIELD_JOURNAL_SCHEMA_VERSION;
  id: string;
  accountId: string;
  serverId: string | null;
  createdAt: string;
  updatedAt: string;
  observedAt: string;
  deviceCapturedAt: string;
  note: string;
  taxonLabel: string | null;
  identificationStatus: FieldIdentificationStatus;
  certainty: FieldCertainty;
  localityVisibility: FieldLocalityVisibility;
  privateLocation: PrivateCaptureLocation | null;
  habitat: string | null;
  substrate: string | null;
  ecologicalNotes: string | null;
  associatedOrganisms: string[];
  pollinatorObservations: string | null;
  mycorrhizalObservations: string | null;
  phenology: string | null;
  media: FieldMedia[];
  syncStatus: FieldSyncStatus;
  syncAttempts: number;
  lastSyncAttemptAt: string | null;
  syncedAt: string | null;
  syncError: string | null;
};

export type NewFieldObservationInput = {
  accountId: string;
  note: string;
  taxonLabel?: string;
  certainty?: FieldCertainty;
  localityVisibility: FieldLocalityVisibility;
  observedAt?: string;
  privateLocation?: PrivateCaptureLocation | null;
  habitat?: string;
  substrate?: string;
  ecologicalNotes?: string;
  associatedOrganisms?: string[];
  pollinatorObservations?: string;
  mycorrhizalObservations?: string;
  phenology?: string;
  media?: FieldMedia[];
};

export const FIELD_JOURNAL_DARWIN_CORE_MAPPING = {
  id: "occurrenceID (local UUID until the backend returns fo-…; then backend id is canonical)",
  observedAt: "eventDate",
  accountId: "recordedBy remains server-side observer_subject; never an email in the payload",
  taxonLabel: "scientificName only as observer taxon_hint; unresolved remains unresolved",
  certainty: "identification confidence/status, not a verified determination",
  habitat: "habitat",
  associatedOrganisms: "associatedTaxa (verbatim observer strings for MVP)",
  media: "associatedMedia by content hash / opaque storage key after upload",
  privateLocation: "PRIVATE capture only; not sent to field-observations/v1 or public Atlas",
  localityVisibility: "governed private/research_restricted/public disclosure class",
} as const;

const LOCALITY_VISIBILITIES = new Set<FieldLocalityVisibility>(["private", "research_restricted", "public"]);
const CERTAINTIES = new Set<FieldCertainty>(["CONFIRMED", "PROBABLE", "POSSIBLE", "UNCERTAIN"]);

export function nowIso(): string {
  return new Date().toISOString();
}

export function newFieldJournalId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `field-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeText(value: string, maxLength: number): string {
  const withoutControls = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127 ? " " : character;
  }).join("");
  return withoutControls.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function optionalText(value: string | null | undefined, maxLength: number): string | null {
  if (value == null) return null;
  const normalized = normalizeText(value, maxLength);
  return normalized || null;
}

function normalizeOrganisms(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => normalizeText(value, 240)).filter(Boolean).slice(0, 50);
}

export function mediaKindFromType(type: string): FieldMediaKind {
  if (type.startsWith("image/")) return "photo";
  if (type.startsWith("video/")) return "video";
  throw new Error("Only image or video files can be attached to a field observation.");
}

export async function sha256Hex(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("This browser cannot hash original media, so the observation cannot be safely synchronized.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function validatePrivateLocation(location: PrivateCaptureLocation | null | undefined): PrivateCaptureLocation | null {
  if (!location) return null;
  if (!Number.isFinite(location.latitude) || Math.abs(location.latitude) > 90) {
    throw new Error("Captured latitude is outside the valid range.");
  }
  if (!Number.isFinite(location.longitude) || Math.abs(location.longitude) > 180) {
    throw new Error("Captured longitude is outside the valid range.");
  }
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracyM: typeof location.accuracyM === "number" && Number.isFinite(location.accuracyM) ? location.accuracyM : null,
    elevationM: typeof location.elevationM === "number" && Number.isFinite(location.elevationM) ? location.elevationM : null,
    capturedAt: location.capturedAt || nowIso(),
    localityNotes: optionalText(location.localityNotes, 1000),
  };
}

export function createFieldObservation(
  input: NewFieldObservationInput,
  identity: { id: string; now: string },
): FieldObservation {
  const note = normalizeText(input.note, 5000);
  if (!note) throw new Error("A field note is required.");
  if (!LOCALITY_VISIBILITIES.has(input.localityVisibility)) {
    throw new Error("A governed locality choice is required.");
  }
  const accountId = normalizeText(input.accountId, 120);
  if (!accountId) throw new Error("An authenticated account is required.");
  const certainty = input.certainty ?? "POSSIBLE";
  if (!CERTAINTIES.has(certainty)) throw new Error("An identification confidence value is required.");
  const taxonLabel = optionalText(input.taxonLabel, 240);
  const media = (input.media ?? []).slice(0, FIELD_JOURNAL_MEDIA_LIMIT);

  return {
    schemaVersion: FIELD_JOURNAL_SCHEMA_VERSION,
    id: normalizeText(identity.id, 120),
    accountId,
    serverId: null,
    createdAt: identity.now,
    updatedAt: identity.now,
    observedAt: input.observedAt || identity.now,
    deviceCapturedAt: identity.now,
    note,
    taxonLabel,
    identificationStatus: taxonLabel ? "observer_hint_unresolved" : "unresolved",
    certainty,
    localityVisibility: input.localityVisibility,
    privateLocation: validatePrivateLocation(input.privateLocation),
    habitat: optionalText(input.habitat, 1000),
    substrate: optionalText(input.substrate, 500),
    ecologicalNotes: optionalText(input.ecologicalNotes, 3000),
    associatedOrganisms: normalizeOrganisms(input.associatedOrganisms),
    pollinatorObservations: optionalText(input.pollinatorObservations, 2000),
    mycorrhizalObservations: optionalText(input.mycorrhizalObservations, 2000),
    phenology: optionalText(input.phenology, 500),
    media,
    syncStatus: "local_only",
    syncAttempts: 0,
    lastSyncAttemptAt: null,
    syncedAt: null,
    syncError: null,
  };
}

export function applyFieldObservationEdit(
  observation: FieldObservation,
  input: Omit<NewFieldObservationInput, "accountId">,
  now: string,
): FieldObservation {
  if (observation.syncStatus === "syncing") {
    throw new Error("This observation is currently syncing and cannot be edited.");
  }
  const edited = createFieldObservation(
    { ...input, accountId: observation.accountId },
    { id: observation.id, now },
  );
  return {
    ...edited,
    createdAt: observation.createdAt,
    observedAt: input.observedAt || observation.observedAt,
    serverId: observation.serverId,
    syncStatus: observation.serverId ? "queued" : "local_only",
    syncAttempts: observation.syncAttempts,
    syncedAt: observation.syncedAt,
    syncError: observation.serverId ? "Edited after sync; server update is deferred in the Saturday MVP." : null,
  };
}

export function queueFieldObservation(observation: FieldObservation): FieldObservation {
  return {
    ...observation,
    syncStatus: observation.syncStatus === "synchronized" ? "synchronized" : "queued",
    syncError: null,
  };
}

export function markFieldObservationSyncing(observation: FieldObservation, now: string): FieldObservation {
  return {
    ...observation,
    syncStatus: "syncing",
    syncAttempts: observation.syncAttempts + 1,
    lastSyncAttemptAt: now,
    syncError: null,
  };
}

export function markFieldObservationFailed(observation: FieldObservation, message: string, now: string): FieldObservation {
  return {
    ...observation,
    syncStatus: "failed",
    updatedAt: now,
    syncError: normalizeText(message, 500) || "Synchronization failed.",
  };
}

export function canEditFieldObservation(observation: FieldObservation): boolean {
  return observation.syncStatus !== "syncing" && observation.syncStatus !== "synchronized";
}

export function toFieldObservationUploadPayload(observation: FieldObservation): Record<string, unknown> {
  // Deliberately explicit. privateLocation and localityNotes never leave the
  // device through this payload; the backend contract rejects coordinate and
  // locality keys if a future caller tries to add them here.
  return {
    observed_at: observation.observedAt,
    device_captured_at: observation.deviceCapturedAt,
    note: observation.note,
    taxon_hint: observation.taxonLabel,
    epistemic_certainty: observation.certainty,
    locality_visibility: observation.localityVisibility,
    habitat: observation.habitat,
    substrate: observation.substrate,
    ecological_notes: observation.ecologicalNotes,
    associated_organisms: observation.associatedOrganisms,
    pollinator_observations: observation.pollinatorObservations,
    mycorrhizal_observations: observation.mycorrhizalObservations,
    phenology: observation.phenology,
    media: observation.media.map((item) => ({ name: item.name, size: item.size, type: item.type })),
    client_draft_id: observation.id,
  };
}

export function fieldObservationStatusLabel(status: FieldSyncStatus): string {
  switch (status) {
    case "local_only": return "Local only";
    case "queued": return "Queued";
    case "syncing": return "Syncing";
    case "synchronized": return "Synchronized";
    case "failed": return "Sync failed";
  }
}
