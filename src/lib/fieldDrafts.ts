export type FieldLocalityVisibility = "private" | "research_restricted" | "public";

export type FieldMediaDescriptor = {
  name: string;
  size: number;
  type: string;
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
  status: "local_only";
};

export type NewFieldDraft = {
  note: string;
  taxonLabel?: string;
  localityVisibility: FieldLocalityVisibility;
  media?: FieldMediaDescriptor[];
};

const STORAGE_KEY = "orchid-continuum.field-drafts.v1";
const LOCALITY_VISIBILITIES = new Set<FieldLocalityVisibility>([
  "private",
  "research_restricted",
  "public",
]);

function normalizeText(value: string, maxLength: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
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

function isFieldDraft(value: unknown): value is FieldDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FieldDraft>;
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
    candidate.status === "local_only"
  );
}

export function readFieldDrafts(storage: Pick<Storage, "getItem">): FieldDraft[] {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
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
): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(drafts.filter(isFieldDraft).slice(0, 100)));
}

export function fieldDraftStorageKey(): string {
  return STORAGE_KEY;
}
