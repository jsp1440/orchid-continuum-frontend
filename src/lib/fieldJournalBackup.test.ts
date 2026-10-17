import { describe, expect, it } from "vitest";
import { createFieldObservation, sha256Hex, type FieldMedia, type FieldObservation } from "./fieldJournal";
import {
  buildFieldJournalBackup,
  decideFieldJournalRestore,
  FIELD_JOURNAL_BACKUP_SCHEMA,
  parseFieldJournalBackup,
} from "./fieldJournalBackup";
import { buildStoreZip, crc32, readStoreZip } from "./fieldJournalZip";

const NOW = "2026-10-17T15:00:00.000Z";
const LATER = "2026-10-17T16:00:00.000Z";

function bytes(length: number, seed: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(length));
  for (let i = 0; i < length; i += 1) out[i] = (i * 31 + seed) & 0xff;
  return out;
}

async function media(id: string, name: string, type: string, data: Uint8Array<ArrayBuffer>, receipt = false): Promise<FieldMedia> {
  const blob = new Blob([data], { type });
  return {
    id, name, size: blob.size, type, kind: type.startsWith("video/") ? "video" : "photo", blob, capturedAt: NOW,
    sha256: await sha256Hex(blob), storageKey: receipt ? "opaque-key" : null, serverMediaId: receipt ? "srv-media" : null,
    uploadedAt: receipt ? NOW : null,
  };
}

async function observation(id = "draft-1", now = NOW): Promise<FieldObservation> {
  return createFieldObservation({
    accountId: "device-account", note: "Observer note", localityVisibility: "private", habitat: "forest edge",
    privateLocation: { latitude: 12.345678, longitude: -76.54321, accuracyM: 5, elevationM: 900, capturedAt: now, localityNotes: "Restricted access note" },
    media: [
      await media(`${id}-photo`, "flower.JPG", "image/jpeg", bytes(4099, 7)),
      await media(`${id}-video`, "clip.mov", "video/quicktime", bytes(70_001, 3)),
    ],
  }, { id, now });
}

async function manifestOf(blob: Blob) {
  const entries = await readStoreZip(blob, () => true, { maxEntrySize: () => Number.MAX_SAFE_INTEGER });
  return JSON.parse(await entries[0].data.text());
}

