import { afterEach, describe, expect, it, vi } from "vitest";

import {
  attachVisionAnalysis,
  coerceObservationValue,
  explanationText,
  getVisionCapabilityStatus,
  reviewVisionSuggestion,
} from "./matrixIdentification";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("guided Matrix observation handling", () => {
  it("preserves numeric measurements as numbers for numeric characters", () => {
    expect(coerceObservationValue("300", "numeric_range")).toBe(300);
    expect(coerceObservationValue("12.5", "numeric")).toBe(12.5);
  });

  it("does not invent numeric values from invalid measurements", () => {
    expect(coerceObservationValue("about 30", "numeric_range")).toBe("about 30");
  });

  it("supports comma-delimited multi-state observations without affecting single values", () => {
    expect(coerceObservationValue("white, greenish-white", "multi_state")).toEqual([
      "white",
      "greenish-white",
    ]);
    expect(coerceObservationValue("star-shaped", "categorical")).toBe("star-shaped");
  });
});

describe("Calyx explanation rendering", () => {
  it("reads the governed structured narrative text without interpreting invariants as prose", () => {
    expect(explanationText({
      narrative: {
        text: "Observe the spur next.",
        epistemic_state: "explanation_not_evidence",
      },
      invariants: { provider_output_mutates_matrix_state: false },
    })).toBe("Observe the spur next.");
    expect(explanationText({ narrative: "Candidate A is better supported." })).toBe(
      "Candidate A is better supported.",
    );
    expect(explanationText({ invariants: { provider_output_mutates_matrix_state: false } })).toBe("");
  });
});

describe("Vision review API contract", () => {
  it("reads the governed Vision status without requesting inference", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        persistence_mode: "memory",
        durable_persistence_enabled: false,
        schema_ready: false,
        live_inference_enabled: false,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const status = await getVisionCapabilityStatus();

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/vision-lexicon/status");
    expect(init.method).toBeUndefined();
    expect(status.live_inference_enabled).toBe(false);
    expect(status.durable_persistence_enabled).toBe(false);
  });

  it("attaches an existing governed analysis to the session review queue", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ session_id: "s1", analysis_id: "a1", added: 0, suggestions: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await attachVisionAnalysis("s1", "a1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/matrix-identification/sessions/s1/vision/analyses/a1/suggestions");
    expect(init.method).toBe("POST");
  });

  it("sends explicit reviewer certainty and revised value instead of interpreting machine prose", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ session: {}, suggestion: {}, observation_added: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await reviewVisionSuggestion("s1", "v1", "revise", {
      certainty: "certain",
      revisedValue: 300,
      comments: "reviewed measurement",
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      decision: "revise",
      certainty: "certain",
      revised_value: 300,
      comments: "reviewed measurement",
    });
  });
});
