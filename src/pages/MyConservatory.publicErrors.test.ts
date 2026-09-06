import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/pages/MyConservatory.tsx"), "utf8");

describe("MyConservatory public API error boundary", () => {
  it("keeps collection load and save failures bounded for visitors", () => {
    expect(source).toContain('const PUBLIC_LOAD_ERROR = "Conservatory records are temporarily unavailable. No collection data has been changed."');
    expect(source).toContain('const PUBLIC_SAVE_ERROR = "The plant could not be saved. Your collection has not been changed."');
    expect(source).toContain("setError(PUBLIC_LOAD_ERROR)");
    expect(source).toContain("setError(PUBLIC_SAVE_ERROR)");
    expect(source).not.toContain('setError(reason instanceof Error ? reason.message : "Unable to load plants")');
    expect(source).not.toContain('setError(reason instanceof Error ? reason.message : "The plant could not be saved.")');
    expect(source).not.toContain('setError(reason instanceof Error ? reason.message : "Unable to load plant")');
  });
});
