export type FieldLocalityVisibility = "private" | "research_restricted" | "public";

export type FieldMediaDescriptor = {
  name: string;
  size: number;
  type: string;
};

export type FieldDraftStatus = "local_only" | "uploaded";

/**
 * Receipt for a draft that reached the governed backend upload path
 * (journey 5). Only the durable observation id, the upload time and the
 * hypothesis-loop path are kept on the device; the record itself lives in
 * Calyx and is never treated as published or verified here.
 */
export type FieldDraftUpload = {
  observationId: string;
  uploadedAt: string;
  hypothesesPath: string;
};

export type FieldDraft = {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  note: string;
  taxonLabel: string | null;
  localityVisibility: FieldLocalityVisibility;
  media: FieldMediaDescriptor[];
  status: FieldDraftStatus;
  upload?: FieldDraftUpload;
};

export type NewFieldDraft = {
  note: string;
  taxonLabel?: string;
  localityVisibility: FieldLocalityVisibility;
  media?: FieldMediaDescriptor[];
};

const STORAGE_KEY_PREFIX = "orchid-continuum.field-drafts.v1";
export const FIELD_DRAFT_LIMIT = 100;
const LOCALITY_VISIBILITIES = new Set<FieldLocalityVisibility>([
  "private",
  "research_restricted",
  "public",
]);

function normalizeText(value: string, maxLength: number): string {
  const withoutControls = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127 ? " " : character;
  }).join("");
  return withoutControls.replace(/\\s+/g, " ").trim().slice(0, maxLength);
}

function isMediaDescriptor(value: unknown): value is FieldMediaDescriptor {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FieldMediaDescriptor>;
  return typeof candidate.name === "string" && typeof candidate.size === "number" && typeof candidate.type === "string";
}

function normalizeMedia(media: FieldMediaDescriptor[]): FieldMediaDescriptor[] {
  return media.filter(isMediaDescriptor).slice(0, 20).map((item) => ({
    name: normalizeText(item.name, 180) || "unnamed media",
    size: Number.isFinite(item.size) && item.size >= 0 ? Math.floor(item.size) : 0,
    type: normalizeText(item.type, 100) || "application/octet-stream",
  }));
}

export function createFieldDraft(
  input: NewFieldDraft,
  identity: { id: string; now: string },
): FieldDraft {
  const note = normalizeText(input.note, 5000);
  if (!note) throw new Error("A field note is required.");
  if (!LOCALITY_VISIBILITIES.has(input.localityVisibility)) {
    throw new Error("A governed locality choice is required.");
  }

  const taxonLabel = normalizeText(input.taxonLabel ?? "", 240);
  return {
    schemaVersion: 1,
    id: normalizeText(identity.id, 120),
    createdAt: identity.now,
    updatedAt: identity.now,
    note,
    taxonLabel: taxonLabel || null,
    localityVisibility: input.localityVisibility,
    media: normalizeMedia(input.media ?? []),
    status: "local_only",
  };
}

function isFieldDraftUpload(value: unknown): value is FieldDraftUpload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FieldDraftUpload>;
  return (
    typeof candidate.observationId === "string" &&
    candidate.observationId.length > 0 &&
    typeof candidate.uploadedAt === "string" &&
    typeof candidate.hypothesesPath === "string" &&
    candidate.hypothesesPath.startsWith("/api/field-observations/")
  );
}

function isFieldDraft(value: unknown): value is FieldDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FieldDraft>;
  const statusValid =
    candidate.status === "local_only"
      ? candidate.upload === undefined
      : candidate.status === "uploaded" && isFieldDraftUpload(candidate.upload);
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string" &&
    typeof candidate.note === "string" &&
    candidate.note.length > 0 &&
    (candidate.taxonLabel === null || typeof candidate.taxonLabel === "string") &&
    LOCALITY_VISIBILITIES.has(candidate.localityVisibility as FieldLocalityVisibility) &&
    Array.isArray(candidate.media) &&
    candidate.media.every(isMediaDescriptor) &&
    statusValid
  );
}

/**
 * Record that a draft reached Calyx. The draft keeps its note, taxon text,
 * locality class and media metadata on the device (the user can still read
 * it offline); only the receipt is added. Re-marking with the same
 * observation id is a no-op apart from the timestamp.
 */
export function markFieldDraftUploaded(
  draft: FieldDraft,
  upload: { observationId: string; hypothesesPath: string },
  now: string,
): FieldDraft {
  const observationId = normalizeText(upload.observationId, 120);
  if (!observationId) throw new Error("Calyx did not return an observation id.");
  if (!upload.hypothesesPath.startsWith("/api/field-observations/")) {
    throw new Error("Calyx returned an unexpected hypothesis-loop path.");
  }
  return {
    ...draft,
    updatedAt: now,
    status: "uploaded",
    upload: { observationId, uploadedAt: now, hypothesesPath: upload.hypothesesPath },
  };
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
    return parsed.filter(isFieldDraft).map((draft) => ({
      ...draft,
      note: normalizeText(draft.note, 5000),
      taxonLabel: draft.taxonLabel ? normalizeText(draft.taxonLabel, 240) : null,
      media: normalizeMedia(draft.media),
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
