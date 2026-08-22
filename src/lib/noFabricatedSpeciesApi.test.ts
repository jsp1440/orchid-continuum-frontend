import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard against re-adding the fabricated species knowledge route.
 *
 * `src/pages/api/knowledge/species/[id].ts` was a Next.js API route in a Vite
 * SPA. It could never execute: `next` is not a dependency, so its import could
 * not resolve, nothing referenced it, and this build has no API-route runtime.
 *
 * That made it harmless only by accident. What it actually returned, for ANY
 * species id, was a fixed payload: 48,221 occurrences, 3,742 images, 186
 * literature records, 12 pollinators, 4 mycorrhizal associations, and an IUCN
 * conservation status of 'LC'. Identical for every organism.
 *
 * Wire a Next.js runtime, or copy the file as a template, and the Continuum
 * starts serving fabricated evidence counts and a fabricated conservation
 * assessment as though they were data.
 */

describe("no fabricated species knowledge API", () => {
  it("has no Next.js API route tree in a Vite SPA", () => {
    expect(existsSync(resolve(process.cwd(), "src/pages/api"))).toBe(false);
  });
});
