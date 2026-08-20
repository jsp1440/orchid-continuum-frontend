import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(resolve(process.cwd(), "src/components/calyx/ScientificSynthesis.tsx"), "utf8");

describe("Calyx scientific synthesis", () => {
  it("surfaces bounded conclusions, claim IDs, confidence, and partial status", () => {
    expect(SOURCE).toContain("Scientific synthesis");
    expect(SOURCE).toContain("mission.conclusions");
    expect(SOURCE).toContain("Associated claim IDs");
    expect(SOURCE).toContain("Mission confidence");
    expect(SOURCE).toContain("mission.partial");
    expect(SOURCE).toContain("Partial result");
  });

  it("keeps synthesis explicitly bounded away from evidence and provenance", () => {
    expect(SOURCE).toContain("bounded to the evidence retrieved for this mission");
    expect(SOURCE).toContain("Evidence and provenance remain separate below");
  });
});
