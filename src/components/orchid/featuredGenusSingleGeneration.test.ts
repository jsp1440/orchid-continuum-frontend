import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * One featured-genus component, not five.
 *
 * The tree carried DailyGenusFeatureV2, V3, V4 and V5 alongside the live
 * DailyGenusFeatureContinuum — 1,662 lines that nothing mounted. Runtime truth
 * at the time of removal:
 *
 *   AppLayout -> DailyGenusFeature (a one-line re-export) -> ...Continuum   LIVE
 *   V5 -> V3                                                                dead pair
 *   V2, V4                                                                  no referrers
 *
 * V4 also left two artefacts that outlived it. `index.html` injected
 * `var source = null` into every production page, and a `.d.ts` declared
 * `const source: ImageSource` **globally** — which meant any file referencing a
 * bare `source` typechecked against that declaration instead of failing. A
 * compatibility shim for deleted code is worse than the code: it is invisible
 * and it weakens checking everywhere.
 */

const ROOT = process.cwd();

describe("featured genus has a single generation", () => {
  it("keeps no numbered DailyGenusFeature generation in the tree", () => {
    const survivors = ["V1", "V2", "V3", "V4", "V5", "V6"].filter((suffix) =>
      existsSync(resolve(ROOT, `src/components/orchid/DailyGenusFeature${suffix}.tsx`)),
    );
    expect(
      survivors,
      `numbered featured-genus generations are back: ${survivors.join(", ")}`,
    ).toEqual([]);
  });

  it("still mounts the canonical Continuum component", () => {
    // The deletion must not have taken the live path with it.
    const entrypoint = readFileSync(
      resolve(ROOT, "src/components/orchid/DailyGenusFeature.tsx"),
      "utf8",
    );
    expect(entrypoint).toContain("./DailyGenusFeatureContinuum");
    expect(existsSync(resolve(ROOT, "src/components/orchid/DailyGenusFeatureContinuum.tsx"))).toBe(
      true,
    );
  });

  it("ships no global `source` shim to the production page", () => {
    const html = readFileSync(resolve(ROOT, "index.html"), "utf8");
    expect(html).not.toMatch(/var\s+source\s*=/);
    expect(html).not.toContain("BUILD 209C");
  });

  it("declares no global `source` binding that would mask real type errors", () => {
    expect(existsSync(resolve(ROOT, "src/types/build209c-genus-image-compat.d.ts"))).toBe(false);
  });
});
