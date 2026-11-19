import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FIELD_MEDIA_EXIF_UPLOAD_NOTICE,
  FIELD_MEDIA_UPLOAD_MAX_BYTES,
  validateFieldMediaFile,
} from "./fieldJournal";

// The backend (app/field_observation/routes.py DEFAULT_FIELD_MEDIA_MAX_BYTES) answers 413
// "The media file exceeds FIELD_MEDIA_MAX_BYTES" above 200 MiB. Without a device-side check
// the oversized original is saved, the server observation is accepted, the upload then fails
// forever, and an accepted record cannot be edited to remove the file.
describe("Field Journal media intake limit", () => {
  it("matches the backend default of 200 MiB", () => {
    expect(FIELD_MEDIA_UPLOAD_MAX_BYTES).toBe(200 * 1024 * 1024);
  });

  it("accepts photos and video up to the limit", () => {
    expect(validateFieldMediaFile({ name: "a.jpg", type: "image/jpeg", size: 1234 })).toBe("photo");
    expect(validateFieldMediaFile({ name: "b.mov", type: "video/quicktime", size: FIELD_MEDIA_UPLOAD_MAX_BYTES })).toBe("video");
  });

  it("rejects an original over the limit with a plain-language message naming the file", () => {
    expect(() => validateFieldMediaFile({ name: "long-clip.mp4", type: "video/mp4", size: FIELD_MEDIA_UPLOAD_MAX_BYTES + 1 }))
      .toThrow(/long-clip\.mp4.*200 MB/);
    expect(() => validateFieldMediaFile({ name: "long-clip.mp4", type: "video/mp4", size: FIELD_MEDIA_UPLOAD_MAX_BYTES + 1 }))
      .not.toThrow(/FIELD_MEDIA_MAX_BYTES/);
  });

  it("rejects empty files and non-media types", () => {
    expect(() => validateFieldMediaFile({ name: "empty.jpg", type: "image/jpeg", size: 0 })).toThrow(/empty/i);
    expect(() => validateFieldMediaFile({ name: "notes.txt", type: "text/plain", size: 10 })).toThrow(/image or video/i);
  });
});

// Verified in a browser against a synthetic geotagged JPEG: the original bytes, EXIF GPS
// included, are uploaded unchanged on sync. The page must not claim the backend never
// receives exact coordinates.
describe("Field Journal original-media location disclosure", () => {
  const page = readFileSync("src/pages/CalyxField.tsx", "utf8");

  it("states that originals are uploaded unchanged and may carry embedded GPS", () => {
    expect(FIELD_MEDIA_EXIF_UPLOAD_NOTICE).toMatch(/uploaded unchanged/i);
    expect(FIELD_MEDIA_EXIF_UPLOAD_NOTICE).toMatch(/EXIF/);
    expect(FIELD_MEDIA_EXIF_UPLOAD_NOTICE).toMatch(/GPS/);
    expect(FIELD_MEDIA_EXIF_UPLOAD_NOTICE).toMatch(/private/i);
  });

  it("shows the notice at the photo picker and uses the shared intake validator", () => {
    expect(page).toContain("FIELD_MEDIA_EXIF_UPLOAD_NOTICE");
    expect(page).toContain("validateFieldMediaFile");
  });

  it("no longer makes the unqualified never-exact-coordinates claims", () => {
    expect(page).not.toContain("never exact coordinates in this MVP");
    expect(page).not.toContain("exact coordinates and locality notes are not uploaded by this MVP");
  });
});
