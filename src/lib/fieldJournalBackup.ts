import {
  FIELD_JOURNAL_MEDIA_LIMIT,
  FIELD_JOURNAL_SCHEMA_VERSION,
  mediaKindFromType,
  parseServerDurability,
  validatePrivateLocation,
  type FieldCertainty,
  type FieldIdentificationStatus,
  type FieldLocalityVisibility,
  type FieldMedia,
  type FieldObservation,
  type FieldSyncStatus,
} from "./fieldJournal";
import { type FieldJournalExportMode } from "./fieldJournalExport";
import { buildStoreZip, crc32, FieldZipError, readStoreZip, type FieldZipEntry, type FieldZipInput } from "./fieldJournalZip";

export const FIELD_JOURNAL_BACKUP_SCHEMA = "orchid-continuum-field-journal-backup/v1";
export const FIELD_JOURNAL_PRODUCT_NAME = "the Orchid Continuum Field Journal";
export const FIELD_JOURNAL_BACKUP_MAX_OBSERVATIONS = 5_000;
export const FIELD_JOURNAL_BACKUP_MANIFEST_MAX_BYTES = 32 * 1024 * 1024;
const MANIFEST_NAME = "manifest.json";
const MEDIA_PATH = /^media\/\d{1,4}\/\d{1,2}(?:\.[A-Za-z0-9]{1,8})?$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const ZIP32_MEDIA_MAX = 0xffffffff - 1;

export const FIELD_JOURNAL_BACKUP_NOTICE =
  "Private working copy of the Orchid Continuum Field Journal on this device: observation records plus original photo/video bytes, " +
  "each verified by SHA-256. Original photos and videos are copied unchanged and may contain embedded location (EXIF/GPS metadata) " +
  "whether or not the private GPS option is chosen; that option controls only the structured capture GPS and locality-note fields. " +
  "Observer notes and filenames may also contain sensitive information. This is not a public-safe export.";

const ACCOUNT_BINDING_CONTEXT = "orchid-continuum-field-journal-backup/v1/account-binding:";

/**
 * Non-secret account binding: SHA-256 of a fixed app string plus the account
 * id. It lets restore recognise "same account" without writing the id itself.
 */
export async function fieldJournalAccountBinding(accountId: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("This browser cannot compute the backup account binding.");
  return hex(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(ACCOUNT_BINDING_CONTEXT + accountId)));
}

export type FieldJournalBackupMedia = Omit<FieldMedia, "blob"> & { sha256: string; path: string };
export type FieldJournalBackupObservation = Omit<FieldObservation, "accountId" | "media" | "privateLocation"> & {
  privateLocation?: FieldObservation["privateLocation"];
  media: FieldJournalBackupMedia[];
};
export type FieldJournalBackupManifest = {
  schema: typeof FIELD_JOURNAL_BACKUP_SCHEMA;
  product: typeof FIELD_JOURNAL_PRODUCT_NAME;
  exportedAt: string;
  mode: FieldJournalExportMode;
  disclosure: "private_working_copy";
  includesMediaBytes: true;
  includesPrivateCaptureLocation: boolean;
  includesSyncReceipts: true;
  accountBinding: string;
  notice: string;
  observationCount: number;
  mediaCount: number;
  mediaBytes: number;
  observations: FieldJournalBackupObservation[];
};

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** One read of the original bytes yields both the manifest SHA-256 and the ZIP CRC-32. */
async function digestOriginal(blob: Blob): Promise<{ sha256: string; crc32: number }> {
  if (!globalThis.crypto?.subtle) throw new Error("This browser cannot hash original media, so a verified backup cannot be made.");
  const bytes = await blob.arrayBuffer();
  return { sha256: hex(await globalThis.crypto.subtle.digest("SHA-256", bytes)), crc32: crc32(new Uint8Array(bytes)) };
}

function extensionFor(name: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(name);
  return match ? `.${match[1].toLowerCase()}` : "";
}

/**
 * Build a full-media backup. Every original Blob is included byte-for-byte as a
 * STORE entry; the manifest records its SHA-256. Private capture GPS/locality
 * notes are excluded unless mode is "private_backup". Account identity is never
 * written; restore binds records to the account restoring them.
 */
