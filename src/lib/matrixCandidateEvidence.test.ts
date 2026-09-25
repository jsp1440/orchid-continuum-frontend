/**
 * Matrix ranking evidence, checked against payloads the backend really
 * produces.
 *
 * `__fixtures__/matrixIdentification.realBackend.json` was captured verbatim
 * from orchid-calyx-backend main (73626917) through FastAPI TestClient against
 * `app.main`: POST /sessions, /evaluate before and after four observations
 * (a partial multi-state match, a probable numeric range, an uncertain state
 * one candidate has no record for, and an unknown), then /explain. Meeting it
 * found that the page dropped every basis for a rank — observed vs recorded
 * state, contribution, compared/possible weight and candidate provenance — and
 * rendered an uncompared candidate as "0% match".
 */

import { describe, expect, it } from "vitest";

import realBackend from "./__fixtures__/matrixIdentification.realBackend.json";
import {
  candidateRankState,
  characterStatusLabel,
  explanationCandidates,
  explanationProvenance,
  formatMatrixValue,
  groupCharacterEvidence,
  provenanceEntries,
  scoreBasis,
} from "./matrixCandidateEvidence";
import { explanationText, type CalyxExplanation, type SessionEvaluation } from "./matrixIdentification";

const empty = realBackend.evaluate_empty as unknown as SessionEvaluation;
const observed = realBackend.evaluate_observed as unknown as SessionEvaluation;
const explain = realBackend.explain_comparison as unknown as CalyxExplanation;

describe("captured evaluate payload before any observation", () => {
  it("marks every candidate not compared rather than a 0% match", () => {
    expect(empty.report.candidates).toHaveLength(2);
    for (const candidate of empty.report.candidates) {
      expect(candidate.score).toBe(0);
      expect(candidateRankState(candidate)).toBe("not_compared");
    }
  });

  it("carries the next observation the Matrix selected", () => {
    expect(empty.next_observation?.character).toBe("spur_length_mm");
    expect(empty.next_observation?.reason_code).toBe("highest_deterministic_discrimination");
  });
});

describe("captured evaluate payload after four observations", () => {
  const [leader, alternative] = observed.report.candidates;

  it("keeps the Matrix order and treats both as compared", () => {
    expect(leader.scientific_name).toBe("Angraecum sesquipedale");
    expect(alternative.scientific_name).toBe("Angraecum eburneum");
    expect(candidateRankState(leader)).toBe("compared");
    expect(candidateRankState(alternative)).toBe("compared");
  });

  it("groups characters exactly by the backend status", () => {
    const lead = groupCharacterEvidence(leader);
    expect(lead.supporting.map((item) => item.character)).toEqual(["spur_length_mm", "flower_shape"]);
    expect(lead.partial.map((item) => item.character)).toEqual(["flower_color"]);
    expect(lead.ignoredUnknown.map((item) => item.character)).toEqual(["labellum_color"]);

    const alt = groupCharacterEvidence(alternative);
    expect(alt.conflicting.map((item) => item.character)).toEqual(["spur_length_mm"]);
    expect(alt.missing.map((item) => item.character)).toEqual(["flower_shape"]);
    expect(alt.supporting).toEqual([]);
  });

  it("reconstructs the backend score and coverage from its own weights", () => {
    for (const candidate of observed.report.candidates) {
      const basis = scoreBasis(candidate);
      expect(basis.comparedWeight).toBe(candidate.compared_weight);
      expect(basis.possibleWeight).toBe(candidate.possible_weight);
      expect(basis.contributionTotal / basis.comparedWeight).toBeCloseTo(candidate.score, 5);
      expect(basis.comparedWeight / basis.possibleWeight).toBeCloseTo(candidate.coverage, 5);
    }
  });

  it("renders recorded ranges and unrecorded states without inventing values", () => {
    const spur = leader.explanations.find((item) => item.character === "spur_length_mm");
    expect(formatMatrixValue(spur?.candidate_state)).toBe("250–350");
    expect(formatMatrixValue(spur?.observation)).toBe("300");
    const missing = alternative.explanations.find((item) => item.character === "flower_shape");
    expect(formatMatrixValue(missing?.candidate_state)).toBe("not recorded");
    expect(characterStatusLabel("candidate_state_missing")).toBe("not recorded for this candidate");
    expect(formatMatrixValue(["white", "green"])).toBe("white, green");
  });

  it("surfaces candidate provenance and the review-required registry state", () => {
    expect(provenanceEntries(leader.provenance)).toEqual([["source", "governed fixture"]]);
    expect(observed.report.registry?.publication_state).toBe("review_required");
    expect(observed.report.observation_count).toBe(4);
    expect(observed.report.compared_character_count).toBe(3);
  });

  it("never renders locality-shaped provenance keys", () => {
    expect(provenanceEntries({ source: "herbarium", decimal_latitude: 1, longitude: 2, locality: "x", coordinates: [1, 2] }))
      .toEqual([["source", "herbarium"]]);
  });

  it("withholds camelCase, site/GPS/elevation/verbatim keys and nested locality at any depth", () => {
    expect(
      provenanceEntries({
        source: "herbarium",
        decimalLatitude: 1,
        verbatimLocality: "x",
        collectionSite: "y",
        gpsFix: "z",
        elevationM: 1200,
        footprintWKT: "POINT(1 2)",
        latLng: [1, 2],
        specimen: { catalog: "c-1", origin: { geo: { decimalLongitude: 2 } } },
        records: [{ id: "r-1" }, { locationId: "l-1" }],
        reviewer: { name: "curator" },
      }),
    ).toEqual([
      ["source", "herbarium"],
      ["reviewer", JSON.stringify({ name: "curator" })],
    ]);
  });
});

describe("captured explain payload", () => {
  it("exposes who produced the text and that it is explanation, not evidence", () => {
    expect(explanationProvenance(explain)).toEqual({
      provider: "matrix-deterministic-governed",
      model: "calyx-matrix-explanation-v1",
      epistemicState: "explanation_not_evidence",
      fallbackError: null,
    });
    expect(explanationText(explain)).toContain("not a verified taxonomic identification");
  });

  it("keeps the structured character lists in Matrix order", () => {
    const candidates = explanationCandidates(explain);
    expect(candidates.map((item) => item.taxon_id)).toEqual(explain.evidence?.candidate_order);
    expect(candidates[1].conflicting_characters).toEqual(["spur_length_mm"]);
    expect(candidates[1].missing_characters).toEqual(["flower_shape"]);
  });
});
