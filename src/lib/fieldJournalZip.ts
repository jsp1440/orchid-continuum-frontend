// Minimal, dependency-free STORE (uncompressed) ZIP writer and strict reader
// for Field Journal backups. Original media bytes are never re-encoded: each
// entry body is the original Blob, referenced as a Blob part so large iPad
// videos are not copied into one giant ArrayBuffer.

const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const UTF8_NAME_FLAG = 0x0800;
const ZIP32_LIMIT = 0xffffffff;
const CRC_CHUNK_BYTES = 8 * 1024 * 1024;

export const FIELD_ZIP_MAX_ENTRIES = 10_001;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32Update(crc: number, bytes: Uint8Array): number {
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

export function crc32(bytes: Uint8Array): number {
  return crc32Update(0, bytes);
}

export async function crc32Blob(blob: Blob): Promise<number> {
  let crc = 0;
  for (let offset = 0; offset < blob.size; offset += CRC_CHUNK_BYTES) {
    crc = crc32Update(crc, new Uint8Array(await blob.slice(offset, offset + CRC_CHUNK_BYTES).arrayBuffer()));
  }
  return crc;
}

export class FieldZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FieldZipError";
  }
}

export type FieldZipInput = { name: string; data: Blob; crc32?: number };
export type FieldZipEntry = { name: string; offset: number; size: number; crc32: number; data: Blob };