export async function buildFieldJournalBackup(
  observations: readonly FieldObservation[],
  exportedAt: string,
  mode: FieldJournalExportMode,
  accountId: string,
): Promise<{ blob: Blob; manifest: FieldJournalBackupManifest; fileName: string }> {
  if (!accountId) throw new Error("Sign in before making a backup.");
  if (observations.some((observation) => observation.accountId !== accountId)) {
    throw new Error("A backup can only contain observations of the signed-in account.");
  }
  if (mode !== "metadata" && mode !== "private_backup") throw new Error("Choose a valid Field Journal export mode.");
  if (observations.length > FIELD_JOURNAL_BACKUP_MAX_OBSERVATIONS) {
    throw new Error(`Back up at most ${FIELD_JOURNAL_BACKUP_MAX_OBSERVATIONS} observations at a time.`);
  }
  const includePrivateLocation = mode === "private_backup";
  const mediaEntries: FieldZipInput[] = [];
  let mediaBytes = 0;
  const backupObservations: FieldJournalBackupObservation[] = [];
  for (const [observationIndex, observation] of observations.entries()) {
    const media: FieldJournalBackupMedia[] = [];
    for (const [mediaIndex, item] of observation.media.entries()) {
      const digest = await digestOriginal(item.blob);
      if (item.sha256 && item.sha256 !== digest.sha256) {
        throw new Error(`An original file (${item.name}) no longer matches its recorded SHA-256. The backup was stopped so it cannot silently copy damaged media.`);
      }
      const path = `media/${observationIndex}/${mediaIndex}${extensionFor(item.name)}`;
      mediaEntries.push({ name: path, data: item.blob, crc32: digest.crc32 });
      mediaBytes += item.blob.size;
      media.push({
        id: item.id, name: item.name, size: item.blob.size, type: item.type, kind: item.kind, capturedAt: item.capturedAt,
        sha256: digest.sha256, storageKey: item.storageKey, serverMediaId: item.serverMediaId, uploadedAt: item.uploadedAt,
        serverDurability: item.serverDurability ?? null, path,
      });
    }
    const { accountId: _accountId, media: _media, privateLocation, ...record } = observation;
    backupObservations.push({
      ...record,
      associatedOrganisms: [...record.associatedOrganisms],
      ...(includePrivateLocation ? { privateLocation: privateLocation ? { ...privateLocation } : null } : {}),
      media,
    });
  }
  const manifest: FieldJournalBackupManifest = {
    schema: FIELD_JOURNAL_BACKUP_SCHEMA,
    product: FIELD_JOURNAL_PRODUCT_NAME,
    exportedAt,
    mode,
    disclosure: "private_working_copy",
    includesMediaBytes: true,
    includesPrivateCaptureLocation: includePrivateLocation,
    includesSyncReceipts: true,
    accountBinding: await fieldJournalAccountBinding(accountId),
    notice: FIELD_JOURNAL_BACKUP_NOTICE,
    observationCount: backupObservations.length,
    mediaCount: mediaEntries.length,
    mediaBytes,
    observations: backupObservations,
  };
  const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
  const blob = await buildStoreZip([{ name: MANIFEST_NAME, data: manifestBlob }, ...mediaEntries], exportedAt);
  const stamp = exportedAt.replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `orchid-continuum-field-journal-backup${includePrivateLocation ? "-with-private-gps" : ""}-${stamp}.zip`;
  return { blob, manifest, fileName };
}

// ---------------------------------------------------------------- restore

export type FieldJournalRestoreRejection = { id: string | null; reason: string };
export type ParsedFieldJournalBackup = {
  manifest: Pick<FieldJournalBackupManifest, "schema" | "exportedAt" | "mode" | "includesPrivateCaptureLocation"> & {
    /** null when the manifest carries no valid binding; treated as another account. */
    accountBinding: string | null;
  };
  /** Validated observations without accountId; restore binds them to the current account. */
  observations: Omit<FieldObservation, "accountId">[];
  rejected: FieldJournalRestoreRejection[];
};