describe("Field Journal full-media backup", () => {
  it("uses standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("round-trips every original photo/video byte-for-byte with per-file SHA-256", async () => {
    const source = await observation();
    const { blob, manifest, fileName } = await buildFieldJournalBackup([source], NOW);
    expect(fileName).toMatch(/^orchid-continuum-field-journal-backup-.*\.zip$/);
    expect(manifest).toMatchObject({ schema: FIELD_JOURNAL_BACKUP_SCHEMA, includesMediaBytes: true, mediaCount: 2, observationCount: 1 });
    expect(manifest.observations[0].media.map((item) => item.sha256)).toEqual(source.media.map((item) => item.sha256));

    const parsed = await parseFieldJournalBackup(blob);
    expect(parsed.rejected).toEqual([]);
    expect(parsed.observations).toHaveLength(1);
    const restored = parsed.observations[0];
    for (const [index, item] of restored.media.entries()) {
      const original = new Uint8Array(await source.media[index].blob.arrayBuffer());
      expect(new Uint8Array(await item.blob.arrayBuffer())).toEqual(original);
      expect(await sha256Hex(item.blob)).toBe(source.media[index].sha256);
      expect(item.blob.type).toBe(source.media[index].type);
    }
    expect(restored).toMatchObject({ id: "draft-1", note: "Observer note", habitat: "forest edge", privateLocation: null });
  });

  it("excludes private GPS, locality notes and account identity by default", async () => {
    const { blob } = await buildFieldJournalBackup([await observation()], NOW);
    const text = JSON.stringify(await manifestOf(blob));
    for (const forbidden of ["privateLocation", "latitude", "12.345678", "Restricted access note", "device-account", "accountId"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("includes private GPS only under the explicit private backup mode", async () => {
    const source = await observation();
    const { blob, manifest, fileName } = await buildFieldJournalBackup([source], NOW, "private_backup");
    expect(manifest.includesPrivateCaptureLocation).toBe(true);
    expect(fileName).toContain("with-private-gps");
    const parsed = await parseFieldJournalBackup(blob);
    expect(parsed.observations[0].privateLocation).toEqual(source.privateLocation);
  });

  it("assembles the ZIP from Blob parts and keeps sync receipts", async () => {
    const source = await observation();
    source.serverId = "fo-1";
    source.syncStatus = "synchronized";
    source.media[0] = await media("receipted", "a.jpg", "image/jpeg", bytes(10, 1), true);
    const { blob } = await buildFieldJournalBackup([source], NOW);
    const parsed = await parseFieldJournalBackup(blob);
    expect(parsed.observations[0]).toMatchObject({ serverId: "fo-1", syncStatus: "synchronized" });
    expect(parsed.observations[0].media[0]).toMatchObject({ serverMediaId: "srv-media", storageKey: "opaque-key", uploadedAt: NOW });
  });

  it("stops rather than back up an original that no longer matches its recorded hash", async () => {
    const source = await observation();
    source.media[0] = { ...source.media[0], sha256: "0".repeat(64) };
    await expect(buildFieldJournalBackup([source], NOW)).rejects.toThrow("no longer matches its recorded SHA-256");
  });

  it("rejects an observation whose media bytes fail CRC-32 and restores the rest", async () => {
    const { blob, manifest } = await buildFieldJournalBackup([await observation("a"), await observation("b")], NOW);
    const raw = new Uint8Array(await blob.arrayBuffer());
    // Corrupt one byte inside the first media file of observation "a".
    const path = new TextEncoder().encode(manifest.observations[0].media[0].path);
    let at = -1;
    for (let i = 0; i < raw.length - path.length; i += 1) {
      if (raw[i] === 0x50 && raw[i + 1] === 0x4b && raw[i + 2] === 3 && path.every((b, j) => raw[i + 30 + j] === b)) { at = i + 30 + path.length + 5; break; }
    }
    expect(at).toBeGreaterThan(0);
    raw[at] ^= 0xff;
    const parsed = await parseFieldJournalBackup(new Blob([raw]));
    expect(parsed.observations.map((item) => item.id)).toEqual(["b"]);
    expect(parsed.rejected).toEqual([{ id: "a", reason: expect.stringContaining("CRC-32") }]);
  });

  it("rejects media whose bytes do not match the manifest SHA-256", async () => {
    const { blob } = await buildFieldJournalBackup([await observation()], NOW);
    const manifest = await manifestOf(blob);
    const entries = await readStoreZip(blob, () => true, { maxEntrySize: () => Number.MAX_SAFE_INTEGER });
    manifest.observations[0].media[1].sha256 = "f".repeat(64);
    const tampered = await buildStoreZip([
      { name: "manifest.json", data: new Blob([JSON.stringify(manifest)]) },
      ...entries.slice(1).map((entry) => ({ name: entry.name, data: entry.data })),
    ], NOW);
    const parsed = await parseFieldJournalBackup(tampered);
    expect(parsed.observations).toEqual([]);
    expect(parsed.rejected[0].reason).toContain("SHA-256");
  });

  it("refuses foreign or malformed archives", async () => {
    const manifestOnly = (value: unknown) => buildStoreZip([{ name: "manifest.json", data: new Blob([JSON.stringify(value)]) }], NOW);
    await expect(parseFieldJournalBackup(new Blob(["not a zip"]))).rejects.toThrow("Restore refused");
    await expect(parseFieldJournalBackup(await manifestOnly({ schema: "something-else" }))).rejects.toThrow("not a supported");
    await expect(parseFieldJournalBackup(await buildStoreZip([{ name: "../evil", data: new Blob(["x"]) }], NOW))).rejects.toThrow("unexpected file");
    const { blob } = await buildFieldJournalBackup([await observation()], NOW);
    const entries = await readStoreZip(blob, () => true, { maxEntrySize: () => Number.MAX_SAFE_INTEGER });
    const extra = await buildStoreZip([...entries.map((entry) => ({ name: entry.name, data: entry.data })), { name: "media/9/9.jpg", data: new Blob(["x"]) }], NOW);
    await expect(parseFieldJournalBackup(extra)).rejects.toThrow("not listed in its manifest");
    // A deflate-compressed entry (method 8) is refused.
    const raw = new Uint8Array(await blob.arrayBuffer());
    raw[8] = 8;
    await expect(parseFieldJournalBackup(new Blob([raw]))).rejects.toThrow("Restore refused");
  });

  it("refuses a default-mode backup that smuggles private location", async () => {
    const { blob } = await buildFieldJournalBackup([await observation()], NOW);
    const manifest = await manifestOf(blob);
    const entries = await readStoreZip(blob, () => true, { maxEntrySize: () => Number.MAX_SAFE_INTEGER });
    manifest.observations[0].privateLocation = { latitude: 1, longitude: 1 };
    const tampered = await buildStoreZip([
      { name: "manifest.json", data: new Blob([JSON.stringify(manifest)]) },
      ...entries.slice(1).map((entry) => ({ name: entry.name, data: entry.data })),
    ], NOW);
    const parsed = await parseFieldJournalBackup(tampered);
    expect(parsed.rejected[0].reason).toContain("private location");
  });

  it("restores an interrupted sync as retryable with receipts preserved", async () => {
    const source = await observation();
    source.serverId = "fo-9";
    source.syncStatus = "syncing";
    const parsed = await parseFieldJournalBackup((await buildFieldJournalBackup([source], NOW)).blob);
    expect(parsed.observations[0]).toMatchObject({ syncStatus: "failed", serverId: "fo-9" });
  });
});

describe("Field Journal restore merge rule", () => {
  const strip = ({ accountId: _a, ...rest }: FieldObservation) => rest;

  it("inserts a new record for the current account", async () => {
    const decision = decideFieldJournalRestore(null, strip(await observation()), "restoring-account", false);
    expect(decision.action).toBe("insert");
    if (decision.action === "insert") expect(decision.observation.accountId).toBe("restoring-account");
  });

  it("keeps the device copy when it is the same or newer", async () => {
    const local = await observation("x", LATER);
    const incoming = strip(await observation("x", NOW));
    expect(decideFieldJournalRestore(local, incoming, "device-account", false).action).toBe("skip");
    expect(decideFieldJournalRestore(local, strip(local), "device-account", false).action).toBe("skip");
  });

  it("replaces an older device copy without dropping local originals, receipts or excluded GPS", async () => {
    const local = await observation("x", NOW);
    local.media[0] = { ...local.media[0], storageKey: "k", serverMediaId: "m", uploadedAt: NOW };
    const localOnly = await media("local-only", "extra.jpg", "image/jpeg", bytes(5, 9));
    local.media.push(localOnly);
    const incoming = { ...strip(await observation("x", LATER)), privateLocation: null, note: "Newer note" };
    incoming.media = [{ ...local.media[0], serverMediaId: null, storageKey: null, uploadedAt: null }];
    const decision = decideFieldJournalRestore(local, incoming, "device-account", false);
    expect(decision.action).toBe("replace");
    if (decision.action !== "replace") return;
    expect(decision.observation.note).toBe("Newer note");
    expect(decision.observation.privateLocation).toEqual(local.privateLocation);
    expect(decision.observation.media[0]).toMatchObject({ serverMediaId: "m", storageKey: "k" });
    expect(decision.observation.media.map((item) => item.id)).toContain("local-only");
  });

  it("never downgrades a server-accepted record or crosses accounts", async () => {
    const local = await observation("x", NOW);
    local.serverId = "fo-1";
    local.syncStatus = "synchronized";
    const newerUnsynced = strip(await observation("x", LATER));
    expect(decideFieldJournalRestore(local, newerUnsynced, "device-account", false)).toMatchObject({ action: "skip" });
    expect(decideFieldJournalRestore(local, { ...newerUnsynced, serverId: "fo-2" }, "device-account", false)).toMatchObject({ action: "reject" });
    expect(decideFieldJournalRestore(local, newerUnsynced, "someone-else", false)).toMatchObject({ action: "reject" });
    expect(decideFieldJournalRestore({ ...local, syncStatus: "syncing" }, newerUnsynced, "device-account", false)).toMatchObject({ action: "skip" });
  });
});
