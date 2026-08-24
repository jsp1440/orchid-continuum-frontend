/**
 * A real JPEG carrying real EXIF: a capture date and a GPS position.
 *
 * Built rather than committed so the bytes it asserts on are visible in the
 * diff. A photograph is the one thing a grower uploads that can publish where
 * they live, so the fixture has to actually contain a position — a file with
 * no GPS would let a stripper that does nothing pass.
 */

const LATITUDE = { degrees: 47, minutes: 37, seconds: 13 };   // Seattle-ish
const LONGITUDE = { degrees: 122, minutes: 20, seconds: 2 };
export const CAPTURE_DATE = "2019:06:15 10:30:00";
export const CAPTURE_DAY = "2019-06-15";

/** The literal a stripped file must no longer contain. */
export const GPS_SENTINEL = Buffer.from([0x00, 0x02, 0x00, 0x02]); // GPSLatitudeRef tag body

function tiffEntry(tag: number, type: number, count: number, value: number): Buffer {
  const entry = Buffer.alloc(12);
  entry.writeUInt16LE(tag, 0);
  entry.writeUInt16LE(type, 2);
  entry.writeUInt32LE(count, 4);
  entry.writeUInt32LE(value, 8);
  return entry;
}

function rational(numerator: number, denominator: number): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32LE(numerator, 0);
  buffer.writeUInt32LE(denominator, 4);
  return buffer;
}

function buildExif(): Buffer {
  // Little-endian TIFF. Offsets below are from the start of this header.
  const header = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);

  const dateAscii = Buffer.from(`${CAPTURE_DATE}\0`, "ascii"); // 20 bytes
  // IFD0: 2 entries (DateTime, GPS IFD pointer) + next-IFD offset.
  const ifd0Size = 2 + 2 * 12 + 4;
  const dateOffset = 8 + ifd0Size;
  const gpsIfdOffset = dateOffset + dateAscii.length;

  const ifd0 = Buffer.concat([
    Buffer.from([0x02, 0x00]),
    tiffEntry(0x0132, 2, dateAscii.length, dateOffset),  // DateTime
    tiffEntry(0x8825, 4, 1, gpsIfdOffset),               // GPS IFD pointer
    Buffer.alloc(4),
  ]);

  // GPS IFD: 4 entries + next-IFD offset, then the coordinate rationals.
  const gpsIfdSize = 2 + 4 * 12 + 4;
  const latValuesOffset = gpsIfdOffset + gpsIfdSize;
  const lonValuesOffset = latValuesOffset + 24;

  const gpsIfd = Buffer.concat([
    Buffer.from([0x04, 0x00]),
    tiffEntry(0x0001, 2, 2, 0x0000004e),                 // GPSLatitudeRef "N"
    tiffEntry(0x0002, 5, 3, latValuesOffset),            // GPSLatitude
    tiffEntry(0x0003, 2, 2, 0x00000057),                 // GPSLongitudeRef "W"
    tiffEntry(0x0004, 5, 3, lonValuesOffset),            // GPSLongitude
    Buffer.alloc(4),
  ]);

  const latitude = Buffer.concat([
    rational(LATITUDE.degrees, 1), rational(LATITUDE.minutes, 1), rational(LATITUDE.seconds, 1),
  ]);
  const longitude = Buffer.concat([
    rational(LONGITUDE.degrees, 1), rational(LONGITUDE.minutes, 1), rational(LONGITUDE.seconds, 1),
  ]);

  return Buffer.concat([header, ifd0, dateAscii, gpsIfd, latitude, longitude]);
}

/** A 1×1 grey JPEG — the smallest thing a browser will still decode. */
const BASELINE_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
  "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
  "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

/**
 * The fixture: the baseline JPEG with an EXIF APP1 segment spliced in directly
 * after the SOI marker, which is where a camera puts it.
 */
export function geotaggedJpeg(): Buffer {
  const exif = Buffer.concat([Buffer.from("Exif\0\0", "ascii"), buildExif()]);
  const segment = Buffer.alloc(4);
  segment.writeUInt16BE(0xffe1, 0);
  segment.writeUInt16BE(exif.length + 2, 2);
  return Buffer.concat([
    BASELINE_JPEG.subarray(0, 2),
    segment,
    exif,
    BASELINE_JPEG.subarray(2),
  ]);
}