const SYNC_STATUSES = new Set<FieldSyncStatus>(["local_only", "queued", "syncing", "synchronized", "failed"]);
const LOCALITIES = new Set<FieldLocalityVisibility>(["private", "research_restricted", "public"]);
const CERTAINTIES = new Set<FieldCertainty>(["CONFIRMED", "PROBABLE", "POSSIBLE", "UNCERTAIN"]);
const IDENTIFICATIONS = new Set<FieldIdentificationStatus>(["unresolved", "observer_hint_unresolved"]);

class RecordError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown, field: string, max: number, { nullable = false, required = true } = {}): string | null {
  if (value == null && nullable) return null;
  if (typeof value !== "string" || value.length > max || (required && !value)) throw new RecordError(`invalid ${field}`);
  return value;
}
function timestamp(value: unknown, field: string, nullable = false): string | null {
  const parsed = text(value, field, 40, { nullable });
  if (parsed !== null && Number.isNaN(Date.parse(parsed))) throw new RecordError(`invalid ${field}`);
  return parsed;
}
function enumValue<T extends string>(value: unknown, allowed: Set<T>, field: string): T {
  if (typeof value !== "string" || !allowed.has(value as T)) throw new RecordError(`invalid ${field}`);
  return value as T;
}

type MediaPlan = { path: string; sha256: string; size: number; media: Omit<FieldMedia, "blob"> };