function dosDateTime(iso: string): { time: number; date: number } {
  const date = new Date(iso);
  const valid = !Number.isNaN(date.getTime()) && date.getUTCFullYear() >= 1980;
  const d = valid ? date : new Date(Date.UTC(1980, 0, 1));
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    date: ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

const encoder = new TextEncoder();

/** Build an uncompressed ZIP as Blob parts; entry bodies are the original Blobs. */
export async function buildStoreZip(entries: readonly FieldZipInput[], modifiedAt: string): Promise<Blob> {
  if (entries.length > FIELD_ZIP_MAX_ENTRIES) throw new FieldZipError("Too many files for one Field Journal backup.");
  const { time, date } = dosDateTime(modifiedAt);
  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  const seen = new Set<string>();
  let offset = 0;
  for (const entry of entries) {
    if (seen.has(entry.name)) throw new FieldZipError(`Duplicate backup entry ${entry.name}.`);
    seen.add(entry.name);
    const name = encoder.encode(entry.name);
    const size = entry.data.size;
    if (size >= ZIP32_LIMIT || offset + 30 + name.length + size >= ZIP32_LIMIT) {
      throw new FieldZipError("This backup would exceed 4 GB. Back up fewer observations at a time.");
    }
    const crc = entry.crc32 ?? await crc32Blob(entry.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, LOCAL_FILE_HEADER, true);
    local.setUint16(4, 10, true);
    local.setUint16(6, UTF8_NAME_FLAG, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(local.buffer, name, entry.data);

    const header = new DataView(new ArrayBuffer(46));
    header.setUint32(0, CENTRAL_DIRECTORY_HEADER, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 10, true);
    header.setUint16(8, UTF8_NAME_FLAG, true);
    header.setUint16(10, 0, true);
    header.setUint16(12, time, true);
    header.setUint16(14, date, true);
    header.setUint32(16, crc, true);
    header.setUint32(20, size, true);
    header.setUint32(24, size, true);
    header.setUint16(28, name.length, true);
    header.setUint32(42, offset, true);
    const record = new Uint8Array(new ArrayBuffer(46 + name.length));
    record.set(new Uint8Array(header.buffer), 0);
    record.set(name, 46);
    central.push(record);
    offset += 30 + name.length + size;
  }
  const centralSize = central.reduce((total, record) => total + record.length, 0);
  if (offset + centralSize + 22 >= ZIP32_LIMIT) {
    throw new FieldZipError("This backup would exceed 4 GB. Back up fewer observations at a time.");
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, END_OF_CENTRAL_DIRECTORY, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: "application/zip" });
}

async function readView(blob: Blob, start: number, length: number): Promise<DataView> {
  if (start < 0 || start + length > blob.size) throw new FieldZipError("The backup file is truncated.");
  return new DataView(await blob.slice(start, start + length).arrayBuffer());
}

/**
 * Strictly read a ZIP produced by buildStoreZip. Only STORE entries without
 * encryption, data descriptors, ZIP64, comments, extra fields or overlapping
 * ranges are accepted. Entry bodies are returned as lazy Blob slices; callers
 * verify each CRC with verifyZipEntry before trusting the bytes.
 */
export async function readStoreZip(
  file: Blob,
  allowName: (name: string) => boolean,
  limits: { maxEntrySize: (name: string) => number },
): Promise<FieldZipEntry[]> {
  if (file.size < 22 || file.size >= ZIP32_LIMIT) throw new FieldZipError("This is not a Field Journal backup file.");
  const end = await readView(file, file.size - 22, 22);
  if (end.getUint32(0, true) !== END_OF_CENTRAL_DIRECTORY || end.getUint16(20, true) !== 0) {
    throw new FieldZipError("This is not a Field Journal backup file.");
  }
  if (end.getUint16(4, true) !== 0 || end.getUint16(6, true) !== 0) throw new FieldZipError("Multi-part archives are not supported.");
  const count = end.getUint16(8, true);
  if (count !== end.getUint16(10, true) || count === 0 || count > FIELD_ZIP_MAX_ENTRIES) {
    throw new FieldZipError("The backup has an unsupported number of files.");
  }
  const centralSize = end.getUint32(12, true);
  const centralOffset = end.getUint32(16, true);
  if (centralOffset + centralSize !== file.size - 22) throw new FieldZipError("The backup file layout is not recognised.");
  const directory = await readView(file, centralOffset, centralSize);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const entries: FieldZipEntry[] = [];
  const names = new Set<string>();
  let cursor = 0;
  let expectedOffset = 0;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > centralSize || directory.getUint32(cursor, true) !== CENTRAL_DIRECTORY_HEADER) {
      throw new FieldZipError("The backup directory is damaged.");
    }
    const flags = directory.getUint16(cursor + 8, true);
    const method = directory.getUint16(cursor + 10, true);
    const crc = directory.getUint32(cursor + 16, true);
    const compressed = directory.getUint32(cursor + 20, true);
    const size = directory.getUint32(cursor + 24, true);
    const nameLength = directory.getUint16(cursor + 28, true);
    const extraLength = directory.getUint16(cursor + 30, true);
    const commentLength = directory.getUint16(cursor + 32, true);
    const disk = directory.getUint16(cursor + 34, true);
    const offset = directory.getUint32(cursor + 42, true);
    if ((flags & ~UTF8_NAME_FLAG) !== 0 || method !== 0 || compressed !== size || extraLength || commentLength || disk) {
      throw new FieldZipError("The backup contains compressed, encrypted or unsupported entries.");
    }
    if (cursor + 46 + nameLength > centralSize || nameLength === 0) throw new FieldZipError("The backup directory is damaged.");
    let name: string;
    try {
      name = decoder.decode(new Uint8Array(directory.buffer, directory.byteOffset + cursor + 46, nameLength));
    } catch {
      throw new FieldZipError("The backup contains an invalid file name.");
    }
    if (!allowName(name) || names.has(name)) throw new FieldZipError(`The backup contains an unexpected file (${name.slice(0, 80)}).`);
    if (size > limits.maxEntrySize(name)) throw new FieldZipError(`A file in the backup is larger than allowed (${name.slice(0, 80)}).`);
    names.add(name);
    // Entries must be contiguous and in order, exactly as the writer produces.
    if (offset !== expectedOffset) throw new FieldZipError("The backup file layout is not recognised.");
    const local = await readView(file, offset, 30);
    const localNameLength = local.getUint16(26, true);
    if (local.getUint32(0, true) !== LOCAL_FILE_HEADER || local.getUint16(6, true) !== flags ||
        local.getUint16(8, true) !== 0 || local.getUint32(14, true) !== crc || local.getUint32(18, true) !== size ||
        local.getUint32(22, true) !== size || localNameLength !== nameLength || local.getUint16(28, true) !== 0) {
      throw new FieldZipError("The backup file headers do not match.");
    }
    const localName = new Uint8Array(await file.slice(offset + 30, offset + 30 + nameLength).arrayBuffer());
    const centralName = new Uint8Array(directory.buffer, directory.byteOffset + cursor + 46, nameLength);
    if (localName.some((byte, i) => byte !== centralName[i])) throw new FieldZipError("The backup file headers do not match.");
    const dataStart = offset + 30 + nameLength;
    if (dataStart + size > centralOffset) throw new FieldZipError("The backup file is truncated.");
    entries.push({ name, offset: dataStart, size, crc32: crc, data: file.slice(dataStart, dataStart + size) });
    expectedOffset = dataStart + size;
    cursor += 46 + nameLength;
  }
  if (cursor !== centralSize || expectedOffset !== centralOffset) throw new FieldZipError("The backup file layout is not recognised.");
  return entries;
}
