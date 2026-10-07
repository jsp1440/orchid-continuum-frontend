import { describe, expect, it } from "vitest";
import { createFieldDraft, type FieldDraft } from "@/lib/fieldDrafts";
import { toAtlasOccurrencePreview, toAtlasOccurrencePreviews } from "@/lib/fieldAtlas";

const NOW = "2026-10-07T08:00:00.000Z";
const precise = { latitude: -13.123456, longitude: -72.654321, accuracyMeters: 5, elevationMeters: 2890 };

function makeDraft(overrides: Partial<Parameters<typeof createFieldDraft>[0]> = {}): FieldDraft {
  return createFieldDraft(
    { note: "Observed at trail edge.", localityVisibility: "private", coordinates: precise, ...overrides },
    { id: "draft-atlas", now: NOW },
  );
}

describe("Atlas projection respects locality protection", () => {
  it("withholds private and research-restricted records entirely", () => {
    expect(toAtlasOccurrencePreview(makeDraft())).toBeNull();
    expect(toAtlasOccurrencePreview(makeDraft({ localityVisibility: "research_restricted" }))).toBeNull();
  });

  it("projects public records with coarsened coordinates only", () => {
    const preview = toAtlasOccurrencePreview(makeDraft({ localityVisibility: "public" }));
    expect(preview).not.toBeNull();
    expect(preview?.latitude).toBe(-13.1);
    expect(preview?.longitude).toBe(-72.7);
    expect(preview?.coordinatePrecision).toBe("coarsened_0.1deg");
    expect(preview).not.toHaveProperty("elevationMeters");
    expect(preview?.scientificStatus).toBe("observer_report");
  });

  it("carries a canonical name only when taxonomy was matched — never the tentative label", () => {
    const unidentified = toAtlasOccurrencePreview(makeDraft({ localityVisibility: "public", taxonLabel: "Phrag. something" }));
    expect(unidentified?.canonicalName).toBeNull();

    const matched = makeDraft({ localityVisibility: "public" });
    matched.taxonomyMatch = { taxonomyId: "tax-1", canonicalName: "Phragmipedium kovachii", matchedAt: NOW };
    const preview = toAtlasOccurrencePreview(matched);
    expect(preview?.canonicalName).toBe("Phragmipedium kovachii");
    expect(preview?.taxonomyId).toBe("tax-1");
  });

  it("prefers the backend observation id as the record reference once synced", () => {
    const draft = makeDraft({ localityVisibility: "public" });
    expect(toAtlasOccurrencePreview(draft)?.observationRef).toBe("draft-atlas");
    draft.backendObservationId = "fo-xyz";
    expect(toAtlasOccurrencePreview(draft)?.observationRef).toBe("fo-xyz");
  });

  it("withholds public records that have no usable fix at all", () => {
    const draft = makeDraft({ localityVisibility: "public", coordinates: null });
    expect(toAtlasOccurrencePreview(draft)).toBeNull();
  });

  it("list projection drops every protected record", () => {
    const drafts = [
      makeDraft({ localityVisibility: "public" }),
      makeDraft(),
      makeDraft({ localityVisibility: "research_restricted" }),
    ];
    const previews = toAtlasOccurrencePreviews(drafts);
    expect(previews).toHaveLength(1);
    expect(previews[0].localityVisibility).toBe("public");
  });
});