function parseBackupObservation(raw: unknown, includesLocation: boolean): { record: Omit<FieldObservation, "accountId" | "media">; media: MediaPlan[] } {
  if (!isRecord(raw)) throw new RecordError("observation is not an object");
  if (raw.schemaVersion !== FIELD_JOURNAL_SCHEMA_VERSION) throw new RecordError("unsupported observation schema version");
  if ("accountId" in raw) throw new RecordError("backup records must not carry account identity");
  if (!includesLocation && "privateLocation" in raw) throw new RecordError("private location present in a backup that declares it excluded");
  const id = text(raw.id, "id", 120) as string;
  const note = text(raw.note, "note", 5000) as string;
  const associated = raw.associatedOrganisms;
  if (!Array.isArray(associated) || associated.length > 50 || associated.some((item) => typeof item !== "string" || item.length > 240)) {
    throw new RecordError("invalid associatedOrganisms");
  }
  const syncAttempts = raw.syncAttempts;
  if (typeof syncAttempts !== "number" || !Number.isInteger(syncAttempts) || syncAttempts < 0 || syncAttempts > 1_000_000) {
    throw new RecordError("invalid syncAttempts");
  }
  if (!Array.isArray(raw.media) || raw.media.length > FIELD_JOURNAL_MEDIA_LIMIT) throw new RecordError("invalid media list");
  const media: MediaPlan[] = raw.media.map((item, index) => {
    if (!isRecord(item)) throw new RecordError(`invalid media ${index}`);
    const type = text(item.type, "media type", 200) as string;
    let kind;
    try { kind = mediaKindFromType(type); } catch { throw new RecordError("media is not a photo or video"); }
    if (item.kind !== kind) throw new RecordError("media kind does not match its type");
    const sha256 = text(item.sha256, "media sha256", 64) as string;
    if (!SHA256_HEX.test(sha256)) throw new RecordError("invalid media sha256");
    const path = text(item.path, "media path", 64) as string;
    if (!MEDIA_PATH.test(path)) throw new RecordError("invalid media path");
    const size = item.size;
    if (typeof size !== "number" || !Number.isInteger(size) || size < 0 || size > ZIP32_MEDIA_MAX) throw new RecordError("invalid media size");
    return {
      path, sha256, size,
      media: {
        id: text(item.id, "media id", 120) as string,
        name: text(item.name, "media name", 500) as string,
        size, type, kind, sha256,
        capturedAt: timestamp(item.capturedAt, "media capturedAt") as string,
        storageKey: text(item.storageKey, "media storageKey", 1000, { nullable: true }),
        serverMediaId: text(item.serverMediaId, "media serverMediaId", 500, { nullable: true }),
        uploadedAt: timestamp(item.uploadedAt, "media uploadedAt", true),
        serverDurability: (() => {
          if (item.serverDurability != null && parseServerDurability(item.serverDurability) === null) throw new RecordError("invalid media serverDurability");
          return parseServerDurability(item.serverDurability);
        })(),
      },
    };
  });
  if (new Set(media.map((item) => item.media.id)).size !== media.length) throw new RecordError("duplicate media id");
  let privateLocation: FieldObservation["privateLocation"] = null;
  if (includesLocation && raw.privateLocation != null) {
    if (!isRecord(raw.privateLocation)) throw new RecordError("invalid privateLocation");
    try {
      privateLocation = validatePrivateLocation(raw.privateLocation as FieldObservation["privateLocation"]);
    } catch {
      throw new RecordError("invalid privateLocation");
    }
  }
  let syncStatus = enumValue(raw.syncStatus, SYNC_STATUSES, "syncStatus");
  let syncError = text(raw.syncError, "syncError", 500, { nullable: true, required: false });
  const serverId = text(raw.serverId, "serverId", 200, { nullable: true });
  if (syncStatus === "synchronized" && !serverId) throw new RecordError("synchronized record without a server id");
  if (syncStatus === "syncing") {
    // A backup taken mid-upload restores as retryable; saved receipts are kept.
    syncStatus = "failed";
    syncError = "A sync was in progress when this backup was made. Retry to resume saved media uploads.";
  }
  return {
    record: {
      schemaVersion: FIELD_JOURNAL_SCHEMA_VERSION,
      id,
      serverId,
      createdAt: timestamp(raw.createdAt, "createdAt") as string,
      updatedAt: timestamp(raw.updatedAt, "updatedAt") as string,
      observedAt: timestamp(raw.observedAt, "observedAt") as string,
      deviceCapturedAt: timestamp(raw.deviceCapturedAt, "deviceCapturedAt") as string,
      note,
      taxonLabel: text(raw.taxonLabel, "taxonLabel", 240, { nullable: true }),
      identificationStatus: enumValue(raw.identificationStatus, IDENTIFICATIONS, "identificationStatus"),
      certainty: enumValue(raw.certainty, CERTAINTIES, "certainty"),
      localityVisibility: enumValue(raw.localityVisibility, LOCALITIES, "localityVisibility"),
      privateLocation,
      habitat: text(raw.habitat, "habitat", 1000, { nullable: true }),
      substrate: text(raw.substrate, "substrate", 500, { nullable: true }),
      ecologicalNotes: text(raw.ecologicalNotes, "ecologicalNotes", 3000, { nullable: true }),
      associatedOrganisms: [...associated] as string[],
      pollinatorObservations: text(raw.pollinatorObservations, "pollinatorObservations", 2000, { nullable: true }),
      mycorrhizalObservations: text(raw.mycorrhizalObservations, "mycorrhizalObservations", 2000, { nullable: true }),
      phenology: text(raw.phenology, "phenology", 500, { nullable: true }),
      syncStatus,
      syncAttempts,
      lastSyncAttemptAt: timestamp(raw.lastSyncAttemptAt, "lastSyncAttemptAt", true),
      syncedAt: timestamp(raw.syncedAt, "syncedAt", true),
      syncError,
    },
    media,
  };
}

async function verifiedEntryBytes(entry: FieldZipEntry): Promise<ArrayBuffer> {
  const bytes = await entry.data.arrayBuffer();
  if (bytes.byteLength !== entry.size || crc32(new Uint8Array(bytes)) !== entry.crc32) {
    throw new RecordError(`${entry.name} failed its CRC-32 check`);
  }
  return bytes;
}

/**
 * Parse a backup made by buildFieldJournalBackup. The file as a whole is
 * rejected unless it is this app's own STORE ZIP with a valid manifest and no
 * unreferenced entries. Individual observations whose media fail CRC-32 or
 * SHA-256 verification are rejected and reported; others are returned with
 * media Blobs sliced from the file (byte-identical to the originals).
 */
