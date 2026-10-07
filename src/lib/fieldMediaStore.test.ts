import { describe, expect, it } from "vitest";
import { toMediaDescriptor } from "@/lib/fieldMediaStore";

describe("field media descriptors", () => {
  it("keeps the original filename, size and type without alteration", () => {
    const descriptor = toMediaDescriptor(
      { name: "IMG_2042.HEIC", size: 4_203_111, type: "image/heic" },
      "media-id-1",
      "2026-10-07T08:00:00.000Z",
    );
    expect(descriptor).toEqual({
      id: "media-id-1",
      name: "IMG_2042.HEIC",
      size: 4_203_111,
      type: "image/heic",
      capturedAt: "2026-10-07T08:00:00.000Z",
    });
  });

  it("fills safe defaults for files with no name or type", () => {
    const descriptor = toMediaDescriptor(
      { name: "", size: 0, type: "" },
      "media-id-2",
      "2026-10-07T08:00:00.000Z",
    );
    expect(descriptor.name).toBe("unnamed media");
    expect(descriptor.type).toBe("application/octet-stream");
  });
});
