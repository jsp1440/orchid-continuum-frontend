import { describe, expect, it } from "vitest";

import {
  DISPLAY_POLICIES,
  LIMITED_PREVIEW_CHARS,
  describeWithheld,
  readDisplayPolicy,
  releaseText,
  type DisplayPolicy,
} from "./literatureDisplayPolicy";

/**
 * The gate that decides whether somebody else's words appear on our page.
 *
 * Every test here is a way the gate could fail open. The one that matters most
 * is the absent binding: most papers in a young corpus have none, so a default
 * of "no binding means no restriction" would release nearly the whole corpus.
 */

const TEXT = "Seasonal dormancy was observed in every cultivated accession under study.";

function binding(policy: string, internal = false) {
  return { display_policy: policy, internal_use_permission: internal };
}

describe("the gate fails closed", () => {
  it("withholds when there is no binding at all", () => {
    const release = releaseText(TEXT, null);
    expect(release.released).toBe(false);
    if (release.released) throw new Error("unreachable");
    expect(release.reason).toBe("no-binding");
  });

  it("withholds when the binding is undefined rather than null", () => {
    const release = releaseText(TEXT, undefined);
    expect(release.released).toBe(false);
  });

  it("withholds a policy string it does not recognise, rather than defaulting open", () => {
    const release = releaseText(TEXT, binding("FULL_TEXT_ALLOWED_PENDING"));
    expect(release.released).toBe(false);
    if (release.released) throw new Error("unreachable");
    expect(release.reason).toBe("unrecognised-policy");
  });

  it("withholds when the policy is not a string", () => {
    expect(releaseText(TEXT, { display_policy: 1 }).released).toBe(false);
    expect(releaseText(TEXT, { display_policy: null }).released).toBe(false);
    expect(releaseText(TEXT, {}).released).toBe(false);
  });

  it("releases nothing under any policy that is not an explicit grant", () => {
    // Enumerated from the vocabulary so a policy added later cannot silently
    // land in the permissive branch without a test noticing.
    const granting: DisplayPolicy[] = [
      "FULL_TEXT_ALLOWED",
      "INTERNAL_RESEARCH_ONLY",
      "LIMITED_PREVIEW_ONLY",
    ];
    for (const policy of DISPLAY_POLICIES) {
      const release = releaseText(TEXT, binding(policy, true));
      expect(release.released).toBe(granting.includes(policy));
    }
  });
});

describe("each policy releases exactly what it permits", () => {
  it("releases the whole text under FULL_TEXT_ALLOWED", () => {
    const release = releaseText(TEXT, binding("FULL_TEXT_ALLOWED"));
    expect(release).toMatchObject({ released: true, text: TEXT, truncated: false });
  });

  it("truncates to the engine's preview length under LIMITED_PREVIEW_ONLY", () => {
    const long = "x".repeat(LIMITED_PREVIEW_CHARS + 40);
    const release = releaseText(long, binding("LIMITED_PREVIEW_ONLY"));
    if (!release.released) throw new Error("expected a release");
    expect(release.text).toHaveLength(LIMITED_PREVIEW_CHARS);
    expect(release.truncated).toBe(true);
  });

  it("does not mark a short preview as truncated", () => {
    const release = releaseText("short", binding("LIMITED_PREVIEW_ONLY"));
    if (!release.released) throw new Error("expected a release");
    expect(release.truncated).toBe(false);
    expect(release.text).toBe("short");
  });

  it("withholds INTERNAL_RESEARCH_ONLY without the internal-use permission", () => {
    const release = releaseText(TEXT, binding("INTERNAL_RESEARCH_ONLY", false));
    expect(release.released).toBe(false);
    if (release.released) throw new Error("unreachable");
    expect(release.reason).toBe("internal-permission-absent");
  });

  it("releases INTERNAL_RESEARCH_ONLY with it", () => {
    expect(releaseText(TEXT, binding("INTERNAL_RESEARCH_ONLY", true)).released).toBe(true);
  });

  it("treats a truthy non-true permission as no permission", () => {
    // A grant is a boolean the backend set, not any value that survives a cast.
    for (const value of ["true", 1, {}, []]) {
      const release = releaseText(TEXT, {
        display_policy: "INTERNAL_RESEARCH_ONLY",
        internal_use_permission: value,
      });
      expect(release.released).toBe(false);
    }
  });
});

describe("withheld is never absent", () => {
  it("reports permitted-but-empty text as absent, not as a refusal", () => {
    const release = releaseText("", binding("FULL_TEXT_ALLOWED"));
    expect(release.released).toBe(false);
    if (release.released) throw new Error("unreachable");
    expect(release.reason).toBe("absent");
  });

  it("does not leak that text is empty for a source it may not read", () => {
    // A reader must not be able to distinguish "no methods section" from
    // "methods section withheld" for a restricted source, so the policy is
    // checked before the text is looked at.
    const withText = releaseText(TEXT, binding("METADATA_ONLY"));
    const withoutText = releaseText("", binding("METADATA_ONLY"));
    expect(withText).toEqual(withoutText);
  });

  it("gives every refusal a distinct, non-empty sentence", () => {
    const reasons = [
      "no-binding",
      "metadata-only",
      "requires-review",
      "internal-permission-absent",
      "unrecognised-policy",
      "absent",
    ] as const;
    const sentences = reasons.map(describeWithheld);
    expect(new Set(sentences).size).toBe(reasons.length);
    for (const sentence of sentences) expect(sentence.length).toBeGreaterThan(20);
  });

  it("says an unrecorded permission is not an unrestricted one", () => {
    expect(describeWithheld("no-binding")).toMatch(/not an unrestricted one/i);
  });
});

describe("readDisplayPolicy", () => {
  it("accepts every policy in the vocabulary and nothing else", () => {
    for (const policy of DISPLAY_POLICIES) {
      expect(readDisplayPolicy({ display_policy: policy })).toBe(policy);
    }
    expect(readDisplayPolicy({ display_policy: "full_text_allowed" })).toBeNull();
    expect(readDisplayPolicy(null)).toBeNull();
  });
});