export async function parseFieldJournalBackup(file: Blob): Promise<ParsedFieldJournalBackup> {
  if (!globalThis.crypto?.subtle) throw new Error("This browser cannot verify backup media hashes.");
  let entries: FieldZipEntry[];
  try {
    entries = await readStoreZip(file, (name) => name === MANIFEST_NAME || MEDIA_PATH.test(name), {
      maxEntrySize: (name) => name === MANIFEST_NAME ? FIELD_JOURNAL_BACKUP_MANIFEST_MAX_BYTES : ZIP32_MEDIA_MAX,
    });
  } catch (error) {
    if (error instanceof FieldZipError) throw new Error(`Restore refused: ${error.message}`);
    throw error;
  }
  const manifestEntry = entries.find((entry) => entry.name === MANIFEST_NAME);
  if (!manifestEntry || entries[0] !== manifestEntry) throw new Error("Restore refused: this is not a Field Journal backup (no manifest).");
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await verifiedEntryBytes(manifestEntry)));
  } catch {
    throw new Error("Restore refused: the backup manifest is damaged.");
  }
  if (!isRecord(raw) || raw.schema !== FIELD_JOURNAL_BACKUP_SCHEMA || raw.includesMediaBytes !== true ||
      (raw.mode !== "metadata" && raw.mode !== "private_backup") ||
      raw.includesPrivateCaptureLocation !== (raw.mode === "private_backup") ||
      typeof raw.exportedAt !== "string" || !Array.isArray(raw.observations) ||
      raw.observations.length > FIELD_JOURNAL_BACKUP_MAX_OBSERVATIONS) {
    throw new Error("Restore refused: the manifest is not a supported Field Journal backup.");
  }
  const includesLocation = raw.includesPrivateCaptureLocation === true;
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  const referenced = new Set<string>([MANIFEST_NAME]);
  const planned: { id: string | null; parsed?: ReturnType<typeof parseBackupObservation>; error?: string }[] = raw.observations.map((item) => {
    const id = isRecord(item) && typeof item.id === "string" ? item.id.slice(0, 120) : null;
    try {
      const parsed = parseBackupObservation(item, includesLocation);
      for (const media of parsed.media) {
        if (referenced.has(media.path)) throw new RecordError("media file referenced twice");
        referenced.add(media.path);
        const entry = byName.get(media.path);
        if (!entry) throw new RecordError(`missing media file ${media.path}`);
        if (entry.size !== media.size) throw new RecordError(`media size mismatch for ${media.path}`);
      }
      return { id, parsed };
    } catch (error) {
      if (error instanceof RecordError) return { id, error: error.message };
      throw error;
    }
  });
  const ids = planned.flatMap((item) => item.parsed ? [item.parsed.record.id] : []);
  if (new Set(ids).size !== ids.length) throw new Error("Restore refused: the backup lists the same observation twice.");
  // Files belonging to a rejected record are still "listed"; anything else is foreign.
  const listed = new Set<string>([MANIFEST_NAME]);
  for (const item of raw.observations) {
    if (isRecord(item) && Array.isArray(item.media)) {
      for (const mediaItem of item.media) if (isRecord(mediaItem) && typeof mediaItem.path === "string") listed.add(mediaItem.path);
    }
  }
  if (entries.some((entry) => !listed.has(entry.name))) throw new Error("Restore refused: the backup contains files not listed in its manifest.");

  const observations: Omit<FieldObservation, "accountId">[] = [];
  const rejected: FieldJournalRestoreRejection[] = [];
  for (const item of planned) {
    if (!item.parsed) { rejected.push({ id: item.id, reason: item.error ?? "invalid record" }); continue; }
    try {
      const media: FieldMedia[] = [];
      for (const plan of item.parsed.media) {
        const entry = byName.get(plan.path) as FieldZipEntry;
        const bytes = await verifiedEntryBytes(entry);
        const sha256 = hex(await globalThis.crypto.subtle.digest("SHA-256", bytes));
        if (sha256 !== plan.sha256) throw new RecordError(`${plan.path} does not match its SHA-256`);
        // Slice (not copy) the verified range so large videos are not duplicated in memory.
        media.push({ ...plan.media, blob: file.slice(entry.offset, entry.offset + entry.size, plan.media.type) });
      }
      observations.push({ ...item.parsed.record, media });
    } catch (error) {
      if (error instanceof RecordError) rejected.push({ id: item.id, reason: error.message });
      else throw error;
    }
  }
  return {
    manifest: {
      schema: FIELD_JOURNAL_BACKUP_SCHEMA, exportedAt: raw.exportedAt, mode: raw.mode, includesPrivateCaptureLocation: includesLocation,
      accountBinding: typeof raw.accountBinding === "string" && SHA256_HEX.test(raw.accountBinding) ? raw.accountBinding : null,
    },
    observations,
    rejected,
  };
}

