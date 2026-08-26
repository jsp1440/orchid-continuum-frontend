import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The type checker's `lib` must describe the runtime the app actually ships to.
 *
 * `tsconfig.app.json` declared `lib: ES2020` while ~29 call sites across Matrix,
 * Lexicon, University, Conservatory and Calyx already used `String.replaceAll`,
 * an ES2021 method. Every one of them reported `error TS2550` even though the
 * code was correct and shipped fine — Vite's default build matrix
 * (es2020, edge88, firefox78, chrome87, safari14) supports `replaceAll`
 * everywhere, since it landed in Chrome 85, Firefox 77 and Safari 13.1.
 *
 * Twenty-nine standing errors is how a typecheck signal stops being read at all.
 * Pin the setting so a later tidy-up back to ES2020 fails here, loudly, instead
 * of quietly restoring the noise.
 */

const APP_TSCONFIG = readFileSync(resolve(process.cwd(), "tsconfig.app.json"), "utf8");

/** Strips the JSONC comments TypeScript allows but JSON.parse does not. */
function parseTsconfig(source: string): { compilerOptions: { lib: string[]; target: string } } {
  const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const withoutLineComments = withoutBlockComments.replace(/^\s*\/\/.*$/gm, "");
  return JSON.parse(withoutLineComments);
}

describe("typecheck lib contract", () => {
  it("declares a lib that covers the ES2021 methods the codebase already uses", () => {
    const config = parseTsconfig(APP_TSCONFIG);
    const lib = config.compilerOptions.lib.map((entry) => entry.toUpperCase());

    expect(lib).toContain("ES2021");
    expect(lib).not.toContain("ES2020");

    // DOM libs must survive the bump — dropping them would trade 29 errors for
    // several hundred.
    expect(lib).toContain("DOM");
    expect(lib).toContain("DOM.ITERABLE");
  });

  it("keeps emit target separate from the lib bump", () => {
    // `noEmit` is set and Vite/esbuild owns transpilation, so `target` governs
    // nothing that ships. Leave it where it is: raising it here would imply a
    // downlevel-emit change this repo does not actually perform.
    const config = parseTsconfig(APP_TSCONFIG);
    expect(config.compilerOptions.target).toBe("ES2020");
  });
});
