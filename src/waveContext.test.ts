import { describe, expect, it } from "vitest";
import { buildWaveContext } from "../scripts/oc-wave-context.mjs";

describe("shared wave context", () => {
  it("reuses the same hash for materially identical context", () => {
    const a = buildWaveContext({ integrationSha: "abc", architecture: { b: 2, a: 1 }, governance: ["no paid providers"] });
    const b = buildWaveContext({ governance: ["no paid providers"], architecture: { a: 1, b: 2 }, integrationSha: "abc" });
    expect(a.hash).toBe(b.hash);
    expect(a.canonical).toBe(b.canonical);
  });

  it("changes the hash when integration state changes", () => {
    const a = buildWaveContext({ integrationSha: "abc" });
    const b = buildWaveContext({ integrationSha: "def" });
    expect(a.hash).not.toBe(b.hash);
  });
});