/** True when a record carries any server acceptance or media upload receipt. */
export function hasServerState(observation: Omit<FieldObservation, "accountId">): boolean {
  return !!observation.serverId || !!observation.syncedAt || observation.syncStatus === "synchronized" ||
    observation.media.some((item) => !!(item.serverMediaId || item.storageKey || item.uploadedAt));
}

/** Whether a parsed backup was made by the signed-in account (missing binding = no). */
export async function backupMatchesAccount(binding: string | null, accountId: string): Promise<boolean> {
  return !!binding && !!accountId && binding === await fieldJournalAccountBinding(accountId);
}

export type FieldJournalRestoreDecision =
  | { action: "insert" | "replace"; observation: FieldObservation; reason: string }
  | { action: "skip" | "reject"; reason: string };

/**
 * Merge rule for one restored record against the current device copy:
 * never cross accounts, never downgrade a server-accepted record, keep the copy
 * with the later updatedAt, never drop a local original or saved receipt, and
 * keep device GPS when the backup deliberately excluded it.
 */
export function decideFieldJournalRestore(
  local: FieldObservation | null,
  incoming: Omit<FieldObservation, "accountId">,
  accountId: string,
  backupIncludesLocation: boolean,
  sameAccount: boolean,
): FieldJournalRestoreDecision {
  if (!accountId) return { action: "reject", reason: "no signed-in account" };
  if (!sameAccount && hasServerState(incoming)) {
    // Server ids and media receipts belong to the account that made the backup;
    // binding them to this account would show or retry another account's records.
    return { action: "reject", reason: "belongs to another account (already sent to the server)" };
  }
  const candidate: FieldObservation = { ...incoming, accountId };
  if (!local) return { action: "insert", observation: candidate, reason: "new on this device" };
  if (local.accountId !== accountId) return { action: "reject", reason: "this id belongs to another account on this device" };
  if (local.syncStatus === "syncing") return { action: "skip", reason: "currently syncing on this device" };
  if (local.serverId && incoming.serverId && local.serverId !== incoming.serverId) {
    return { action: "reject", reason: "server id conflicts with the device copy" };
  }
  if (local.serverId && !incoming.serverId) return { action: "skip", reason: "device copy is already server-accepted" };
  if (local.syncStatus === "synchronized" && incoming.syncStatus !== "synchronized") {
    return { action: "skip", reason: "device copy is already synchronized" };
  }
  if (Date.parse(incoming.updatedAt) <= Date.parse(local.updatedAt)) {
    return { action: "skip", reason: "device copy is the same or newer" };
  }
  const localMedia = new Map(local.media.map((item) => [item.id, item]));
  const media = candidate.media.map((item) => {
    const existing = localMedia.get(item.id);
    if (existing && existing.sha256 === item.sha256 && existing.serverMediaId && !item.serverMediaId) {
      return { ...item, storageKey: existing.storageKey, serverMediaId: existing.serverMediaId, uploadedAt: existing.uploadedAt, serverDurability: existing.serverDurability ?? null };
    }
    return item;
  });
  const incomingIds = new Set(media.map((item) => item.id));
  const keptLocal = local.media.filter((item) => !incomingIds.has(item.id));
  return {
    action: "replace",
    reason: "backup copy is newer",
    observation: {
      ...candidate,
      serverId: candidate.serverId ?? local.serverId,
      privateLocation: backupIncludesLocation ? candidate.privateLocation : local.privateLocation,
      // Originals only on the device are kept even if that exceeds the capture limit.
      media: [...media, ...keptLocal],
    },
  };
}
