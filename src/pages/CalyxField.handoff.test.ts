// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { hypothesisLoopHref } from "./CalyxField";

describe("Field Journal → Deception Lab handoff link", () => {
  it("carries only the opaque draft id and taxon label into the workspace tab", () => {
    const href = hypothesisLoopHref({ id: "field-journal-draft:abc", taxonLabel: "Ophrys apifera" });
    const url = new URL(href, "https://example.test");
    expect(url.pathname).toBe("/deception-lab");
    expect(url.searchParams.get("tab")).toBe("workspace");
    expect(url.searchParams.get("observation")).toBe("field-journal-draft:abc");
    expect(url.searchParams.get("taxon")).toBe("Ophrys apifera");
    expect(Array.from(url.searchParams.keys()).sort()).toEqual(["observation", "tab", "taxon"]);
  });

  it("omits the taxon parameter for unidentified drafts and never adds locality fields", () => {
    const href = hypothesisLoopHref({ id: "draft-2", taxonLabel: null });
    const url = new URL(href, "https://example.test");
    expect(url.searchParams.has("taxon")).toBe(false);
    for (const key of ["lat", "lng", "locality", "localityVisibility", "note", "media"]) {
      expect(url.searchParams.has(key)).toBe(false);
    }
  });
});
